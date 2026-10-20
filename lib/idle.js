/**
 * Inactivity sign-out settings and the "last seen" cookie.
 *
 * The cookie lets the server (proxy.js) end a session that has been away too long — for example when the
 * site or installed app is reopened the next morning. The browser keeps the Supabase login cookie for
 * weeks, so without this check the person would simply be signed back in.
 *
 * lc_seen = time of the last activity (ms); lc_idle = the limit in minutes for this device. A value of 0
 * in lc_seen means "no limit" (the organization turned automatic sign-out off).
 */
export const IDLE_CHOICES = [15, 30, 60, 120]
export const DEFAULT_IDLE_MINUTES = 30
const MIN_KEY = 'lc_idle_minutes'

export function getIdleMinutes() {
  try {
    const v = Number(localStorage.getItem(MIN_KEY))
    if (IDLE_CHOICES.includes(v)) return v
  } catch { /* storage unavailable */ }
  const env = Number(process.env.NEXT_PUBLIC_IDLE_MINUTES)
  return IDLE_CHOICES.includes(env) ? env : DEFAULT_IDLE_MINUTES
}

export function setIdleMinutes(m) {
  try { localStorage.setItem(MIN_KEY, String(m)) } catch { /* storage unavailable */ }
}

const cookieSuffix = () => `; path=/; SameSite=Lax${typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''}`

export function writeSeen(ts, minutes) {
  if (typeof document === 'undefined') return
  const age = 60 * 60 * 24 * 365
  document.cookie = `lc_seen=${ts}; max-age=${age}${cookieSuffix()}`
  document.cookie = `lc_idle=${minutes}; max-age=${age}${cookieSuffix()}`
}

export function clearSeen() {
  if (typeof document === 'undefined') return
  document.cookie = `lc_seen=; max-age=0${cookieSuffix()}`
  document.cookie = `lc_idle=; max-age=0${cookieSuffix()}`
  try { localStorage.removeItem('lc_last_activity') } catch { /* storage unavailable */ }
}
