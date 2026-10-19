/** @type {import('next').NextConfig} */
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
   * Basic browser security headers. (No Content-Security-Policy yet: the app uses inline styles
   * and scripts, so a CSP needs its own careful pass.)
   * Invite links carry a one-time token in the URL, so /invite sends no Referer at all.
   */
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    ]
    return [
      { source: '/((?!invite$).*)', headers: [...common, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] },
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
