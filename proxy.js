/**
 * proxy.js — Auth edge guard for Lacentra.
 * NOTE: in Next.js 16 this file MUST be named proxy.js (exporting `proxy`); "middleware.js" is the deprecated
 * name, and having both files makes the build fail. tests/apiRoutes.test.mjs guards against a rename.
 *
 *
 * Runs at the edge (Vercel Edge Runtime) on every request before it hits
 * any page or API route. Redirects unauthenticated visitors to /login.
 *
 * Public routes (no session required):
 *   /login, /reset-password
 *
 * NOTE: We use getSession() here (cookie-only, no network call) rather than
 * getUser() (validates JWT with Supabase server). getUser() in middleware
 * causes a redirect loop on login because the session cookie isn't fully
 * propagated before the next request fires. The API route handlers use
 * requireAuth() → getUser() for the authoritative server-side check.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/reset-password', '/invite']

// API routes that are exempt (public data sources, cron jobs)
const PUBLIC_API_PATHS = [
  '/api/npi',
  '/api/npi-search',
  '/api/watchdog',
  '/api/invite-info',
  '/api/accept-invite',
]

// Clears the login and the activity cookies (used when a session has been away longer than its limit).
function clearSession(req, res) {
  req.cookies.getAll().forEach(c => {
    if (c.name.startsWith('sb-') || c.name === 'lc_seen' || c.name === 'lc_idle') res.cookies.set(c.name, '', { path: '/', maxAge: 0 })
  })
  return res
}

export async function proxy(req) {
  const { pathname } = req.nextUrl

  // Inactivity limit: the browser records when the app was last used (lc_seen) and the limit (lc_idle, minutes).
  // If the gap is longer, the login is cleared here so reopening the site or app asks for the password again.
  const seen = Number(req.cookies.get('lc_seen')?.value) || 0
  const limitMin = Number(req.cookies.get('lc_idle')?.value) || 30
  const awayTooLong = seen > 0 && Date.now() - seen > limitMin * 60_000
  if (awayTooLong && !pathname.startsWith('/_next') && !pathname.includes('.')) {
    if (pathname.startsWith('/api/')) {
      if (PUBLIC_API_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next()
      return clearSession(req, NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 }))
    }
    if (!PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'; url.search = ''
      url.searchParams.set('reason', 'idle')
      return clearSession(req, NextResponse.redirect(url))
    }
    // On a public page (e.g. /login) just clear the stale cookies so the next sign-in starts fresh.
    return clearSession(req, NextResponse.next())
  }

  // Allow public pages
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow exempt API routes
  if (PUBLIC_API_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Build a response object we can mutate (for cookie refresh)
  let response = NextResponse.next({
    request: { headers: req.headers },
  })

  // Create a Supabase client that reads/writes cookies on the edge
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // getSession() reads the JWT from the cookie without a network round-trip.
  // Sufficient for route protection — the API handlers do the authoritative
  // getUser() check server-side on any request that touches PHI.
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    // API routes return 401 JSON — pages redirect to /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    // Preserve the intended destination so we can redirect after login
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  // Match all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
