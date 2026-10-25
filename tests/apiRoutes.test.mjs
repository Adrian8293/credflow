// Guards the server side: every API route must be behind the sign-in proxy or protect itself, and proxy.js must keep
// the name Next.js 16 expects (a rename to middleware.js would break the build).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('the sign-in proxy keeps the Next.js 16 file name', () => {
  assert.ok(fs.existsSync(path.join(root, 'proxy.js')), 'proxy.js is missing')
  assert.ok(!fs.existsSync(path.join(root, 'middleware.js')), 'middleware.js must not exist next to proxy.js (the build fails with both)')
  assert.match(read('proxy.js'), /export\s+(async\s+)?function\s+proxy\s*\(/)
  assert.match(read('proxy.js'), /export\s+const\s+config/)
})

test('every API route is protected', () => {
  const src = read('proxy.js')
  const block = src.match(/PUBLIC_API_PATHS\s*=\s*\[([\s\S]*?)\]/)
  assert.ok(block, 'could not find PUBLIC_API_PATHS in proxy.js')
  const publicPaths = [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1])

  // Ways a route can protect itself when the proxy lets it through.
  const selfProtected = [
    /requireAuth\s*\(/, /auth:\s*true/, /getUser\s*\(/, /CRON_SECRET/, /token_hash|tokenHash|sha256|createHash/,
  ]
  const dir = path.join(root, 'pages/api')
  const routes = fs.readdirSync(dir).filter(f => /\.js$/.test(f))
  assert.ok(routes.length >= 10, 'expected the API routes to be found')
  const weak = []
  for (const f of routes) {
    const route = '/api/' + f.replace(/\.js$/, '')
    const code = fs.readFileSync(path.join(dir, f), 'utf8')
    const isPublic = publicPaths.includes(route)
    if (!isPublic) continue                      // behind the proxy: needs a signed-in session to reach it
    if (!selfProtected.some(re => re.test(code))) weak.push(route)
  }
  assert.deepEqual(weak, [], `public API routes with no check of their own: ${weak.join(', ')}`)
})

test('routes that read documents or run on a schedule stay limited', () => {
  assert.match(read('pages/api/get-document-url.js'), /enforceRateLimit/)
  assert.match(read('pages/api/watchdog.js'), /CRON_SECRET/)
  assert.match(read('pages/api/watchdog.js'), /timingSafeEqual/)
})

test('AI features need an explicit privacy sign-off', () => {
  const f = read('lib/features.js')
  assert.match(f, /AI_PRIVACY_REVIEWED/)
})
