/**
 * Payer roster builder — the list a group sends a payer to add or update its providers
 * (a "delegated roster" or roster update). Pure functions, no network.
 *
 * One row per provider who has an enrollment with the chosen payer (and, if a group is chosen, under that group).
 * Group, contract and location details come from the group (legal entity) record. The full tax ID is never stored in
 * Lacentra (only the last 4 digits), so that column is left for you to fill in before sending.
 */
import { csvFromObjects } from './csv.js'

const LIVE_STAGES = ['Active', 'Contracted – Pending Effective Date']
const PENDING_STAGES = ['Approved – Awaiting Contract', 'Under Review', 'Pending Verification', 'Awaiting CAQH', 'Application Submitted', 'Additional Info Requested', 'Not Started']

// What a payer cannot add a provider without.
const REQUIRED = [
  ['Individual NPI', p => p.npi],
  ['License #', p => p.license],
  ['License state', p => p.licenseState],
  ['License expiration', p => p.licenseExp],
  ['Taxonomy code', p => p.taxonomyCode],
]

export function rosterStages(includePending) {
  return includePending ? [...LIVE_STAGES, ...PENDING_STAGES] : LIVE_STAGES
}

/**
 * @param db        app data (providers, enrollments)
 * @param opts      { payerId, entity, locations, contract, includePending }
 * @returns { rows, missing, providerCount }   rows = objects ready for CSV; missing = [{ name, fields[] }]
 */
export function buildRoster(db, { payerId, entity, locations = [], contract, includePending = false }) {
  const stages = rosterStages(includePending)
  const enrs = (db.enrollments || []).filter(e =>
    e.payId === payerId && stages.includes(e.stage) &&
    (!entity || !e.entityId || e.entityId === entity.id))

  const byProv = new Map()
  enrs.forEach(e => { if (!byProv.has(e.provId)) byProv.set(e.provId, e) })

  const loc = locations[0] || null
  const rows = []
  const missing = []
  ;[...byProv.entries()].forEach(([provId, e]) => {
    const p = (db.providers || []).find(x => x.id === provId)
    if (!p || (p.status || 'Active') === 'Inactive') return
    const lacks = REQUIRED.filter(([, get]) => !get(p)).map(([label]) => label)
    if (!loc) lacks.push('Practice location')
    if (lacks.length) missing.push({ name: `${p.fname} ${p.lname}`.trim(), fields: lacks })
    rows.push({
      'Group name': entity?.name || e.groupName || '',
      'Group NPI (Type 2)': entity?.type2Npi || e.groupNpi || '',
      'Tax ID (fill in before sending)': '',
      'Tax ID last 4': entity?.einLast4 || '',
      'Contract #': contract?.contractNo || e.payerProviderId || '',
      'Last name': p.lname || '',
      'First name': p.fname || '',
      'Credential': p.cred || '',
      'Specialty': p.spec || '',
      'Individual NPI (Type 1)': p.npi || '',
      'Taxonomy code': p.taxonomyCode || '',
      'License #': p.license || '',
      'License state': p.licenseState || '',
      'License expiration': p.licenseExp || '',
      'CAQH ID': p.caqh || '',
      'Effective date': e.billableFrom || e.credentialingEffective || e.effective || '',
      'Term date': e.termDate || '',
      'Location name': loc?.name || '',
      'Address': loc?.address || '',
      'City': loc?.city || '',
      'State': loc?.state || '',
      'ZIP': loc?.zip || '',
      'Enrollment stage': e.stage,
      'Still missing': lacks.join('; '),
    })
  })
  rows.sort((a, b) => a['Last name'].localeCompare(b['Last name']))
  return { rows, missing, providerCount: rows.length }
}

export const rosterCsv = (rows) => csvFromObjects(rows)

/**
 * Per-provider records for filling a payer's OWN roster file (see lib/xlsxPatch.js), plus the group/location values
 * that repeat on every row. The full tax ID and date of birth are not here on purpose: the tax ID is typed at export time.
 * scope: 'active' (live; plus pending if includePending) or 'termed' (enrollments with a term date that has passed).
 */
export function rosterRecords(db, { payerId, entity, locations = [], contract, scope = 'active', includePending = false, today = new Date().toISOString().slice(0, 10) }) {
  const termed = e => !!e.termDate && e.termDate <= today
  const stages = rosterStages(includePending)
  const enrs = (db.enrollments || []).filter(e => {
    if (e.payId !== payerId) return false
    if (entity && e.entityId && e.entityId !== entity.id) return false
    return scope === 'termed' ? termed(e) : (stages.includes(e.stage) && !termed(e))
  })
  const byProv = new Map()
  enrs.forEach(e => { if (!byProv.has(e.provId)) byProv.set(e.provId, e) })
  const yn = v => (v === 'Yes' ? 'Yes' : v === 'No' ? 'No' : '')
  const records = [], noNpi = []
  ;[...byProv.entries()].forEach(([provId, e]) => {
    const p = (db.providers || []).find(x => x.id === provId)
    if (!p) return
    if (scope === 'active' && (p.status || 'Active') === 'Inactive') return
    const label = `${p.fname} ${p.lname}`.trim()
    const npi = (p.npi || '').replace(/\D/g, '')
    if (!npi) { noNpi.push(label); return }
    records.push({
      label, npi,
      values: {
        fname: p.fname || '', lname: p.lname || '', cred: p.cred || '', spec: p.spec || '', taxonomy: p.taxonomyCode || '',
        license: p.license || '', licenseState: p.licenseState || '', licenseExp: p.licenseExp || '', caqh: p.caqh || '',
        email: p.email || '', gender: p.gender || '', languages: p.languages || '', acceptsNew: yn(p.acceptsNew), telehealth: yn(p.telehealth),
        effective: e.billableFrom || e.credentialingEffective || e.effective || '', termDate: e.termDate || '',
        termedYN: termed(e) ? 'Y' : 'N', payerProviderId: e.payerProviderId || '',
      },
    })
  })
  records.sort((a, b) => a.label.localeCompare(b.label))
  const loc = locations[0] || null
  const entityValues = {
    groupName: entity?.name || '', groupNpi: entity?.type2Npi || '', contractNo: contract?.contractNo || '',
    locName: loc?.name || '', addr1: loc?.address || '', city: loc?.city || '', state: loc?.state || '', zip: loc?.zip || '', locTaxonomy: loc?.taxonomy || '',
  }
  return { records, noNpi, entityValues }
}
