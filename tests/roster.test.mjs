import test from 'node:test'
import assert from 'node:assert/strict'
import { rosterRecords, buildRoster } from '../lib/roster.js'

const prov = (id, over = {}) => ({ id, fname: 'F' + id, lname: 'L' + id, npi: '123456789' + id, status: 'Active', taxonomyCode: '101YC0750X', license: 'X', licenseState: 'OR', licenseExp: '2027-01-01', ...over })
const enr = (id, provId, over = {}) => ({ id, provId, payId: 'pay', stage: 'Active', ...over })
const db = {
  providers: [prov('1'), prov('2', { npi: '' }), prov('3', { status: 'Inactive' }), prov('4'), prov('5')],
  enrollments: [enr('a', '1'), enr('b', '2'), enr('c', '3'), enr('d', '4', { termDate: '2020-01-01' }), enr('e', '5', { stage: 'Application Submitted' }), enr('f', '1', { payId: 'other' })],
}

test('current providers: live enrollments with an NPI; others are reported, not dropped silently', () => {
  const r = rosterRecords(db, { payerId: 'pay', scope: 'active' })
  assert.deepEqual(r.records.map(x => x.label), ['F1 L1'])      // 2 has no NPI, 3 inactive, 4 termed, 5 pending
  assert.deepEqual(r.noNpi, ['F2 L2'])
})

test('pending applications are included only when asked', () => {
  const r = rosterRecords(db, { payerId: 'pay', scope: 'active', includePending: true })
  assert.deepEqual(r.records.map(x => x.label).sort(), ['F1 L1', 'F5 L5'])
})

test('terminated scope returns only ended enrollments, flagged Y', () => {
  const r = rosterRecords(db, { payerId: 'pay', scope: 'termed' })
  assert.deepEqual(r.records.map(x => [x.label, x.values.termedYN]), [['F4 L4', 'Y']])
})

test('never exposes DOB, SSN or a full tax ID; group values come from the group record', () => {
  const r = rosterRecords(db, { payerId: 'pay', entity: { name: 'Grp', type2Npi: '1234567893', einLast4: '6789' }, locations: [{ name: 'Main', address: '1 St', city: 'C', state: 'OR', zip: '97005' }] })
  const keys = Object.keys(r.records[0].values).concat(Object.keys(r.entityValues))
  for (const k of ['dob', 'ssn', 'taxId', 'ein']) assert.ok(!keys.includes(k), k)
  assert.equal(r.entityValues.groupNpi, '1234567893'); assert.equal(r.entityValues.city, 'C')
})

test('the CSV roster flags what is still missing', () => {
  const r = buildRoster({ providers: [prov('1', { taxonomyCode: '' })], enrollments: [enr('a', '1')] }, { payerId: 'pay', entity: null, locations: [] })
  assert.ok(r.missing[0].fields.includes('Taxonomy code'))
})
