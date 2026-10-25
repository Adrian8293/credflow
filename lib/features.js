/**
 * lib/features.js — Server-side feature switches.
 *
 * Everything defaults to OFF so the app runs at $0 with no patient data and no paid vendors.
 * Paid / PHI-touching features stay in the codebase and can be turned on later by setting the
 * env vars below in Vercel (and redeploying). Nothing here is read by browser code.
 *
 *   FEATURE_AI=true           Use the Anthropic API (paid) for follow-up emails and OPCA extraction.
 *                             Also requires ANTHROPIC_API_KEY and AI_PRIVACY_REVIEWED=true. Sends provider data to a third party —
 *                             confirm a BAA/privacy review before enabling.
 *
 *   FEATURE_EMAIL_DIGEST=true Email the Monday digest + milestone alerts to org owners/admins (via Resend,
 *                             free plan: 100/day). Also requires RESEND_API_KEY and DIGEST_FROM. Sends provider
 *                             names and credential dates (no patient data, no ID numbers) to a mail vendor.
 *
 * Billing, claims and eligibility features were removed: this app is credentialing-only.
 */
const on = (name) => process.env[name] === 'true'

export const features = {
  // The AI features also need AI_PRIVACY_REVIEWED=true: a deliberate confirmation that the vendor agreement /
  // privacy review is done before any provider data leaves the app. Without it the features stay off.
  ai:          () => on('FEATURE_AI') && on('AI_PRIVACY_REVIEWED') && !!process.env.ANTHROPIC_API_KEY,
  emailDigest: () => on('FEATURE_EMAIL_DIGEST') && !!process.env.RESEND_API_KEY && !!process.env.DIGEST_FROM,
}

/** Sends a 501 and returns false when a feature is off. Usage: if (!requireFeature(res,'ai')) return */
export function requireFeature(res, name, label = name) {
  if (features[name]()) return true
  res.status(501).json({ error: `${label} is not enabled in this deployment.`, feature: name })
  return false
}
