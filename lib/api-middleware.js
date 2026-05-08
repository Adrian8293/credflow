/**
 * lib/api-middleware.js - Shared API route utilities
 *
 * Provides:
 *   withAuth(handler)       - wraps a handler with requireAuth
 *   withRateLimit(handler)  - in-memory rate limiter (per-IP, per-route)
 *   withMethods(methods, handler) - method allowlist
 *   apiHandler(config)      - combines all the above
 */

import { requireAuth } from './supabase-server'

// For Vercel serverless this resets on cold start. For stricter enforcement,
// replace this with Vercel KV, Upstash, or Supabase-backed counters.
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
