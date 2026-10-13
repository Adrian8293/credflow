/**
 * lib/features.js — Server-side feature switches.
 *
 * Everything defaults to OFF so the app runs at $0 with no patient data and no paid vendors.
 * Paid / PHI-touching features stay in the codebase and can be turned on later by setting the
 * env vars below in Vercel (and redeploying). Nothing here is read by browser code.
 *
 *   FEATURE_AI=true           Use the Anthropic API (paid) for follow-up emails and OPCA extraction.
 *                             Also requires ANTHROPIC_API_KEY. Sends provider data to a third party —
 *                             confirm a BAA/privacy review before enabling.
 *   FEATURE_ELIGIBILITY=true  Availity eligibility checks. Requires AVAILITY_CLIENT_ID/SECRET.
 *                             Handles patient data (member ID, DOB) — HIPAA review required first.
 *   FEATURE_BILLING=true      Claims/CSV import routes. Handles patient data — HIPAA review required.
 */
const on = (name) => process.env[name] === 'true'

export const features = {
  ai:          () => on('FEATURE_AI') && !!process.env.ANTHROPIC_API_KEY,
  eligibility: () => on('FEATURE_ELIGIBILITY') && !!process.env.AVAILITY_CLIENT_ID && !!process.env.AVAILITY_CLIENT_SECRET,
  billing:     () => on('FEATURE_BILLING'),
}

/** Sends a 501 and returns false when a feature is off. Usage: if (!requireFeature(res,'ai')) return */
export function requireFeature(res, name, label = name) {
  if (features[name]()) return true
  res.status(501).json({ error: `${label} is not enabled in this deployment.`, feature: name })
  return false
}
