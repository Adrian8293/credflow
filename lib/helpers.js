// helpers.js — PrimeCredential
// All dates formatted mm/dd/yyyy throughout

export function daysUntil(d) {
  if (!d) return null
  const now   = new Date(); now.setHours(0,0,0,0)
  const target = new Date(d + 'T00:00:00')
  return Math.round((target - now) / 86400000)
}

// mm/dd/yyyy — used everywhere
export function fmtDate(d) {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  const [y, m, day] = parts
  return `${m}/${day}/${y}`
}

// Timestamp: May 10, 2026 2:14 PM
export function fmtTS(ts) {
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

// Today as mm/dd/yyyy
export function todayFmt() {
  return fmtDate(new Date().toISOString().split('T')[0])
}

// Full date — "Sunday, May 10, 2026"
export function fmtFull(d) {
  const date = d ? new Date(d + 'T00:00:00') : new Date()
  return date.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
}

export function initials(p) {
  return ((p?.fname||'')[0]||'') + ((p?.lname||'')[0]||'')
}

export function pName(providers, id) {
  const p = providers?.find(x => x.id === id)
  return p ? `${p.fname} ${p.lname}${p.cred ? `, ${p.cred}` : ''}` : '—'
}

export function pNameShort(providers, id) {
  const p = providers?.find(x => x.id === id)
  return p ? `${p.fname} ${p.lname}` : '—'
}

export function payName(payers, id) {
  return payers?.find(x => x.id === id)?.name || '—'
}

// ─── Shared alert engine ──────────────────────────────────────────────────────
// Single source of truth for provider alert counts and items.
// Used by: sidebar badge (index.js), Alerts page, MissingDocuments.
// settings: { alertDays, caqhDays } — pulled from db.settings
export const ALERT_FIELDS = [
  { f: 'licenseExp', l: 'License'               },
  { f: 'malExp',     l: 'Malpractice Insurance'  },
  { f: 'deaExp',     l: 'DEA Certificate'        },
  { f: 'caqhDue',   l: 'CAQH Attestation'       },
  { f: 'recred',    l: 'Recredentialing'         },
  { f: 'supExp',    l: 'Supervision Agreement'   }, // was missing from sidebar badge
]

export function getProviderAlerts(provider, settings = {}) {
  const alertDays = settings.alertDays ?? 90
  const caqhDays  = settings.caqhDays  ?? 30
  return ALERT_FIELDS
    .map(({ f, l }) => {
      const days = daysUntil(provider[f])
      if (days === null) return null
      const threshold = f === 'caqhDue' ? caqhDays : alertDays
      if (days > threshold) return null
      return { field: f, label: l, days, p: provider }
    })
    .filter(Boolean)
}

// Total alert count for a single provider (for sidebar badge)
export function providerAlertCount(provider, settings = {}) {
  return getProviderAlerts(provider, settings).length
}
