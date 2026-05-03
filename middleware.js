/**
 * middleware.js — Auth edge guard for CredentialIQ
 *
 * Runs at the edge (Vercel Edge Runtime) on every request before it hits
 * any page or API route. Redirects unauthenticated visitors to /login.
 *
 * Public routes (no session required):
 *   /login, /reset-password
 *
 * Protected API routes still get a second check inside each handler via
 * requireAuth() — defense in depth, in case middleware is bypassed locally.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/reset-password']

// API routes that are exempt (public data sources, cron jobs)
// NPI registry lookups don't touch PHI — they hit the CMS public API.
// Watchdog is protected by CRON_SECRET, not session auth.
const PUBLIC_API_PATHS = [
  '/api/npi',
  '/api/npi-search',
  '/api/watchdog',
]

export async function middleware(req) {
  const { pathname } = req.nextUrl

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

  // getUser() validates the JWT with Supabase — safer than getSession()
  // which only reads the local cookie without re-validating.
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
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
