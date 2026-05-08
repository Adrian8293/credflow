// pages/api/opca-extract.js
// POST multipart/form-data: { file: PDF, providerId, formVersion }
// 1. Receives an uploaded OPCA PDF (2023, 2024, or 2025)
// 2. Sends it to Claude claude-sonnet-4-20250514 for structured extraction
// 3. Saves result to opca_profiles as source of truth
// 4. Returns the extracted profile

import { IncomingForm } from 'formidable'
import fs from 'fs'
import { requireAuth, supabaseAdmin } from '../../lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { enforceRateLimit } from '../../lib/api-middleware'

export const config = {
  api: { bodyParser: false },
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─── System prompt for extraction ──────────────────────────────────────────────
const MAX_PDF_BYTES = 20 * 1024 * 1024
const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf'])

function buildProviderSyncSuggestions(provider, licensure, malpractice) {
  const candidates = {
    npi: licensure.individual_npi,
    dea: licensure.dea_number,
    dea_exp: licensure.dea_exp,
    license: licensure.oregon_license_number,
    license_exp: licensure.oregon_license_exp,
    mal_carrier: malpractice.current?.carrier,
    mal_policy: malpractice.current?.policy_number,
    mal_exp: malpractice.current?.expiration_date,
  }

  return Object.entries(candidates)
    .filter(([, extracted]) => extracted)
    .map(([field, extracted]) => ({
      field,
      current: provider?.[field] ?? null,
      extracted,
      differs: provider?.[field] ? String(provider[field]) !== String(extracted) : true,
    }))
}

const EXTRACTION_SYSTEM_PROMPT = `You are a medical credentialing specialist. You will receive a filled Oregon Practitioner Credentialing Application (OPCA) PDF.

Extract ALL data from the form and return a single JSON object. For empty/blank fields return null. For Yes/No questions return "YES" or "NO".

Return ONLY valid JSON with this exact structure:
{
  "form_version": "2023" | "2024" | "2025",
  "practitioner_info": {
    "last_name": null,
    "first_name": null,
    "middle_name": null,
    "degree": null,
    "other_names": null,
    "home_address": null,
    "home_phone": null,
    "mobile_phone": null,
    "home_email": null,
    "home_city": null,
    "home_state": null,
    "home_zip": null,
    "birth_date": null,
    "birth_place": null,
    "citizenship": null,
    "gender": null,  // SSN intentionally excluded — never extracted or stored (C-3)
    "ecfmg_number": null,
    "reald_race": null,
    "reald_ethnicity": null,
    "reald_language": null,
    "reald_disability": null
  },
  "specialty": {
    "principal_specialty": null,
    "taxonomy_code": null,
    "additional_specialties": null,
    "is_pcp": false
  },
  "board_certs": [
    { "board_name": null, "cert_number": null, "specialty": null, "certified_date": null, "expiration_date": null }
  ],
  "other_certs": [
    { "type": null, "number": null, "certified_date": null, "expiration_date": null }
  ],
  "practice_info": {
    "primary_practice_name": null,
    "primary_practice_address": null,
    "primary_practice_city": null,
    "primary_practice_state": null,
    "primary_practice_zip": null,
    "primary_practice_phone": null,
    "primary_practice_fax": null,
    "primary_npi_group": null,
    "billing_address": null,
    "office_manager": null,
    "office_manager_phone": null,
    "credentialing_contact": null,
    "federal_tax_id": null,
    "tax_id_name": null,
    "secondary_practices": []
  },
  "call_coverage": [
    { "name": null, "specialty": null }
  ],
  "education": {
    "undergraduate_school": null,
    "undergraduate_degree": null,
    "undergraduate_start": null,
    "undergraduate_end": null,
    "graduate_school": null,
    "graduate_degree": null,
    "graduate_start": null,
    "graduate_end": null,
    "professional_schools": [],
    "internship": {},
    "residencies": [],
    "fellowships": []
  },
  "licensure": {
    "oregon_license_number": null,
    "oregon_license_type": null,
    "oregon_license_exp": null,
    "dea_number": null,
    "dea_issue_date": null,
    "dea_exp": null,
    "csr_number": null,
    "csr_issue_date": null,
    "individual_npi": null,
    "medicare_number": null,
    "oregon_medicaid_number": null,
    "pa_collaborating_physician": null,
    "other_licenses": []
  },
  "affiliations": {
    "current_affiliations": [],
    "pending_applications": [],
    "previous_affiliations": []
  },
  "work_history": [],
  "work_history_gaps": [],
  "peer_references": [],
  "cme_activities": [],
  "malpractice": {
    "current": {},
    "prior": []
  },
  "attestation": {
    "A": null, "B": null, "C": null, "D": null, "E": null,
    "F": null, "G": null, "H": null, "I": null, "J": null,
    "K": null, "L": null, "M": null, "N": null, "O": null
  }
}

Infer the form_version from any visible date or version stamp on the document. If unclear, examine the structure — 2025 forms include a REALD section and DEA issue date; 2024 and 2023 may not.`

// ─── Main handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!enforceRateLimit(req, res, { max: 6, windowMs: 60_000, keyPrefix: 'opca-extract:' })) return

  // Auth check — must happen before form parsing since bodyParser is disabled.
  // requireAuth reads the session from cookies, not the body.
  const user = await requireAuth(req, res)
  if (!user) return

  // Parse multipart form
  const form = new IncomingForm({
    maxFileSize: MAX_PDF_BYTES,
    filter: part => part.name !== 'file' || PDF_MIME_TYPES.has(part.mimetype || ''),
  })
  let fields, files
  try {
    ;[fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, f, fi) => (err ? reject(err) : resolve([f, fi])))
    })
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse upload: ' + err.message })
  }

  const providerId = Array.isArray(fields.providerId) ? fields.providerId[0] : fields.providerId
  const pdfFile = files.file?.[0] || files.file

  if (!providerId) return res.status(400).json({ error: 'providerId is required' })
  if (!pdfFile) return res.status(400).json({ error: 'No PDF file uploaded' })
  if (!PDF_MIME_TYPES.has(pdfFile.mimetype || '')) {
    return res.status(400).json({ error: 'Only PDF uploads are supported.' })
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return res.status(413).json({ error: 'PDF must be 20MB or smaller.' })
  }

  // Read PDF as base64
  let pdfBase64
  let pdfBuffer
  try {
    pdfBuffer = fs.readFileSync(pdfFile.filepath)
    if (pdfBuffer.subarray(0, 4).toString() !== '%PDF') {
      return res.status(400).json({ error: 'Uploaded file is not a valid PDF.' })
    }
    pdfBase64 = pdfBuffer.toString('base64')
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read uploaded file: ' + err.message })
  }

  // ── Send to Claude for extraction ──────────────────────────────────────────
  let extractedData
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8192,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: 'Extract all data from this OPCA form and return the JSON object as specified.',
            },
          ],
        },
      ],
    })

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Strip any markdown fences
    const clean = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    extractedData = JSON.parse(clean)
    if (extractedData.practice_info) extractedData.practice_info.federal_tax_id = null
  } catch (err) {
    console.error('[opca-extract] Claude extraction failed:', err)
    return res.status(500).json({ error: 'Extraction failed: ' + err.message })
  }

  // ── Map to opca_profiles columns ───────────────────────────────────────────
  const pi = extractedData.practitioner_info || {}
  const sp = extractedData.specialty || {}
  const pr = extractedData.practice_info || {}
  const ed = extractedData.education || {}
  const li = extractedData.licensure || {}
  const af = extractedData.affiliations || {}
  const ml = extractedData.malpractice || {}

  const profileRow = {
    provider_id:    providerId,
    form_version:   extractedData.form_version || '2025',
    source:         'uploaded',

    // Practitioner Info
    last_name:      pi.last_name,
    first_name:     pi.first_name,
    middle_name:    pi.middle_name,
    degree:         pi.degree,
    other_names:    pi.other_names,
    home_address:   pi.home_address,
    home_phone:     pi.home_phone,
    mobile_phone:   pi.mobile_phone,
    home_email:     pi.home_email,
    home_city:      pi.home_city,
    home_state:     pi.home_state,
    home_zip:       pi.home_zip,
    birth_date:     pi.birth_date,
    birth_place:    pi.birth_place,
    citizenship:    pi.citizenship,
    // ssn intentionally omitted — never stored in DB (C-3)
    gender:         pi.gender,
    ecfmg_number:   pi.ecfmg_number,
    reald_race:     pi.reald_race,
    reald_ethnicity: pi.reald_ethnicity,
    reald_language: pi.reald_language,
    reald_disability: pi.reald_disability,

    // Specialty
    principal_specialty:   sp.principal_specialty,
    taxonomy_code:         sp.taxonomy_code,
    additional_specialties: sp.additional_specialties,
    is_pcp:                sp.is_pcp || false,

    // Certifications
    board_certs:    JSON.stringify(extractedData.board_certs || []),
    other_certs:    JSON.stringify(extractedData.other_certs || []),

    // Practice
    primary_practice_name:    pr.primary_practice_name,
    primary_practice_address: pr.primary_practice_address,
    primary_practice_city:    pr.primary_practice_city,
    primary_practice_state:   pr.primary_practice_state,
    primary_practice_zip:     pr.primary_practice_zip,
    primary_practice_phone:   pr.primary_practice_phone,
    primary_practice_fax:     pr.primary_practice_fax,
    primary_npi_group:        pr.primary_npi_group,
    billing_address:          pr.billing_address,
    office_manager:           pr.office_manager,
    office_manager_phone:     pr.office_manager_phone,
    credentialing_contact:    pr.credentialing_contact,
    federal_tax_id:           null,
    tax_id_name:              pr.tax_id_name,
    secondary_practices:      JSON.stringify(pr.secondary_practices || []),

    // Call coverage
    call_coverage:  JSON.stringify(extractedData.call_coverage || []),

    // Education
    undergraduate_school:  ed.undergraduate_school,
    undergraduate_degree:  ed.undergraduate_degree,
    undergraduate_start:   ed.undergraduate_start,
    undergraduate_end:     ed.undergraduate_end,
    graduate_school:       ed.graduate_school,
    graduate_degree:       ed.graduate_degree,
    graduate_start:        ed.graduate_start,
    graduate_end:          ed.graduate_end,
    professional_schools:  JSON.stringify(ed.professional_schools || []),
    internship:            JSON.stringify(ed.internship || {}),
    residencies:           JSON.stringify(ed.residencies || []),
    fellowships:           JSON.stringify(ed.fellowships || []),

    // Licensure
    oregon_license_number:  li.oregon_license_number,
    oregon_license_type:    li.oregon_license_type,
    oregon_license_exp:     li.oregon_license_exp,
    dea_number:             li.dea_number,
    dea_issue_date:         li.dea_issue_date,
    dea_exp:                li.dea_exp,
    csr_number:             li.csr_number,
    csr_issue_date:         li.csr_issue_date,
    individual_npi:         li.individual_npi,
    medicare_number:        li.medicare_number,
    oregon_medicaid_number: li.oregon_medicaid_number,
    pa_collaborating_physician: li.pa_collaborating_physician,
    other_licenses:         JSON.stringify(li.other_licenses || []),

    // Affiliations
    current_affiliations:  JSON.stringify(af.current_affiliations || []),
    pending_applications:  JSON.stringify(af.pending_applications || []),
    previous_affiliations: JSON.stringify(af.previous_affiliations || []),

    // Work History
    work_history:       JSON.stringify(extractedData.work_history || []),
    work_history_gaps:  JSON.stringify(extractedData.work_history_gaps || []),

    // Peers, CME, Malpractice, Attestation
    peer_references:  JSON.stringify(extractedData.peer_references || []),
    cme_activities:   JSON.stringify(extractedData.cme_activities || []),
    current_malpractice: JSON.stringify(ml.current || {}),
    prior_malpractice:   JSON.stringify(ml.prior || []),
    attestation:      JSON.stringify(extractedData.attestation || {}),

    // Raw extraction for debugging
    raw_extraction: JSON.stringify(extractedData),
  }

  // Save to Supabase
  const { data: saved, error: saveError } = await supabaseAdmin
    .from('opca_profiles')
    .insert([profileRow])
    .select()
    .single()

  if (saveError) {
    console.error('[opca-extract] DB save failed:', saveError)
    return res.status(500).json({ error: 'Failed to save profile: ' + saveError.message })
  }

  const { data: provider } = await supabaseAdmin
    .from('providers')
    .select('npi, dea, dea_exp, license, license_exp, mal_carrier, mal_policy, mal_exp')
    .eq('id', providerId)
    .single()

  return res.status(200).json({
    success: true,
    profileId: saved.id,
    formVersion: saved.form_version,
    provider: `${pi.first_name || ''} ${pi.last_name || ''}`.trim(),
    fieldsExtracted: Object.keys(extractedData).length,
    providerSyncSuggestions: buildProviderSyncSuggestions(provider, li, ml),
    sensitiveFieldsRedacted: ['federal_tax_id'],
    message: 'OPCA data extracted and saved for review. Provider fields were not overwritten.',
  })
}
