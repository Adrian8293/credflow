/**
 * enrollmentImport.js — CSV parsing + validation for bulk enrollment import.
 * Round-trips with the Applications "Export CSV" file. Providers and payers must already exist
 * (they are matched, never auto-created) so a typo cannot silently create a junk payer.
 */
import { STAGES } from '../constants/stages.js'
import { toIsoDate } from './providerImport.js'

const ALIASES = {
  provider: ['provider', 'providername', 'name'],
  npi: ['npi', 'providernpi'],
  payer: ['payer', 'payername', 'plan'],
  level: ['type', 'level', 'enrollmenttype'],
  groupName: ['group', 'groupname'],
  groupNpi: ['groupnpi'],
  stage: ['stage', 'status'],
  submitted: ['submitted', 'datesubmitted', 'submitteddate'],
  credentialingEffective: ['credentialingeffective'],
  contractEffective: ['contracteffective'],
  effective: ['effectivedate', 'effective'],
  followup: ['followup', 'followupdate', 'nextfollowup'],
  recred: ['recred', 'recredentialingdue', 'recredentialing'],
  termDate: ['termdate', 'terminationdate'],
  state: ['state'],
  notes: ['notes', 'note'],
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const FIELD_BY_HEADER = {}
for (const [f, list] of Object.entries(ALIASES)) for (const a of list) FIELD_BY_HEADER[a] = f
const DATE_FIELDS = ['submitted', 'credentialingEffective', 'contractEffective', 'effective', 'followup', 'recred', 'termDate']
const LABEL = { submitted: 'Submitted', credentialingEffective: 'Credentialing Effective', contractEffective: 'Contract Effective', effective: 'Effective Date', followup: 'Follow-up', recred: 'Recred', termDate: 'Term Date' }
const stageKey = (s) => String(s || '').toLowerCase().replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim()
const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export const ENROLLMENT_TEMPLATE_CSV =
  'Provider,NPI,Payer,Type,Group,Group NPI,Stage,Submitted,Credentialing Effective,Contract Effective,Effective Date,Follow-up,Notes\n' +
  'Jane Doe,,Aetna,Individual,,,Application Submitted,05/01/2026,,,,06/15/2026,Sent via portal\n'

export function buildEnrollmentRows(csvRows, providers = [], payers = [], existing = []) {
  if (!csvRows.length) return { rows: [], unknownHeaders: [], missingRequired: ['Provider (or NPI)', 'Payer'] }
  const headers = csvRows[0].map(h => FIELD_BY_HEADER[norm(h)] || null)
  const unknownHeaders = csvRows[0].filter((h, i) => !headers[i] && String(h).trim())
  const missingRequired = []
  if (!headers.includes('provider') && !headers.includes('npi')) missingRequired.push('Provider (or NPI)')
  if (!headers.includes('payer')) missingRequired.push('Payer')

  const provByNpi = new Map(providers.filter(p => p.npi).map(p => [String(p.npi).trim(), p]))
  const provByName = new Map()
  for (const p of providers) {
    const k = nameKey(`${p.fname} ${p.lname}`)
    provByName.set(k, provByName.has(k) ? 'AMBIGUOUS' : p)
  }
  const payByName = new Map(payers.map(p => [nameKey(p.name), p]))
  const stageByKey = new Map(STAGES.map(s => [stageKey(s), s]))
  const seen = new Set(existing.map(e => `${e.provId}|${e.payId}|${e.level === 'Group' ? 'g:' + nameKey(e.groupName) : 'i'}`))

  const rows = []
  for (let r = 1; r < csvRows.length; r++) {
    const raw = {}; const errors = []; const warnings = []
    headers.forEach((f, i) => { if (f) raw[f] = String(csvRows[r][i] ?? '').trim() })

    // Provider: NPI first, then full name (a trailing ", LCSW" style credential is ignored).
    let prov = null
    const npi = (raw.npi || '').replace(/\D/g, '')
    if (npi) prov = provByNpi.get(npi) || null
    if (!prov && raw.provider) {
      const hit = provByName.get(nameKey(raw.provider.replace(/,.*$/, '')))
      if (hit === 'AMBIGUOUS') errors.push(`More than one provider is named "${raw.provider}" — add an NPI column to pick one`)
      else prov = hit || null
    }
    if (!prov && !errors.length) errors.push(`Provider not found: ${raw.provider || npi || '(blank)'} — add them first`)

    const pay = payByName.get(nameKey(raw.payer)) || null
    if (!pay) errors.push(`Payer not found: ${raw.payer || '(blank)'} — add it on the Payers page first`)

    const level = /^group$/i.test(raw.level || '') ? 'Group' : 'Individual'
    if (raw.level && !/^(group|individual)$/i.test(raw.level)) warnings.push(`Type "${raw.level}" → Individual`)
    if (level === 'Group' && !raw.groupName) warnings.push('Group enrollment without a group name')

    let stage = 'Not Started'
    if (raw.stage) {
      const hit = stageByKey.get(stageKey(raw.stage))
      if (hit) stage = hit; else { warnings.push(`Unknown stage "${raw.stage}" → Not Started`) }
    }

    const e = { level, stage, notes: raw.notes || '', groupName: level === 'Group' ? raw.groupName || '' : '', groupNpi: level === 'Group' ? (raw.groupNpi || '').replace(/\D/g, '') : '', state: (raw.state || '').toUpperCase() }
    for (const f of DATE_FIELDS) {
      if (raw[f] === undefined) continue
      const iso = toIsoDate(raw[f])
      if (iso === null) errors.push(`${LABEL[f]} "${raw[f]}" is not a date (use MM/DD/YYYY)`)
      else e[f] = iso
    }
    if (prov) e.provId = prov.id
    if (pay) e.payId = pay.id

    let duplicate = false
    if (prov && pay) {
      const key = `${prov.id}|${pay.id}|${level === 'Group' ? 'g:' + nameKey(e.groupName) : 'i'}`
      if (seen.has(key)) { duplicate = true; errors.push('This provider already has this enrollment (or it is repeated in the file) — skipped') }
      else if (!errors.length) seen.add(key)   // a row that is itself invalid must not block a good repeat
    }
    rows.push({ line: r + 1, enrollment: e, provName: prov ? `${prov.fname} ${prov.lname}` : raw.provider || raw.npi || '', payName: pay ? pay.name : raw.payer || '', errors, warnings, duplicate })
  }
  return { rows, unknownHeaders, missingRequired }
}
