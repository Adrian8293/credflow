/** @type {import('next').NextConfig} */
/**
 * Content-Security-Policy. Scripts and styles keep 'unsafe-inline' because Next.js injects inline bootstrap
 * scripts and the app uses inline styles (removing it needs per-request nonces, a larger change). Everything else
 * is locked down: the browser may only talk to this site and Supabase, nothing can be framed or embedded,
 * no plugins, and forms can only post to this site. That blocks the main data-exfiltration routes of an injected script.
 * CSP_MODE=report-only (a Vercel environment variable) switches to report-only without a code change, if a
 * new feature ever needs a new host: the browser console then lists what it would have blocked.
 */
function supabaseHosts() {
  const hosts = ['https://*.supabase.co']
  try { const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || ''); if (!u.hostname.endsWith('.supabase.co')) hosts.push(u.origin) } catch { /* not set at build time */ }
  return hosts
}
function contentSecurityPolicy() {
  const sb = supabaseHosts()
  const ws = sb.map(h => h.replace(/^https:/, 'wss:'))
  const dev = process.env.NODE_ENV !== 'production'
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Provider photos (Supabase), the MFA QR code (data:), downloads and previews (blob:), payer favicons.
    `img-src 'self' data: blob: ${sb.join(' ')} https://*.gstatic.com https://icons.duckduckgo.com https://logo.clearbit.com https://www.google.com`,
    `connect-src 'self' ${sb.join(' ')} ${ws.join(' ')}${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

const nextConfig = {
  reactStrictMode: true,

  /**
   * FIX (BUG-2): Belt-and-suspenders redirect for /applications → /enrollments.
   * Primary fix is the Sidebar nav key change ('applications' → 'enrollments').
   * This catches any hardcoded /applications links or user bookmarks.
   */
  async redirects() {
    return [
      {
        // Old standalone wizard page → the single Add Provider drawer
        source:      '/add-provider',
        destination: '/providers?add=1',
        permanent:   false,
      },
      {
        source:      '/applications',
        destination: '/enrollments',
        permanent:   true,
      },
    ]
  },

  /**
   * Browser security headers, including the Content-Security-Policy above.
   * Invite links carry a one-time token in the URL, so /invite sends no Referer at all.
   */
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: process.env.CSP_MODE === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', value: contentSecurityPolicy() },
    ]
    return [
      { source: '/((?!invite$).*)', headers: [...common, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] },
      // Responses from the app's own API can contain provider data: never stored by the browser or a proxy.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/invite', headers: [...common, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
    ]
  },

  images: {
    // FIX: Migrated from deprecated `domains` to `remotePatterns` (Next.js 13+)
    remotePatterns: [
      { protocol: 'https', hostname: 't1.gstatic.com'    },
      { protocol: 'https', hostname: 'logo.clearbit.com' },
      { protocol: 'https', hostname: 'icons.duckduckgo.com' },
    ],
  },
}

module.exports = nextConfig
module.exports.contentSecurityPolicy = contentSecurityPolicy
