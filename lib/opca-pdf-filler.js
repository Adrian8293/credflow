// lib/opca-pdf-filler.js
// Fills the official blank 2025 OPCA PDF using actual fillable field IDs
// extracted from the PDF. Returns a filled PDF as a Buffer.
//
// Usage:
//   const pdfBytes = await fillOpcaPdf({ templateBuffer, profile, initials })
//
// Requires: npm install pdf-lib

import { PDFDocument } from 'pdf-lib'

/**
 * Build field_values array from an opca_profiles record.
 * Field IDs come directly from opca-field-info.json (900 real fields).
 */
function buildFieldValues(profile, initials) {
  const pi = profile  // flat row from opca_profiles
  const board_certs = safeArray(pi.board_certs)
  const work_history = safeArray(pi.work_history)
  const peer_refs = safeArray(pi.peer_references)
  const cme = safeArray(pi.cme_activities)
  const mal_prior = safeArray(pi.prior_malpractice)
  const other_licenses = safeArray(pi.other_licenses)
  const current_affiliations = safeArray(pi.current_affiliations)
  const previous_affiliations = safeArray(pi.previous_affiliations)
  const call_coverage = safeArray(pi.call_coverage)
  const professional_schools = safeArray(pi.professional_schools)
  const residencies = safeArray(pi.residencies)
  const current_mal = safeObj(pi.current_malpractice)
  const attestation = safeObj(pi.attestation)
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

  // ─── Initials per page ────────────────────────────────────────────────────
  const initialFields = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(page => ({
    field_id: `Initials${page > 3 ? page - 2 : ''}`, page, value: initials || ''
  }))

  return [
    // ─── Page 3: Practitioner Info ──────────────────────────────────────────
    { field_id: 'Last Name include suffix Jr Sr III.0', page: 3, value: pi.last_name || '' },
    { field_id: 'First',                                page: 3, value: pi.first_name || '' },
    { field_id: 'Middle',                               page: 3, value: pi.middle_name || '' },
    { field_id: 'Degrees',                              page: 3, value: pi.degree || '' },
    { field_id: 'name and year used',                   page: 3, value: pi.other_names || '' },
    { field_id: 'Home street address',                  page: 3, value: pi.home_address || '' },
    { field_id: 'Email address',                        page: 3, value: pi.home_email || '' },
    { field_id: 'City',                                 page: 3, value: pi.home_city || '' },
    { field_id: 'State',                                page: 3, value: pi.home_state || '' },
    { field_id: 'ZIP',                                  page: 3, value: pi.home_zip || '' },
    { field_id: 'Birth date  Month',                    page: 3, value: pi.birth_date ? pi.birth_date.split('/')[0] || '' : '' },
    { field_id: 'Birth date  DAY',                      page: 3, value: pi.birth_date ? pi.birth_date.split('/')[1] || '' : '' },
    { field_id: 'Birth date  year',                     page: 3, value: pi.birth_date ? pi.birth_date.split('/')[2] || '' : '' },
    { field_id: 'Birth place',                          page: 3, value: pi.birth_place || '' },
    { field_id: 'Citizenship',                          page: 3, value: pi.citizenship || '' },
    { field_id: 'Social Security number',               page: 3, value: pi.ssn || '' },
    { field_id: 'Educational Commission for Foreign Medical Graduates ECFMG number if applicable', page: 3, value: pi.ecfmg_number || '' },
    { field_id: 'Provider race',                        page: 3, value: pi.reald_race || '' },
    { field_id: 'Provider ethnicity',                   page: 3, value: pi.reald_ethnicity || '' },
    { field_id: 'Provider primary language',            page: 3, value: pi.reald_language || '' },
    { field_id: 'Current disabilities',                 page: 3, value: pi.reald_disability || '' },
    // Other name used checkbox
    { field_id: pi.other_names ? 'Other name used YES' : 'Other name used NO', page: 3, value: pi.other_names ? 'Yes' : 'Off' },
    // Gender checkboxes: "Male" / "x" (Female) / "undefined" (X)
    ...(pi.gender === 'Male' ? [{ field_id: 'undefined_2', page: 3, value: 'On' }] : []),
    ...(pi.gender === 'Female' ? [{ field_id: 'x', page: 3, value: 'On' }] : []),
    ...(pi.gender === 'X' ? [{ field_id: 'undefined', page: 3, value: 'On' }] : []),
    // Specialty
    // Principal specialty goes in a text field on page 3
    { field_id: 'Do you want to be designated as a primary care practitioner PCP', page: 3, value: pi.is_pcp ? 'Yes' : 'Off' },

    // ─── Page 4: Board Certifications ───────────────────────────────────────
    ...(board_certs[0] ? [
      { field_id: 'Name and address of issuing boardRow1.0.0', page: 4, value: board_certs[0].board_name || '' },
      { field_id: 'Board Certification Number - 1',            page: 4, value: board_certs[0].cert_number || '' },
      { field_id: 'Specialty1.11.0.0',                         page: 4, value: board_certs[0].specialty || '' },
    ] : []),
    ...(board_certs[1] ? [
      { field_id: 'Name and address of issuing boardRow1.0.1', page: 4, value: board_certs[1].board_name || '' },
      { field_id: 'Board Certification Number - 2',            page: 4, value: board_certs[1].cert_number || '' },
      { field_id: 'Specialty1.11.0.1',                         page: 4, value: board_certs[1].specialty || '' },
    ] : []),

    // ─── Page 6: Call Coverage & Education ──────────────────────────────────
    ...(call_coverage[0] ? [
      { field_id: 'Specialty1.0', page: 6, value: call_coverage[0].name || '' },
      { field_id: 'Specialty1.1', page: 6, value: call_coverage[0].specialty || '' },
    ] : []),
    ...(call_coverage[1] ? [
      { field_id: 'Specialty2.0', page: 6, value: call_coverage[1].name || '' },
      { field_id: 'Specialty2.1', page: 6, value: call_coverage[1].specialty || '' },
    ] : []),
    ...(call_coverage[2] ? [
      { field_id: 'Specialty3.0', page: 6, value: call_coverage[2].name || '' },
      { field_id: 'Specialty3.1', page: 6, value: call_coverage[2].specialty || '' },
    ] : []),
    // Undergrad
    { field_id: 'Complete school name and street address.0', page: 6, value: pi.undergraduate_school || '' },
    { field_id: 'Degree received',                           page: 6, value: pi.undergraduate_degree || '' },
    // Professional school (first)
    ...(professional_schools[0] ? [
      { field_id: 'Complete medical/professional school name and street address.0', page: 6, value: professional_schools[0].name || '' },
      { field_id: 'Degree received.0',                                              page: 6, value: professional_schools[0].degree || '' },
    ] : []),

    // ─── Page 8: Licensure ───────────────────────────────────────────────────
    { field_id: 'Oregon license or registration number', page: 8, value: pi.oregon_license_number || '' },
    { field_id: 'Type_6',                                page: 8, value: pi.oregon_license_type || '' },
    { field_id: 'Month of expiration',                   page: 8, value: monthOf(pi.oregon_license_exp) },
    { field_id: 'Day of expiration',                     page: 8, value: dayOf(pi.oregon_license_exp) },
    { field_id: 'Year of expiration',                    page: 8, value: yearOf(pi.oregon_license_exp) },
    { field_id: 'Drug Enforcement Administration DEA registration number if applicable', page: 8, value: pi.dea_number || '' },
    { field_id: 'issueMonth',                            page: 8, value: monthOf(pi.dea_issue_date) },
    { field_id: 'IssueDate',                             page: 8, value: dayOf(pi.dea_issue_date) },
    { field_id: 'issuedYear',                            page: 8, value: yearOf(pi.dea_issue_date) },
    { field_id: 'Month of issue2',                       page: 8, value: monthOf(pi.dea_exp) },
    { field_id: 'Day of issue',                          page: 8, value: dayOf(pi.dea_exp) },
    { field_id: 'Year of expiration2',                   page: 8, value: yearOf(pi.dea_exp) },
    { field_id: 'Controlled substance registration CSR number if applicable', page: 8, value: pi.csr_number || '' },
    { field_id: 'Entity type 1 individual NPI number',   page: 8, value: pi.individual_npi || '' },
    { field_id: 'Medicare number',                       page: 8, value: pi.medicare_number || '' },

    // ─── Page 11: Work History ────────────────────────────────────────────────
    ...(work_history[0] ? [
      { field_id: 'Name of current practice  employer.1.2', page: 11, value: work_history[0].employer || '' },
      { field_id: 'Contacts name.1.2',                     page: 11, value: work_history[0].contact_name || '' },
      { field_id: 'position 1.2',                          page: 11, value: work_history[0].position || '' },
      { field_id: 'Complete address_10.1.2',               page: 11, value: work_history[0].address || '' },
    ] : []),

    // ─── Page 12: Peer References & CME ─────────────────────────────────────
    ...(peer_refs[0] ? [
      { field_id: 'Complete address include department if applicable.0.2', page: 12, value: peer_refs[0].address || '' },
      { field_id: 'Credentials_5.0.0.2',                                   page: 12, value: peer_refs[0].credentials || '' },
      { field_id: 'Professional relationship.0.2',                         page: 12, value: peer_refs[0].relationship || '' },
      { field_id: 'Email address if available.0.2',                        page: 12, value: peer_refs[0].email || '' },
    ] : []),
    ...(cme[0] ? [
      { field_id: 'Name_2',          page: 12, value: cme[0].name || '' },
      { field_id: 'Month attended',  page: 12, value: monthOf(cme[0].date) },
      { field_id: 'Year attended',   page: 12, value: yearOf(cme[0].date) },
    ] : []),

    // ─── Page 13: Professional Liability ────────────────────────────────────
    { field_id: 'Current insurance carrier  provider of professional liability coverage', page: 13, value: current_mal.carrier || '' },
    { field_id: 'Policy number.3.0',     page: 13, value: current_mal.policy_number || '' },
    { field_id: 'Name of local contact.3.0', page: 13, value: current_mal.local_contact || '' },
    { field_id: 'Mailing address.3.0',   page: 13, value: current_mal.mailing_address || '' },
    { field_id: 'Aggregate amount.3.0',  page: 13, value: current_mal.aggregate || '' },
    // Coverage type checkbox
    ...(current_mal.coverage_type === 'Claims-made' ? [{ field_id: 'Claimsmade.3.0', page: 13, value: 'On' }] : []),
    ...(current_mal.coverage_type === 'Occurrence' ? [{ field_id: 'Occurrence.3.0', page: 13, value: 'On' }] : []),

    // ─── Page 14: Attestation (A=Check Box18, B=19, ..., O=Check Box32) ─────
    ...buildAttestationFields(attestation),

    // Signature page date
    { field_id: 'Date_11', page: 14, value: today },

    // ─── Page 15: Authorization ──────────────────────────────────────────────
    { field_id: 'Printed name', page: 15, value: `${pi.first_name || ''} ${pi.last_name || ''}`.trim() },
    { field_id: 'Date_12',      page: 15, value: today },
  ]
}

