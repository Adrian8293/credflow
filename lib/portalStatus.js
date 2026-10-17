/**
 * Plain-language status for the provider portal. Internal stage names stay internal;
 * providers see what it means for them and whether anything is needed from them.
 */
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysFromToday(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y) return null
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((new Date(y, m - 1, d) - t) / 86400000)
}

export function fmtDateLong(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// tone: ok | wait | action | bad | muted
export function portalEnrollmentStatus(e, today = todayStr()) {
  const stage = e.stage || 'Not Started'
  if (stage === 'Denied') return { label: 'Not approved', tone: 'bad', hint: 'Your credentialing team will contact you about next steps.' }
  if (e.term_date && e.term_date <= today) return { label: 'Ended', tone: 'muted', hint: `Ended ${fmtDateLong(e.term_date)}` }
  if (stage === 'Active') {
    const from = e.billable_from || e.credentialing_effective || e.effective
    if (from && from > today) return { label: 'Approved', tone: 'ok', hint: `Effective ${fmtDateLong(from)}` }
    return { label: 'Active', tone: 'ok', hint: from ? `Effective since ${fmtDateLong(from)}` : 'Effective' }
  }
  if (stage.startsWith('Contracted')) return { label: 'Approved, awaiting start date', tone: 'ok', hint: 'The contract is signed. Waiting on the effective date.' }
  if (stage.startsWith('Approved')) return { label: 'Approved, awaiting contract', tone: 'wait', hint: 'The payer approved you. The contract is being finalized.' }
  if (stage === 'Additional Info Requested') return { label: 'Needs your attention', tone: 'action', hint: 'The payer asked for more information. Check your requests below or contact your credentialing team.' }
  if (stage === 'Not Started') return { label: 'Not started', tone: 'muted', hint: 'Your credentialing team has not submitted this yet.' }
  return { label: 'In progress', tone: 'wait', hint: 'Submitted and being processed by the payer.' }
}

export const REQUEST_LABEL = {
  requested: { label: 'Action needed', tone: 'action' },
  rejected:  { label: 'Please resubmit', tone: 'bad' },
  submitted: { label: 'Received, under review', tone: 'wait' },
  approved:  { label: 'Approved', tone: 'ok' },
}
