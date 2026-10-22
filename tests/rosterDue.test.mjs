import test from 'node:test'
import assert from 'node:assert/strict'
import { cadenceDays, buildRosterDue, addDays } from '../lib/rosterDue.js'
import { todayStr } from '../lib/matrix.js'

test('understands common roster schedules', () => {
  const cases = { Quarterly: 91, monthly: 30, 'every 2 months': 60, 'semi-annual': 182, Annually: 365, 'bi-weekly': 14, weekly: 7, 'every 6 weeks': 42 }
  for (const [t, d] of Object.entries(cases)) assert.equal(cadenceDays(t), d, t)
  for (const t of ['as needed', '', 'n/a', 'whenever']) assert.equal(cadenceDays(t), null, t)
})

const base = { id: 'c', payerId: 'p', entityId: 'e', rosterCadence: 'quarterly' }
const ctx = { payers: [{ id: 'p', name: 'Aetna' }], entities: [{ id: 'e', name: 'Group' }] }
const today = todayStr()

test('overdue, due soon, not due, never sent', () => {
  const over = buildRosterDue([{ ...base, lastRosterSent: addDays(today, -100) }], ctx)
  assert.equal(over.length, 1); assert.equal(over[0].sev, 'warning'); assert.ok(over[0].days < 0)
  const soon = buildRosterDue([{ ...base, lastRosterSent: addDays(today, -85) }], ctx)
  assert.equal(soon[0].sev, 'notice')
  assert.equal(buildRosterDue([{ ...base, lastRosterSent: addDays(today, -10) }], ctx).length, 0)
  const never = buildRosterDue([base], ctx)
  assert.match(never[0].sub, /no send recorded/)
})

test('ignores ended, not-yet-started and unscheduled contracts', () => {
  assert.equal(buildRosterDue([{ ...base, termDate: addDays(today, -1) }], ctx).length, 0)
  assert.equal(buildRosterDue([{ ...base, contractEffective: addDays(today, 30) }], ctx).length, 0)
  assert.equal(buildRosterDue([{ ...base, rosterCadence: 'as needed' }], ctx).length, 0)
})

test('uses the local calendar date (not UTC), so evening use does not shift the day', () => {
  const d = new Date(); const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  assert.equal(todayStr(), local)
})
