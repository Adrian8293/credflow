/**
 * lib/supabase-server.js — Server-side Supabase clients
 *
 * Two clients for two purposes:
 *
 *   createSessionClient(req, res)
 *     Reads the user's session cookie. Use in API routes that act on
 *     behalf of the logged-in user. Respects RLS.
 *
 *   supabaseAdmin
 *     Service-role client. Bypasses RLS. Use only in privileged server
 *     routes (watchdog, PDF generation, OPCA extract).
 *     NEVER import this in client-side code.
 *
 *   requireAuth(req, res)
 *     Call at the top of any API handler. Returns the authenticated user
 *     or sends a 401 and returns null. Defense-in-depth behind middleware.
 */

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// ─── Session-aware client (respects RLS) ──────────────────────────────────────
export function createSessionClient(req, res) {
  const isHttps =
    process.env.NODE_ENV === 'production' ||
    req.headers['x-forwarded-proto'] === 'https' ||
    req.headers['x-forwarded-ssl'] === 'on'

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          // Parse cookies from the request header
          return Object.entries(req.cookies || {}).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll(cookiesToSet) {
          const existing = res.getHeader('Set-Cookie')
          const nextCookies = Array.isArray(existing)
            ? [...existing]
            : existing
              ? [existing]
              : []

          cookiesToSet.forEach(({ name, value, options }) => {
            // Build cookie with proper security attributes
            const parts = [
              `${name}=${value}`,
              'Path=/',
              'HttpOnly',
              'SameSite=Strict',
            ]
            if (options?.maxAge) parts.push(`Max-Age=${options.maxAge}`)
            if (isHttps) parts.push('Secure')

            nextCookies.push(parts.join('; '))
          })

          res.setHeader('Set-Cookie', nextCookies)
        },
      },
    }
  )
}

// ─── Admin client (bypasses RLS — server only) ────────────────────────────────
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// ─── Auth guard for API routes ────────────────────────────────────────────────
/**
 * requireAuth(req, res) → user | null
 *
 * Usage:
 *   const user = await requireAuth(req, res)
 *   if (!user) return  // 401 already sent
 *
 * Validates the session JWT server-side via getUser() (not just getSession()).
 * Returns the authenticated Supabase user object on success.
 */
export async function requireAuth(req, res) {
  const supabase = createSessionClient(req, res)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  return user
}
