import test from 'node:test'
import assert from 'node:assert/strict'
import { todayIn, daysBetween, daysUntilDate } from '../lib/tzDate.js'
import { validNpi } from '../lib/providerImport.js'
import { photoStoragePath } from '../lib/photoPath.js'

test('today is counted in the practice zone, not UTC', () => {
  const evening = new Date('2026-10-24T02:30:00Z')       // 7:30pm Oct 23 in Pacific
  assert.equal(todayIn('America/Los_Angeles', evening), '2026-10-23')
  assert.equal(todayIn('UTC', evening), '2026-10-24')
  const morning = new Date('2026-10-24T14:00:00Z')       // 7am Pacific — the scheduled run
  assert.equal(todayIn('America/Los_Angeles', morning), '2026-10-24')
})

test('days until follows the practice calendar', () => {
  const evening = new Date('2026-10-24T02:30:00Z')       // still Oct 23 in Pacific
  assert.equal(daysUntilDate('2026-10-23', evening, 'America/Los_Angeles'), 0)
  assert.equal(daysUntilDate('2026-10-24', evening, 'America/Los_Angeles'), 1)
  assert.equal(daysUntilDate('2026-10-22', evening, 'America/Los_Angeles'), -1)
  assert.equal(daysUntilDate('', evening), null)
  assert.equal(daysUntilDate('2026-10-23T09:00:00Z', evening, 'America/Los_Angeles'), 0)   // timestamps use their date part
})

test('days between survives daylight-saving changes', () => {
  assert.equal(daysBetween('2026-11-01', '2026-11-02'), 1)   // the clocks go back on Nov 1
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2)
  assert.equal(daysBetween('x', '2026-03-09'), null)
})

test('NPI check digit', () => {
  assert.equal(validNpi('1234567893'), true)    // the standard example NPI
  assert.equal(validNpi('1234567890'), false)
  assert.equal(validNpi('12345'), false)
  assert.equal(validNpi('abcdefghij'), false)
})

test('photo path from stored value', () => {
  assert.equal(photoStoragePath('abc/avatar.jpg'), 'abc/avatar.jpg')
  assert.equal(photoStoragePath('abc/avatar.jpg#1700000000'), 'abc/avatar.jpg')
  assert.equal(photoStoragePath('https://x.supabase.co/storage/v1/object/public/provider-photos/abc/avatar.png?t=1'), 'abc/avatar.png')
  assert.equal(photoStoragePath('https://example.com/pic.jpg'), null)
  assert.equal(photoStoragePath(''), null)
})
