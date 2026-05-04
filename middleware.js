/**
 * middleware.js — Auth edge guard for CredFlow
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
const PUBLIC_PATHS = ['/login', '/reset-password']

// API routes that are exempt (public data sources, cron jobs)
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
