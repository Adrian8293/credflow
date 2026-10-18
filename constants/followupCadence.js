/**
 * followupCadence.js — how many days to wait before following up with a payer, by application stage.
 * Stages not listed (Not Started, Active, Denied) get no suggestion. Edit the numbers to fit how you work.
 */
export const FOLLOWUP_DAYS = {
  'Application Submitted': 14,
  'Awaiting CAQH': 7,
  'Pending Verification': 21,
  'Additional Info Requested': 7,
  'Under Review': 30,
  'Approved – Awaiting Contract': 14,
  'Contracted – Pending Effective Date': 14,
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** ISO date `days` from today (local time). */
export function addDaysFromToday(days, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return iso(d)
}

/** Suggested follow-up for entering `stage`, or null when the stage has no cadence. */
export function suggestFollowup(stage, now = new Date()) {
  const days = FOLLOWUP_DAYS[stage]
  return days ? { days, date: addDaysFromToday(days, now) } : null
}

/** Only fill the follow-up when there is none, or it is already in the past (an old date is stale once the stage moved on). */
export function needsFollowup(currentIso, now = new Date()) {
  return !currentIso || currentIso < addDaysFromToday(0, now)
}
