/* Lacentra service worker — makes the app installable and shows a friendly page when offline.
 * It deliberately caches NO pages, NO API responses and NO Supabase data: credentialing data
 * always comes live from the server and never sits in a device cache. Only the app's own
 * static files (scripts, styles, icons) are cached so the app opens faster. */
const CACHE = 'lc-static-v1'
const PRECACHE = ['/offline.html', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return          // Supabase, fonts, etc.: untouched
  if (url.pathname.startsWith('/api/')) return             // never cache API calls

  // Page loads: always the network; offline page only if the network is down.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }

  // Versioned build files and icons never change: serve from cache, fill it on first use.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }))
    )
  }
})
