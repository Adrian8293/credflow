import { daysUntil } from './helpers.js'

// Turns a payer's guideline text into checklist items and auto-checks what the app already knows.
// status: 'ok' | 'warn' (expiring/stale) | 'bad' (missing/expired) | 'na' | 'manual'
export function itemKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

const hasDoc = (docs, provId, type) => docs.some(d => d.provId === provId && d.type === type)

function expiryStatus(num, exp, label) {
  if (!num) return { status: 'bad', note: `${label} not on file` }
  const d = daysUntil(exp)
  if (d === null) return { status: 'warn', note: 'No expiration date entered' }
  if (d < 0) return { status: 'bad', note: `Expired ${Math.abs(d)}d ago` }
  if (d <= 90) return { status: 'warn', note: `Expires in ${d}d` }
  return { status: 'ok', note: 'On file' }
}

export function autoStatus(text, prov, docs) {
  if (!prov) return { status: 'manual', note: '' }
  const t = text.toLowerCase()
  if (t.includes('caqh')) {
    if (!prov.caqh) return { status: 'bad', note: 'No CAQH ID on file' }
    const age = prov.caqhAttest ? -daysUntil(prov.caqhAttest) : null
    if (age === null) return { status: 'warn', note: 'No attestation date entered' }
    if (age > 120) return { status: 'warn', note: `Last attested ${age}d ago` }
    return { status: 'ok', note: `Attested ${age}d ago` }
  }
  if (t.includes('npi')) return prov.npi ? { status: 'ok', note: `NPI ${prov.npi}` } : { status: 'bad', note: 'No NPI on file' }
  if (t.includes('license')) return expiryStatus(prov.license, prov.licenseExp, 'License')
  if (t.includes('malpractice')) return expiryStatus(prov.malPolicy || prov.malCarrier, prov.malExp, 'Malpractice')
  if (t.includes('dea')) return prov.dea ? expiryStatus(prov.dea, prov.deaExp, 'DEA') : { status: 'na', note: 'No DEA on file (only if prescribing)' }
  if (t.includes('w-9')) return hasDoc(docs, prov.id, 'W-9') ? { status: 'ok', note: 'On file' } : { status: 'bad', note: 'No W-9 uploaded' }
  if (t.includes('cv') || t.includes('resume')) return hasDoc(docs, prov.id, 'CV / Resume') ? { status: 'ok', note: 'On file' } : { status: 'bad', note: 'No CV uploaded' }
  if (t.includes('supervis') && t.includes('agreement')) return hasDoc(docs, prov.id, 'Supervision Agreement') ? { status: 'ok', note: 'On file' } : { status: 'bad', note: 'No agreement uploaded' }
  return { status: 'manual', note: '' }
}

/** items: [{key,text,status,note,done}] ; manual = { [key]: true } */
export function buildChecklist(guidelines, prov, docs, manual = {}) {
  return guidelines.map(text => {
    const key = itemKey(text)
    const a = autoStatus(text, prov, docs)
    const ticked = !!manual[key]
    const done = a.status === 'ok' || a.status === 'na' || ticked
    return { key, text, ...a, ticked, done }
  })
}
