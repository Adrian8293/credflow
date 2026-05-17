/**
 * lib/api-middleware.js - Shared API route utilities
 *
 * Provides:
 *   withAuth(handler)         - wraps a handler with requireAuth
 *   enforceRateLimit(...)     - in-memory rate limiter (per-IP, per-route)
 *   validateOrigin(req, res)  - S-05: CSRF defense for state-mutating routes
 *   withMethods(methods, handler) - method allowlist
 *   apiHandler(config)        - combines all the above
 *
 * S-04 NOTE: The in-memory rate limit store resets on every Vercel cold start,
 * making it trivially bypassable by triggering a new serverless instance.
 * For production hardening, replace rateLimitStore with Upstash Redis:
 *
 *   import { Ratelimit } from '@upstash/ratelimit'
 *   import { Redis } from '@upstash/redis'
 *   const ratelimit = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(10, '1 m'),
 *   })
 *
 * Required env vars once migrated: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

import { requireAuth } from './supabase-server'

// S-04: In-memory store — resets on cold start (see note above).
// Acceptable for low-traffic single-instance deployments. Upgrade to Upstash for multi-instance.
const rateLimitStore = new Map()
const CLEANUP_INTERVAL = 60_000

let lastCleanup = Date.now()
function cleanupStore() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key)
  }
}

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

export function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  )
}

export function enforceRateLimit(req, res, options = {}) {
  const { max = 30, windowMs = 60_000, keyPrefix = '' } = options
  const ip = getClientIp(req)
  const route = req.url?.split('?')[0] || 'unknown'
  const { allowed, remaining, resetAt } = checkRateLimit(`${keyPrefix}${ip}:${route}`, max, windowMs)

  res.setHeader('X-RateLimit-Remaining', remaining)
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000))

  if (!allowed) {
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    })
    return false
  }

  return true
}

/**
 * S-05 FIX: Origin validation for state-mutating API routes.
 *
 * Defends against CSRF attacks from cross-origin pages. Supabase already sets
 * SameSite=Strict on its auth cookies (primary protection), but this adds
 * defense-in-depth for non-browser clients that might spoof cookie-bearing requests.
 *
 * Apply to all routes that write, delete, or trigger side effects:
 *   upload-document, eligibility, api-ai-followup, opca-extract, import-sp
 *
 * Set NEXT_PUBLIC_APP_URL in Vercel env vars to your production domain.
 * In development (NODE_ENV !== 'production'), the check is skipped entirely.
 *
 * Returns true if origin is valid, false if rejected (response already sent).
 */
export function validateOrigin(req, res) {
  // Skip in development — localhost origins vary and this check is not needed locally
  if (process.env.NODE_ENV !== 'production') return true

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    // Misconfiguration: log a warning but don't block in case env var was forgotten
    console.warn('[validateOrigin] NEXT_PUBLIC_APP_URL is not set — origin check skipped')
    return true
  }

  const origin  = req.headers['origin'] || ''
  const referer = req.headers['referer'] || ''

  // Allow requests originating from the app domain (origin header) or the app URL (referer fallback)
  const allowed = origin.startsWith(appUrl) || referer.startsWith(appUrl)

  if (!allowed) {
    console.warn(`[validateOrigin] Rejected request from origin="${origin}" referer="${referer}"`)
    res.status(403).json({ error: 'Forbidden: invalid request origin' })
    return false
  }

  return true
}

export function apiHandler({ methods = ['GET'], auth = true, rateLimit, handler }) {
  return async function wrappedHandler(req, res) {
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '))
      return res.status(405).json({ error: 'Method not allowed' })
    }

    if (rateLimit && !enforceRateLimit(req, res, rateLimit)) return

    let user = null
    if (auth) {
      user = await requireAuth(req, res)
      if (!user) return
    }

    return handler(req, res, user)
  }
}
