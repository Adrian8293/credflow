// The reminder ladder and stalled-application rule, shared by the app (bell, Alerts, Today) and the nightly watchdog
// so they always agree. Pure functions, no dates read from the clock.

/** Reminder steps, in days before a deadline. 0 means "due today or already past". */
export const LADDER = [7, 30, 60, 90]

/** Which step a deadline is in: 0 (due/expired), 7, 30, 60, 90, or null when it is further away (or unknown). */
export function ladderStep(days, lookahead = 90) {
  if (days === null || days === undefined || Number.isNaN(days)) return null
  if (days <= 0) return 0
  for (const s of LADDER) if (days <= s && s <= Math.max(lookahead, 7)) return s
  return days <= lookahead ? 90 : null      // a lookahead beyond 90 days still gets one early reminder
}

export const ladderLabel = step => step === 0 ? 'Due or expired' : step === null ? '' : `Within ${step} days`

/** Alert severity used by the feed. A negative number of days is already expired. */
export function ladderSeverity(days) {
  return days < 0 ? 'expired' : days <= 7 ? 'critical' : days <= 30 ? 'warning' : 'notice'
}

/** Task priority the watchdog gives a reminder at this step. */
export const ladderPriority = step => step === 0 ? 'Urgent' : step <= 30 ? 'High' : 'Medium'

/**
 * Key that makes a reminder fire once per step. Same step tomorrow = same key = nothing new (even if the earlier task
 * was finished), a tighter step = a new key = a fresh, more urgent reminder.
 */
export const ladderKey = (base, step) => `${base}:s${step}`

/** Whole days from one 'YYYY-MM-DD' date to another (negative if `to` is earlier). */
export const dayDiff = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)

// ─── Stalled applications ────────────────────────────────────────────────────
// An application is "stalled" when it is still in progress and nothing has changed for a while.
const STAGES_DONE = ['Active', 'Denied', 'Withdrawn', 'Not Started', 'Terminated']
// Waiting on US (the payer asked for something): flag sooner.
const WAITING_ON_US = ['Additional Info Requested', 'Returned']

export const STALL_DAYS_PAYER = 30
export const STALL_DAYS_US = 14

/** cfg: { payer, us } day counts from Settings; anything missing or out of range uses the defaults. */
const pick = (v, d) => (Number.isInteger(v) && v >= 7 && v <= 120 ? v : d)
export const stallThreshold = (stage, cfg = {}) => WAITING_ON_US.includes(stage) ? pick(cfg.us, STALL_DAYS_US) : pick(cfg.payer, STALL_DAYS_PAYER)
export const stallConfig = settings => ({ payer: settings?.stallDaysPayer, us: settings?.stallDaysUs })
export const isInProgress = stage => !!stage && !STAGES_DONE.includes(stage)

/**
 * { days, threshold, onUs } when the application is stalled, otherwise null.
 *   lastChange: 'YYYY-MM-DD' of the last change (falls back to the submitted date)
 *   today: 'YYYY-MM-DD'
 * A follow-up date that is today or later means someone has it on their list, so it is not stalled.
 */
export function stalledEnrollment(e, today, cfg) {
  if (!isInProgress(e.stage)) return null
  if (e.termDate && dayDiff(e.termDate, today) > 0) return null          // already terminated
  if (e.followup && dayDiff(today, e.followup) >= 0) return null          // a follow-up is scheduled
  const last = e.updated || e.submitted
  if (!last) return null
  const days = dayDiff(last, today)
  const threshold = stallThreshold(e.stage, cfg)
  return days >= threshold ? { days, threshold, onUs: WAITING_ON_US.includes(e.stage) } : null
}