// Attestation questions A–O map to Check Box18–32 (then 33–47 for NO boxes)
// YES = checked, NO = unchecked on the YES box
// Box18=A-YES, Box19=B-YES, etc.
function buildAttestationFields(attestation) {
  const questions = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N']
  const fields = []
  questions.forEach((q, i) => {
    const answer = attestation[q]
    if (answer === 'YES') {
      fields.push({ field_id: `Check Box${18 + i}`, page: 14, value: '/Yes' })
    }
    // NO is the default/unchecked state — no need to set
  })
  // Question O (attestation check — checked means NO conditions)
  if (attestation['O'] === true || attestation['O'] === 'NO') {
    fields.push({ field_id: 'Check Box45', page: 14, value: '/Yes' })
  }
  return fields
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function monthOf(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return isNaN(d) ? '' : String(d.getMonth() + 1).padStart(2, '0')
}
function dayOf(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return isNaN(d) ? '' : String(d.getDate()).padStart(2, '0')
}
function yearOf(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return isNaN(d) ? '' : String(d.getFullYear())
}
function safeArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') { try { return JSON.parse(val) } catch {} }
  return []
}
function safeObj(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val
  if (typeof val === 'string') { try { return JSON.parse(val) } catch {} }
  return {}
}

// ─── Main fill function ───────────────────────────────────────────────────────
/**
 * @param {Buffer} templateBuffer - Bytes of the blank 2025 OPCA PDF
 * @param {Object} profile        - Row from opca_profiles
 * @param {string} initials       - Provider initials (e.g. "JSD")
 * @returns {Promise<Buffer>}     - Filled PDF bytes
 */
export async function fillOpcaPdf({ templateBuffer, profile, initials }) {
  const pdfDoc = await PDFDocument.load(templateBuffer)
  const form = pdfDoc.getForm()

  const fieldValues = buildFieldValues(profile, initials)

  for (const { field_id, value } of fieldValues) {
    try {
      const field = form.getFieldMaybe(field_id)
      if (!field) continue

      const fieldType = field.constructor.name
      if (fieldType === 'PDFTextField') {
        field.setText(value || '')
      } else if (fieldType === 'PDFCheckBox') {
        if (value === 'On' || value === '/Yes' || value === 'Yes') {
          field.check()
        } else {
          field.uncheck()
        }
      } else if (fieldType === 'PDFRadioGroup') {
        try { field.select(value) } catch {}
      }
    } catch (err) {
      // Silently skip fields that don't match — don't crash on one bad field
      console.warn(`[opca-pdf-filler] Skipped field "${field_id}": ${err.message}`)
    }
  }

  // Flatten the form so it prints exactly as filled (no editable overlays)
  form.flatten()

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
