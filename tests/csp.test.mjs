import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
function policy(env = {}) {
  const saved = { ...process.env }
  Object.assign(process.env, { NODE_ENV: 'production', ...env })
  delete require.cache[require.resolve('../next.config.js')]
  const csp = require('../next.config.js').contentSecurityPolicy()
  process.env = saved
  return Object.fromEntries(csp.split('; ').map(d => { const [k, ...v] = d.split(' '); return [k, v] }))
}

test('the policy locks down embedding, plugins, base URL, forms and framing', () => {
  const p = policy()
  assert.deepEqual(p['object-src'], ["'none'"]); assert.deepEqual(p['frame-src'], ["'none'"]); assert.deepEqual(p['frame-ancestors'], ["'none'"])
  assert.deepEqual(p['base-uri'], ["'self'"]); assert.deepEqual(p['form-action'], ["'self'"]); assert.deepEqual(p['default-src'], ["'self'"])
})

test('the browser may only talk to this site and Supabase (no wildcard, no localhost in production)', () => {
  const c = policy({ NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co' })['connect-src']
  assert.ok(!c.includes('*') && !c.some(x => x.includes('localhost')))
  assert.ok(c.includes("'self'") && c.includes('https://*.supabase.co') && c.includes('wss://*.supabase.co'))
})

test('a custom Supabase domain is allowed too, for web and websocket', () => {
  const c = policy({ NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.org' })['connect-src']
  assert.ok(c.includes('https://db.example.org') && c.includes('wss://db.example.org'))
})

test('no eval in production, and the MFA QR code (data:) and downloads (blob:) can still show', () => {
  const p = policy()
  assert.ok(!p['script-src'].includes("'unsafe-eval'"))
  assert.ok(p['img-src'].includes('data:') && p['img-src'].includes('blob:'))
})

test('every page gets the policy and API responses are never stored', async () => {
  const cfg = require('../next.config.js')
  const rules = await cfg.headers()
  const keys = r => r.headers.map(h => h.key)
  assert.ok(rules.filter(r => r.source !== '/api/:path*').every(r => keys(r).includes('Content-Security-Policy') || keys(r).includes('Content-Security-Policy-Report-Only')))
  assert.ok(rules.some(r => r.source === '/api/:path*' && r.headers.some(h => h.key === 'Cache-Control' && h.value === 'no-store')))
})
