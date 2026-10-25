/**
 * lib/tzDate.js — "today" and day-counts in the practice's own time zone.
 * Servers run in UTC, so `new Date().toISOString()` shows tomorrow's date after ~5pm Pacific.
 * The practice zone defaults to America/Los_Angeles; set APP_TIMEZONE in Vercel to change it.
 */
export function appTimezone() { return (typeof process !== 'undefined' && process.env && process.env.APP_TIMEZONE) || 'America/Los_Angeles' }

/** Calendar date (YYYY-MM-DD) in the given zone. */
export function todayIn(tz = appTimezone(), now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Whole days from one calendar date to another (positive = `to` is later). Both YYYY-MM-DD. */
export function daysBetween(from, to) {
  const a = Date.parse(String(from).slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(String(to).slice(0, 10) + 'T00:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

/** Days until a YYYY-MM-DD date, counted from today in the practice's zone. 0 = today, negative = past. */
export function daysUntilDate(dateStr, now = new Date(), tz = appTimezone()) {
  if (!dateStr) return null
  return daysBetween(todayIn(tz, now), dateStr)
}
