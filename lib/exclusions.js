/**
 * lib/exclusions.js — monthly exclusion screening (OIG LEIE, SAM.gov, state Medicaid lists).
 * Pure functions. Matching the OIG file happens in the browser; nothing is uploaded anywhere.
 */
import { parseCsv, validNpi } from './providerImport.js'
import { daysBetween } from './tzDate.js'

export const SOURCES = [
  { id: 'OIG LEIE', label: 'OIG exclusion list (LEIE)', search: 'https://exclusions.oig.hhs.gov/', download: 'https://oig.hhs.gov/exclusions/exclusions_list.asp' },
  { id: 'SAM.gov', label: 'SAM.gov exclusions', search: 'https://sam.gov/search/?index=ex', download: null },
]
export const RESULTS = ['Clear', 'Possible match', 'Confirmed exclusion']
export const CADENCE_DAYS = 30

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

/** Newest check per provider+source. checks: [{provId, source, checkedOn, result}] */
export function latestChecks(checks = []) {
  const map = new Map()
  for (const c of checks) {
    const k = `${c.provId}|${c.source}`
    const cur = map.get(k)
    if (!cur || c.checkedOn > cur.checkedOn || (c.checkedOn === cur.checkedOn && (c.createdAt || '') > (cur.createdAt || ''))) map.set(k, c)
  }
  return map
}

/** Status of one provider on one list: never / due / ok, plus the last result. */
export function sourceStatus(latest, provId, source, today) {
  const c = latest.get(`${provId}|${source}`)
  if (!c) return { state: 'never', days: null, result: null, last: null }
  const days = daysBetween(c.checkedOn, today)
  return { state: days > CADENCE_DAYS ? 'due' : 'ok', days, result: c.result, last: c.checkedOn }
}

/** Active providers who need a check on at least one list this month. */
export function screeningDue(db, today, sources = SOURCES) {
  if (!Array.isArray(db.exclusions)) return []          // table not created yet (migration 029)
  const latest = latestChecks(db.exclusions)
  const out = []
  for (const p of db.providers || []) {
    if (p.status === 'Inactive') continue
    const per = sources.map(s => ({ source: s.id, ...sourceStatus(latest, p.id, s.id, today) }))
    const needs = per.filter(x => x.state !== 'ok')
    if (needs.length) out.push({ prov: p, needs, never: needs.some(x => x.state === 'never') })
  }
  return out
}

/** Providers whose most recent check on any list was not Clear (needs a person's decision). */
export function openFlags(db) {
  if (!Array.isArray(db.exclusions)) return []
  const latest = latestChecks(db.exclusions)
  return [...latest.values()].filter(c => c.result !== 'Clear')
}

/** Reads the OIG "UPDATED.csv" (LEIE) file. Reinstated entries are skipped. */
export function parseLeie(text) {
  const rows = parseCsv(text)
  if (!rows.length) return { rows: [], error: 'The file is empty.' }
  const head = rows[0].map(h => String(h).trim().toUpperCase())
  const ix = (n) => head.indexOf(n)
  if (ix('LASTNAME') < 0 || ix('FIRSTNAME') < 0) return { rows: [], error: 'This does not look like the OIG LEIE file (expected LASTNAME and FIRSTNAME columns).' }
  const get = (r, n) => (ix(n) >= 0 ? String(r[ix(n)] || '').trim() : '')
  const out = []
  for (const r of rows.slice(1)) {
    const rein = get(r, 'REINDATE')
    if (rein && !/^0+$/.test(rein)) continue
    const npi = get(r, 'NPI')
    out.push({
      last: get(r, 'LASTNAME'), first: get(r, 'FIRSTNAME'), mid: get(r, 'MIDNAME'), business: get(r, 'BUSNAME'),
      specialty: get(r, 'SPECIALTY'), npi: /^\d{10}$/.test(npi) && !/^0+$/.test(npi) ? npi : '',
      state: get(r, 'STATE'), type: get(r, 'EXCLTYPE'), date: get(r, 'EXCLDATE'),
    })
  }
  return { rows: out, error: '' }
}

/**
 * providers: Lacentra providers. leie: parsed rows. Returns who matched and who did not.
 * NPI match is strong; a name match (same last + first name) is only "possible" — people share names,
 * and dates of birth are deliberately not stored here, so a person must review every match.
 */
export function matchLeie(providers, leie) {
  const byNpi = new Map(), byName = new Map()
  for (const r of leie) {
    if (r.npi) byNpi.set(r.npi, [...(byNpi.get(r.npi) || []), r])
    if (r.last && r.first) { const k = norm(r.last) + '|' + norm(r.first); byName.set(k, [...(byName.get(k) || []), r]) }
  }
  const matches = [], clear = []
  for (const p of providers) {
    const hits = []
    if (p.npi && validNpi(String(p.npi))) (byNpi.get(String(p.npi)) || []).forEach(row => hits.push({ row, by: 'NPI' }))
    ;(byName.get(norm(p.lname) + '|' + norm(p.fname)) || []).forEach(row => { if (!hits.some(h => h.row === row)) hits.push({ row, by: 'name' }) })
    if (hits.length) matches.push({ prov: p, hits, strong: hits.some(h => h.by === 'NPI') })
    else clear.push(p)
  }
  return { matches, clear }
}

export const describeHit = (h) =>
  `Matched by ${h.by}: ${[h.row.last, h.row.first].filter(Boolean).join(', ')}${h.row.state ? ` (${h.row.state})` : ''}${h.row.type ? `, exclusion type ${h.row.type}` : ''}${h.row.date ? `, dated ${h.row.date}` : ''}`
