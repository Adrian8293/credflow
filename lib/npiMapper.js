/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CredFlow — NPI Registry API Mapper
 *  FILE: lib/npiMapper.js
 *
 *  Transforms the raw CMS NPI Registry v2.1 response into a clean shape
 *  suitable for:
 *    • The Provider Card UI (summary panel)
 *    • Pre-filling the Add/Edit Provider form
 *    • Diffing against an existing provider record to detect stale data
 *
 *  Usage:
 *    import { mapNpiResponse, diffNpiVsProvider } from '@/lib/npiMapper'
 *
 *    const res  = await fetch('/api/npi?number=1234567890')
 *    const json = await res.json()
 *    const card = mapNpiResponse(json)          // → ProviderCard shape
 *    const diff = diffNpiVsProvider(card, prov) // → array of changed fields
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Taxonomy → Specialty / Credential map ────────────────────────────────────
// Subset relevant to Positive Inner Self disciplines.
// Extend as needed: https://nucc.org/index.php/code-sets-mainmenu-41
const TAXONOMY_MAP = {
  '101Y00000X': { spec: 'Counselor',                 cred: 'LMFT/LCSW/LPC' },
  '101YA0400X': { spec: 'Addiction Counselor',       cred: 'CADC' },
  '101YM0800X': { spec: 'Mental Health Counselor',   cred: 'LMHC' },
  '101YP1600X': { spec: 'Pastoral Counselor',        cred: 'PC' },
  '101YP2500X': { spec: 'Psychoanalyst',             cred: 'PA' },
  '101YS0200X': { spec: 'School Counselor',          cred: 'SC' },
  '103T00000X': { spec: 'Psychologist',              cred: 'PhD/PsyD' },
  '106H00000X': { spec: 'Marriage & Family Therapist', cred: 'LMFT' },
  '1041C0700X': { spec: 'Clinical Social Worker',   cred: 'LCSW' },
  '207Q00000X': { spec: 'Family Medicine',           cred: 'MD/DO' },
  '207R00000X': { spec: 'Internal Medicine',         cred: 'MD/DO' },
  '2084P0800X': { spec: 'Psychiatry',                cred: 'MD/DO' },
  '225100000X': { spec: 'Physical Therapist',        cred: 'PT/DPT' },
  '225600000X': { spec: 'Dance Therapist',           cred: 'DTR' },
  '225800000X': { spec: 'Recreational Therapist',    cred: 'CTRS' },
  '225X00000X': { spec: 'Occupational Therapist',    cred: 'OT/OTR' },
  '231H00000X': { spec: 'Audiologist',               cred: 'AuD' },
  '2355A2700X': { spec: 'Acupuncturist',             cred: 'LAc/DAc' },
  '246ZA2600X': { spec: 'Medical Technologist',      cred: 'MT' },
  '261QM1300X': { spec: 'Physical Therapy Clinic',   cred: '' },
  '261QR0200X': { spec: 'Rehab Clinic',              cred: '' },
  '282N00000X': { spec: 'General Acute Care Hospital', cred: '' },
  '305S00000X': { spec: 'Boarding School (Spec)',    cred: '' },
  '332B00000X': { spec: 'Durable Medical Equipment', cred: '' },
  '3336C0003X': { spec: 'Compound Pharmacy',         cred: '' },
  '363A00000X': { spec: "Physician Assistant",       cred: 'PA-C' },
  '363L00000X': { spec: 'Nurse Practitioner',        cred: 'NP/APRN' },
  '364S00000X': { spec: 'Psychiatric/Mental Health NP', cred: 'PMHNP' },
  '372500000X': { spec: 'Chiropractic Assistant',    cred: 'CA' },
  '111N00000X': { spec: 'Chiropractor',              cred: 'DC' },
  '152W00000X': { spec: 'Optometrist',               cred: 'OD' },
  '163W00000X': { spec: 'Registered Nurse',          cred: 'RN' },
  '174400000X': { spec: 'Naturopathic Physician',    cred: 'ND' },
  '175F00000X': { spec: 'Massage Therapist',         cred: 'LMT' },
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pickAddress(addresses = [], purposeCode = 'MAILING') {
  return (
    addresses.find(a => a.address_purpose === purposeCode) ||
    addresses[0] ||
    null
  )
}

function formatPhone(raw = '') {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return raw
}

function resolveTaxonomy(taxonomies = []) {
  const primary = taxonomies.find(t => t.primary) || taxonomies[0]
  if (!primary) return { spec: '', cred: '', taxonomyCode: '', taxonomyDesc: '' }
  const mapped = TAXONOMY_MAP[primary.code] || {}
  return {
    spec:         mapped.spec || primary.desc || '',
    cred:         mapped.cred || '',
    taxonomyCode: primary.code || '',
    taxonomyDesc: primary.desc || '',
    taxonomyState: primary.state || '',
    taxonomyLicense: primary.license || '',
  }
}

// ─── Main mapper ──────────────────────────────────────────────────────────────

/**
 * mapNpiResponse(apiJson) → ProviderCard
 *
 * Takes the raw object returned by CMS NPI Registry v2.1 and returns a flat,
 * UI-ready shape that maps cleanly onto the Provider form fields.
 *
 * If the registry returns no results, returns null.
 * If there's a registry error, throws so the caller can surface it.
 */
export function mapNpiResponse(apiJson) {
  if (!apiJson) return null

  if (apiJson.Errors?.length) {
    throw new Error(apiJson.Errors.map(e => e.description).join('; '))
  }

  const results = apiJson.results
  if (!results?.length) return null

  const r = results[0]

  // ── Basic identity ─────────────────────────────────────────────────────────
  const isOrg      = r.enumeration_type === 'NPI-2'
  const basic       = r.basic || {}

  const fname       = basic.first_name         || basic.authorized_official_first_name  || ''
  const lname       = basic.last_name          || basic.organization_name               || ''
  const mname       = basic.middle_name        || ''
  const suffix      = basic.name_suffix        || ''
  const gender      = basic.gender             || ''
  const credential  = basic.credential         || ''   // e.g. "MD", "LCSW"
  const soloFlag    = basic.sole_proprietor     || ''
  const status      = basic.status             || ''   // 'A' = active

  // ── Taxonomy / specialty ──────────────────────────────────────────────────
  const taxResult = resolveTaxonomy(r.taxonomies)

  // ── Addresses ────────────────────────────────────────────────────────────
  const mailingAddr  = pickAddress(r.addresses, 'MAILING')
  const practiceAddr = pickAddress(r.addresses, 'LOCATION')
  const addr         = practiceAddr || mailingAddr

  // ── License (from primary taxonomy) ──────────────────────────────────────
  const primaryTax    = r.taxonomies?.find(t => t.primary) || r.taxonomies?.[0]
  const licenseNumber = primaryTax?.license || ''
  const licenseState  = primaryTax?.state   || ''

  // ── Other identifiers (DEA, Medicaid, etc.) ───────────────────────────────
  const identifiers = r.identifiers || []
  const medicaid = identifiers.find(i =>
    i.desc?.toLowerCase().includes('medicaid') ||
    i.identifier?.startsWith('OR')
  )?.identifier || ''

  // ── Build the ProviderCard shape ──────────────────────────────────────────
  return {
    // Core identity
    npi:       r.number || '',
    npiType:   isOrg ? 'Organization (Type 2)' : 'Individual (Type 1)',
    npiStatus: status === 'A' ? 'Active' : status === 'D' ? 'Deactivated' : status,
    fname,
    lname,
    mname,
    suffix,
    gender,
    credential,    // raw credential string from NPI registry

    // Specialty / taxonomy
    spec:          taxResult.spec,
    cred:          taxResult.cred,         // mapped credential abbreviation
    taxonomyCode:  taxResult.taxonomyCode,
    taxonomyDesc:  taxResult.taxonomyDesc,
    taxonomyState: taxResult.taxonomyState,

    // License (from primary taxonomy)
    license:       licenseNumber,
    licenseState,

    // Contact
    phone: formatPhone(addr?.telephone_number || ''),
    fax:   formatPhone(addr?.fax_number       || ''),

    // Practice address
    address: addr ? [
      addr.address_1,
      addr.address_2,
    ].filter(Boolean).join(', ') : '',
    city:    addr?.city         || '',
    state:   addr?.state        || '',
    zip:     addr?.postal_code  || '',

    // Identifiers
    medicaid,
    identifiers,   // full array for advanced UI use

    // Org info (Type 2 only)
    isOrg,
    orgName:     isOrg ? (basic.organization_name || '') : '',
    soloFlag,

    // Enumeration dates
    enumerationDate: basic.enumeration_date     || '',
    lastUpdated:     basic.last_updated         || '',
    certificationDate: basic.certification_date || '',

    // Raw taxonomy list for the full picker UI
    allTaxonomies: (r.taxonomies || []).map(t => ({
      code:    t.code,
      desc:    t.desc,
      state:   t.state,
      license: t.license,
      primary: t.primary,
    })),

    // Other practice locations
    practiceLocations: (r.practiceLocations || []).map(pl => ({
      address: [pl.address_1, pl.address_2].filter(Boolean).join(', '),
      city:    pl.city,
      state:   pl.state,
      zip:     pl.postal_code,
      phone:   formatPhone(pl.telephone_number || ''),
    })),
  }
}

// ─── Diff: NPI card vs existing provider record ──────────────────────────────

/**
 * diffNpiVsProvider(npiCard, provider) → ChangedField[]
 *
 * Compares an NPI lookup result against an existing provider record.
 * Returns an array of fields where the registry data differs from what's stored.
 * Use this to surface "NPI data has changed — update?" prompts in the UI.
 *
 * ChangedField: { field, label, npiValue, storedValue }
 */
export function diffNpiVsProvider(npiCard, provider) {
  if (!npiCard || !provider) return []

  const COMPARE_FIELDS = [
    { field: 'fname',        label: 'First Name' },
    { field: 'lname',        label: 'Last Name' },
    { field: 'cred',         label: 'Credential' },
    { field: 'phone',        label: 'Phone' },
    { field: 'license',      label: 'License Number' },
    { field: 'spec',         label: 'Specialty' },
    { field: 'focus',        label: 'Specialty Focus' },
    { field: 'taxonomyCode', label: 'Taxonomy Code' },
    { field: 'taxonomyDesc', label: 'Taxonomy Description' },
  ]

  return COMPARE_FIELDS
    .map(({ field, label }) => {
      const npiVal     = (npiCard[field]  || '').trim().toLowerCase()
      const storedVal  = (provider[field] || '').trim().toLowerCase()
      if (npiVal && storedVal && npiVal !== storedVal) {
        return { field, label, npiValue: npiCard[field], storedValue: provider[field] }
      }
      return null
    })
    .filter(Boolean)
}

// ─── Pre-fill helper: NPI card → provider form defaults ──────────────────────

/**
 * npiCardToProviderDefaults(npiCard) → Partial<Provider>
 *
 * Returns a partial provider object you can spread into your form state
 * when pre-filling from an NPI lookup (Add Provider flow).
 * Only includes fields that have values — empty strings are omitted.
 */
export function npiCardToProviderDefaults(npiCard) {
  if (!npiCard) return {}
  const out = {}
  const pick = (key, val) => { if (val) out[key] = val }

  pick('npi',          npiCard.npi)
  pick('fname',        npiCard.fname)
  pick('lname',        npiCard.lname)
  pick('cred',         npiCard.cred || npiCard.credential)
  pick('spec',         npiCard.spec)
  pick('focus',        npiCard.taxonomyDesc)   // NPPES taxonomy description populates focus
  pick('taxonomyCode', npiCard.taxonomyCode)
  pick('taxonomyDesc', npiCard.taxonomyDesc)
  pick('phone',        npiCard.phone)
  pick('license',      npiCard.license)
  pick('medicaid',     npiCard.medicaid)
  pick('status',       npiCard.npiStatus === 'Active' ? 'Active' : 'Inactive')

  return out
}

// ─── ProviderCard UI shape (JSDoc for IntelliSense) ──────────────────────────
/**
 * @typedef {Object} ProviderCard
 * @property {string} npi
 * @property {'Individual (Type 1)'|'Organization (Type 2)'} npiType
 * @property {'Active'|'Deactivated'|string} npiStatus
 * @property {string} fname
 * @property {string} lname
 * @property {string} credential     Raw credential from NPI (e.g. "MD, FACP")
 * @property {string} cred           Mapped short cred (e.g. "LMFT")
 * @property {string} spec           Mapped specialty
 * @property {string} taxonomyCode
 * @property {string} taxonomyDesc
 * @property {string} phone
 * @property {string} address
 * @property {string} city
 * @property {string} state
 * @property {string} zip
 * @property {string} license
 * @property {string} licenseState
 * @property {string} medicaid
 * @property {string} enumerationDate
 * @property {string} lastUpdated
 * @property {Array}  allTaxonomies
 * @property {Array}  practiceLocations
 * @property {Array}  identifiers
 */
