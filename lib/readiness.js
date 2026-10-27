import { daysUntil } from './helpers.js'

/**
 * Credentialing readiness, 0-100: what share of the essentials are in place and current.
 * NPI (-20), license (-25 missing/expired, -10 within 30 days), malpractice (same), CAQH attestation due (-15).
 */
export function providerReadiness(prov) {
  let score = 100
  if (!prov.npi) score -= 20
  const licD = daysUntil(prov.licenseExp)
  if (licD === null || licD < 0) score -= 25
  else if (licD <= 30) score -= 10
  const malD = daysUntil(prov.malExp)
  if (malD === null || malD < 0) score -= 25
  else if (malD <= 30) score -= 10
  const caqhD = daysUntil(prov.caqhDue)
  if (caqhD === null || caqhD < 0) score -= 15
  return Math.max(0, score)
}
