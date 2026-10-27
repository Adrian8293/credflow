import test from 'node:test'
import assert from 'node:assert/strict'
import { providerReadiness } from '../lib/readiness.js'

const ymd = off => { const d = new Date(); d.setDate(d.getDate() + off); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const full = { npi: '1234567893', licenseExp: ymd(200), malExp: ymd(200), caqhDue: ymd(60) }

test('a complete, current profile scores 100', () => assert.equal(providerReadiness(full), 100))
test('missing NPI costs 20', () => assert.equal(providerReadiness({ ...full, npi: '' }), 80))
test('license expiring within 30 days costs 10; expired or missing costs 25', () => {
  assert.equal(providerReadiness({ ...full, licenseExp: ymd(10) }), 90)
  assert.equal(providerReadiness({ ...full, licenseExp: ymd(-1) }), 75)
  assert.equal(providerReadiness({ ...full, licenseExp: '' }), 75)
})
test('malpractice follows the same rule as the license', () => {
  assert.equal(providerReadiness({ ...full, malExp: ymd(5) }), 90)
  assert.equal(providerReadiness({ ...full, malExp: '' }), 75)
})
test('an overdue or missing CAQH date costs 15, and the score never goes below 0', () => {
  assert.equal(providerReadiness({ ...full, caqhDue: ymd(-3) }), 85)
  assert.equal(providerReadiness({}), 15)
})
