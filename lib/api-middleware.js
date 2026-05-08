/**
 * lib/api-middleware.js — Shared API route utilities
 *
 * Provides:
 *   withAuth(handler)       — wraps a handler with requireAuth
 *   withRateLimit(handler)  — in-memory rate limiter (per-IP, per-route)
 *   withMethods(methods, handler) — method allowlist
 *   apiHandler(config)      — combines all the above
 */

import { requireAuth } from './supabase-server'

// ─── In-Memory Rate Limiter ──────────────────────────────────────────────────
// For Vercel serverless: this resets on cold start, which is acceptable.
// For stricter enforcement, use Vercel KV or Supabase edge cache.
const rateLimitStore = new Map()
const CLEANUP_INTERVAL = 60_000 // clean expired entries every 60s

let lastCleanup = Date.now()
function cleanupStore() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  }
}

/**
 * Check rate limit for a given key.
 * @param {string} key - Usually `${ip}:${route}`
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window duration in ms
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(key, maxRequests = 30, windowMs = 60_000) {
  cleanupStore()
  const now = Date.now()
  let entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    rateLimitStore.set(key, entry)
  }

  entry.count++

  return {
    allowed: entry.count <= maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  }
}

/**
 * Extract client IP from request (works behind Vercel proxy)
 */
export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  )
}

/**
 * apiHandler — Composable API route wrapper.
 *
 * Usage:
 *   export default apiHandler({
 *     methods: ['POST'],
 *     auth: true,
 *     rateLimit: { max: 10, windowMs: 60000 },
 *     handler: async (req, res, user) => { ... }
 *   })
 */
export function apiHandler({ methods = ['GET'], auth = true, rateLimit, handler }) {
  return async function wrappedHandler(req, res) {
    // Method check
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '))
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Rate limiting
    if (rateLimit) {
      const ip = getClientIp(req)
      const routeKey = `${ip}:${req.url?.split('?')[0] || 'unknown'}`
      const { allowed, remaining, resetAt } = checkRateLimit(
        routeKey,
        rateLimit.max || 30,
        rateLimit.windowMs || 60_000
      )

      res.setHeader('X-RateLimit-Remaining', remaining)
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000))

      if (!allowed) {
        return res.status(429).json({
          error: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
        })
      }
    }

    // Auth
    let user = null
    if (auth) {
      user = await requireAuth(req, res)
      if (!user) return // 401 already sent
    }

    // Handler
    return handler(req, res, user)
  }
}
