/**
 * providerImport.js — CSV parsing + validation for bulk provider import.
 * Credentialing fields only. Full SSNs / patient data are never accepted: unknown columns are ignored.
 */

// Header aliases → provider field. Matching is case/space/punctuation-insensitive.
const ALIASES = {
  fname: ['firstname', 'first', 'fname', 'givenname'],
  lname: ['lastname', 'last', 'lname', 'surname', 'familyname'],
  cred: ['credential', 'credentials', 'cred', 'degree', 'title'],
  spec: ['specialty', 'specialization', 'spec'],
  npi: ['npi', 'npinumber', 'individualnpi'],
  email: ['email', 'emailaddress', 'workemail'],
  phone: ['phone', 'phonenumber', 'workphone'],
  caqh: ['caqh', 'caqhid', 'caqhnumber'],
  license: ['license', 'licensenumber', 'licenseno'],
  licenseState: ['licensestate', 'state'],
  licenseExp: ['licenseexp', 'licenseexpiration', 'licenseexpires', 'licenseexpiry'],
  malCarrier: ['malpracticecarrier', 'malcarrier', 'carrier'],
  malPolicy: ['malpracticepolicy', 'malpolicy', 'policynumber'],
  malExp: ['malpracticeexp', 'malexp', 'malpracticeexpiration'],
  dea: ['dea', 'deanumber'],
  deaExp: ['deaexp', 'deaexpiration'],
  medicaid: ['medicaid', 'medicaidid'],
  status: ['status'],
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const FIELD_BY_HEADER = {}
for (const [field, list] of Object.entries(ALIASES)) for (const a of list) FIELD_BY_HEADER[a] = field

export const TEMPLATE_CSV =
  'First Name,Last Name,Credential,Specialty,NPI,Email,Phone,CAQH ID,License Number,License State,License Expiration,Malpractice Carrier,Malpractice Policy,Malpractice Expiration\n' +
  'Jane,Doe,LCSW,Behavioral Health,1234567893,jane@example.com,503-555-0100,12345678,L1234,OR,2027-05-30,HPSO,POL-123,2027-01-31\n'

/** Minimal RFC-4180 parser: quoted fields, escaped quotes, CRLF, embedded newlines. */
export function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false
  const s = String(text || '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cur += ch
  }
  row.push(cur)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
}

/** NPI check digit (Luhn with the 80840 prefix). */
export function validNpi(npi) {
  if (!/^\d{10}$/.test(npi)) return false
  const digits = ('80840' + npi).split('').map(Number)
  let sum = 0
  for (let i = digits.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) {
    let d = digits[i]
    if (dbl) { d *= 2; if (d > 9) d -= 9 }
    sum += d
  }
  return sum % 10 === 0
}

/** Accepts YYYY-MM-DD or M/D/YYYY (also M/D/YY). Returns ISO date or null; '' stays ''. */
export function toIsoDate(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  let y, m, d, x
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +x[1]; m = +x[2]; d = +x[3] }
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) { m = +x[1]; d = +x[2]; y = +x[3]; if (y < 100) y += 2000 }
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const STATUSES = ['Active', 'Pending', 'Inactive']

/**
 * Turn parsed CSV rows into validated provider drafts.
 * @returns {{ rows: Array<{line:number, provider:object, errors:string[], warnings:string[], duplicate:boolean}>, unknownHeaders:string[], missingRequired:string[] }}
 */
export function buildImportRows(csvRows, existingProviders = []) {
  if (!csvRows.length) return { rows: [], unknownHeaders: [], missingRequired: ['First Name', 'Last Name'] }
  const headers = csvRows[0].map(h => FIELD_BY_HEADER[norm(h)] || null)
  const unknownHeaders = csvRows[0].filter((h, i) => !headers[i] && String(h).trim())
  const missingRequired = ['fname', 'lname'].filter(f => !headers.includes(f)).map(f => (f === 'fname' ? 'First Name' : 'Last Name'))
  const seenNpi = new Set(existingProviders.map(p => String(p.npi || '').trim()).filter(Boolean))
  const rows = []
  for (let r = 1; r < csvRows.length; r++) {
    const p = {}; const errors = []; const warnings = []
    headers.forEach((f, i) => { if (f) p[f] = String(csvRows[r][i] ?? '').trim() })
    if (!p.fname) errors.push('First name is required')
    if (!p.lname) errors.push('Last name is required')
    if (p.npi) {
      p.npi = p.npi.replace(/\D/g, '')
      if (!validNpi(p.npi)) errors.push('NPI is not valid (must be 10 digits with a correct check digit)')
    } else warnings.push('No NPI')
    for (const f of ['licenseExp', 'malExp', 'deaExp']) {
      if (p[f] === undefined) continue
      const iso = toIsoDate(p[f])
      if (iso === null) errors.push(`${f === 'licenseExp' ? 'License' : f === 'malExp' ? 'Malpractice' : 'DEA'} expiration "${p[f]}" is not a date (use YYYY-MM-DD or M/D/YYYY)`)
      else p[f] = iso
    }
    if (p.licenseState !== undefined) {
      p.licenseState = p.licenseState.toUpperCase()
      if (p.licenseState && !/^[A-Z]{2}$/.test(p.licenseState)) errors.push('License state must be a 2-letter code')
    }
    if (p.license && !p.licenseState) p.licenseState = 'OR'
    if (p.status) {
      const hit = STATUSES.find(s => s.toLowerCase() === p.status.toLowerCase())
      if (hit) p.status = hit; else { warnings.push(`Unknown status "${p.status}" → Pending`); p.status = 'Pending' }
    } else p.status = 'Pending'
    if (p.email && !/^\S+@\S+\.\S+$/.test(p.email)) warnings.push('Email looks wrong')
    let duplicate = false
    if (p.npi && validNpi(p.npi)) {
      if (seenNpi.has(p.npi)) { duplicate = true; errors.push('A provider with this NPI already exists (or is repeated in the file) — skipped') }
      else seenNpi.add(p.npi)
    }
    rows.push({ line: r + 1, provider: p, errors, warnings, duplicate })
  }
  return { rows, unknownHeaders, missingRequired }
}
