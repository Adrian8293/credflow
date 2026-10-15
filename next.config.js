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
