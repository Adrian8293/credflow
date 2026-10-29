// Status derivation for the provider-by-payer matrix. Pure functions, no UI.
// Dates are YYYY-MM-DD strings compared lexically (no timezone drift).
export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const disp = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[2]}/${m[3]}/${m[1]}` : d }

export const STATUS_META = {
  billable:   { label: 'Billable',   color: 'var(--green)', bg: 'rgba(5,150,105,.10)',  rank: 0 },
  future:     { label: 'Billable later', color: 'var(--pr)', bg: 'rgba(11,107,122,.10)', rank: 1 },
  contracted: { label: 'Pending effective', color: 'var(--pr)', bg: 'rgba(11,107,122,.10)', rank: 2 },
  pending:    { label: 'In progress', color: 'var(--amber-d)', bg: 'rgba(180,83,9,.10)', rank: 3 },
  notstarted: { label: 'Not started', color: 'var(--text-3)', bg: 'rgba(107,115,133,.10)', rank: 4 },
  terminated: { label: 'Terminated', color: 'var(--red)', bg: 'rgba(220,38,38,.10)', rank: 5 },
  denied:     { label: 'Denied',     color: 'var(--red)', bg: 'rgba(220,38,38,.10)', rank: 6 },
}

/** Returns { key, note } for one enrollment as of `today`. */
export function enrollmentStatus(e, today = todayStr()) {
  const stage = e.stage || 'Not Started'
  if (stage === 'Denied') return { key: 'denied', note: '' }
  if (e.termDate && e.termDate <= today) return { key: 'terminated', note: `Terminated ${disp(e.termDate)}` }
  if (stage === 'Active') {
    if (e.billableFrom && e.billableFrom > today) return { key: 'future', note: `Billable from ${disp(e.billableFrom)}` }
    return { key: 'billable', note: e.billableFrom ? `Since ${disp(e.billableFrom)}` : 'No billable-from date set' }
  }
  if (stage.startsWith('Contracted')) return { key: 'contracted', note: 'Contracted, waiting on effective date' }
  if (stage === 'Not Started') return { key: 'notstarted', note: '' }
  return { key: 'pending', note: stage }
}

/** Best (most billable) status across several enrollments for one provider and payer. */
export function bestStatus(statuses) {
  return statuses.reduce((a, b) => (STATUS_META[b.key].rank < STATUS_META[a.key].rank ? b : a))
}
