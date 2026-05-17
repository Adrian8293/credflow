/**
 * lib/availity-token.js
 *
 * P-02 FIX: Module-level OAuth token cache for Availity.
 *
 * Previously, eligibility.js fetched a fresh token on every request — doubling
 * the number of API calls to Availity and risking token issuance rate limits under
 * concurrent load. Availity access_tokens typically expire in 3600 seconds (1 hour).
 *
 * This module caches the token in memory with a 60-second safety buffer. On a cold
 * start or after expiry, it transparently re-fetches. Multiple simultaneous requests
 * during token fetch are coalesced via a pending-promise pattern to prevent thundering herd.
 *
 * Note: module-level cache resets on Vercel cold starts. For cross-instance consistency,
 * migrate this to Upstash Redis once S-04 (persistent rate limiter) is deployed —
 * the same Redis connection can serve both use cases.
 */

let cachedToken    = null
let tokenExpiresAt = 0       // Unix ms timestamp
let pendingFetch   = null    // Coalesce concurrent token fetches

const EXPIRY_BUFFER_MS = 60_000  // refresh 60s before actual expiry

export async function getAvailityToken(signal) {
  const now = Date.now()

  // Return cached token if still valid (with buffer)
  if (cachedToken && now < tokenExpiresAt - EXPIRY_BUFFER_MS) {
    return cachedToken
  }

  // Coalesce concurrent requests — only one fetch in flight at a time
  if (pendingFetch) return pendingFetch

  pendingFetch = (async () => {
    try {
      const tokenRes = await fetch('https://api.availity.com/availity/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'client_credentials',
          client_id:     process.env.AVAILITY_CLIENT_ID,
          client_secret: process.env.AVAILITY_CLIENT_SECRET,
          scope:         'hipaa',
        }),
        signal,
      })

      if (!tokenRes.ok) {
        const errText = await tokenRes.text()
        throw new Error(`Availity auth failed (${tokenRes.status}): ${errText}`)
      }

      const tokenData = await tokenRes.json()
      if (!tokenData.access_token) {
        throw new Error('Availity did not return an access token. Check AVAILITY_CLIENT_ID and AVAILITY_CLIENT_SECRET.')
      }

      cachedToken    = tokenData.access_token
      // expires_in is in seconds; default to 3600 if not provided
      tokenExpiresAt = Date.now() + ((tokenData.expires_in ?? 3600) * 1000)

      return cachedToken
    } finally {
      pendingFetch = null
    }
  })()

  return pendingFetch
}
