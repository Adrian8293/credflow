// lib/opca-form-reader.js
// FREE OPCA extraction: reads values straight from the PDF's fillable AcroForm fields (pdf-lib,
// no external service). It is the reverse of the field mapping in lib/opca-pdf-filler.js and only
// covers the credentialing-critical 2025-form fields below. Free-text sections (work history,
// references, CME, education tables) are NOT read — enter those manually or enable FEATURE_AI.
// Deliberately NOT read (data minimisation): SSN, birth date/place, citizenship, race/ethnicity,
// disability, federal tax ID.
import { PDFDocument, PDFName } from 'pdf-lib'

function valueToString(v) {
  if (!v) return null
  try {
    if (typeof v.decodeText === 'function') return v.decodeText().trim() || null
    if (v instanceof PDFName) return v.decodeText().replace(/^\//, '') || null
    if (typeof v.asString === 'function') return v.asString().trim() || null
  } catch { /* ignore */ }
  return null
}

/** Walk the AcroForm tree → Map(fieldName → string). Keys: partial name AND full dotted name. */
export async function readFormFields(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  const acro = doc.catalog.lookup(PDFName.of('AcroForm'))
  const out = new Map()
  if (!acro || !acro.get) return out
  const walk = (arr, prefix, depth = 0) => {
    if (!arr || depth > 12) return
    for (let i = 0; i < arr.size(); i++) {
      try {
        const dict = doc.context.lookup(arr.get(i))
        if (!dict || !dict.get) continue
        const t = valueToString(dict.get(PDFName.of('T')))
        const full = t ? (prefix ? `${prefix}.${t}` : t) : prefix
        const kids = dict.lookup ? dict.lookup(PDFName.of('Kids')) : null
        if (kids && kids.size) walk(kids, full, depth + 1)
        const val = valueToString(dict.lookup(PDFName.of('V')))
        if (t && val != null) {
          if (!out.has(t)) out.set(t, val)
          if (!out.has(full)) out.set(full, val)
        }
      } catch { /* skip a bad field */ }
    }
  }
  walk(doc.context.lookup(acro.get(PDFName.of('Fields'))), '')
  return out
}

const iso = (m, d, y) => {
  if (!m || !d || !y) return null
  const mm = String(m).padStart(2, '0'), dd = String(d).padStart(2, '0')
  return /^\d{4}$/.test(String(y)) && /^\d{2}$/.test(mm) && /^\d{2}$/.test(dd) ? `${y}-${mm}-${dd}` : null
}

/** Returns { extracted, fieldsFound } where extracted matches the shape opca-extract expects. */
export async function extractOpcaFromFormFields(buffer) {
  const f = await readFormFields(buffer)
  const g = (k) => f.get(k) ?? null
  const fieldsFound = [...f.values()].filter(Boolean).length

  const certs = [1, 2].map((n) => ({
    board_name: g(`Name and address of issuing boardRow1.0.${n - 1}`),
    cert_number: g(`Board Certification Number - ${n}`),
    specialty: g(`Specialty1.11.0.${n - 1}`),
  })).filter((c) => c.board_name || c.cert_number || c.specialty)

  const extracted = {
    form_version: '2025',
    practitioner_info: {
      last_name: g('Last Name include suffix Jr Sr III.0'),
      first_name: g('First'),
      middle_name: g('Middle'),
      degree: g('Degrees'),
      other_names: g('name and year used'),
      home_address: g('Home street address'),
      home_email: g('Email address'),
      home_city: g('City'),
      home_state: g('State'),
      home_zip: g('ZIP'),
    },
    specialty: {},
    practice_info: {},
    board_certs: certs,
    licensure: {
      oregon_license_number: g('Oregon license or registration number'),
      oregon_license_type: g('Type_6'),
      oregon_license_exp: iso(g('Month of expiration'), g('Day of expiration'), g('Year of expiration')),
      dea_number: g('Drug Enforcement Administration DEA registration number if applicable'),
      dea_issue_date: iso(g('issueMonth'), g('IssueDate'), g('issuedYear')),
      dea_exp: iso(g('Month of issue2'), g('Day of issue'), g('Year of expiration2')),
      csr_number: g('Controlled substance registration CSR number if applicable'),
      individual_npi: g('Entity type 1 individual NPI number'),
      medicare_number: g('Medicare number'),
    },
    malpractice: {
      current: {
        carrier: g('Current insurance carrier  provider of professional liability coverage'),
        policy_number: g('Policy number.3.0'),
        local_contact: g('Name of local contact.3.0'),
        mailing_address: g('Mailing address.3.0'),
        aggregate: g('Aggregate amount.3.0'),
        // Expiration date field IDs are not in the filler mapping; entered during review.
      },
      prior: [],
    },
  }
  return { extracted, fieldsFound }
}
