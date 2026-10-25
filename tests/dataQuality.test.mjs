import test from 'node:test'
import assert from 'node:assert/strict'
import { dataQualityIssues } from '../lib/dataQuality.js'

const prov = (id, fname, lname, npi, extra = {}) => ({ id, fname, lname, npi, status: 'Active', license: 'L1', licenseExp: '2030-01-01', malExp: '2030-01-01', ...extra })
const db = (providers, enrollments = []) => ({ providers, enrollments, documents: [], payers: [{ id: 'x', name: 'Payer X' }] })
const texts = (d) => dataQualityIssues(d).map(i => i.issue)

test('flags two providers with the same name but different NPIs', () => {
  const t = texts(db([prov('1', 'Ana', 'Lopez', '1234567893'), prov('2', 'ana', 'LOPEZ ', '1245319599')]))
  assert.equal(t.filter(x => x.startsWith('Possible duplicate')).length, 2)
})

test('does not flag different people, or inactive ones', () => {
  assert.equal(texts(db([prov('1', 'Ana', 'Lopez', '1234567893'), prov('2', 'Ann', 'Lopez', '1245319599')])).filter(x => x.startsWith('Possible duplicate')).length, 0)
  assert.equal(texts(db([prov('1', 'Ana', 'Lopez', '1234567893'), prov('2', 'Ana', 'Lopez', '1245319599', { status: 'Inactive' })])).filter(x => x.startsWith('Possible duplicate')).length, 0)
})

test('same NPI is reported once as an NPI problem, not also as a name duplicate', () => {
  const t = texts(db([prov('1', 'Ana', 'Lopez', '1234567893'), prov('2', 'Ana', 'Lopez', '1234567893')]))
  assert.ok(t.includes('Same NPI as another provider'))
  assert.equal(t.filter(x => x.startsWith('Possible duplicate')).length, 0)
})

test('flags the same provider+payer+level entered twice, but not a Denied one or a different level', () => {
  const p = [prov('1', 'Ana', 'Lopez', '1234567893')]
  const e = (id, stage, level = 'Individual') => ({ id, provId: '1', payId: 'x', stage, level, submitted: '2026-01-01', followup: '2026-02-01' })
  const dup = texts(db(p, [e('a', 'Under Review'), e('b', 'Under Review')])).filter(x => x.startsWith('Duplicate application'))
  assert.equal(dup.length, 2)
  assert.equal(texts(db(p, [e('a', 'Under Review'), e('b', 'Denied')])).filter(x => x.startsWith('Duplicate application')).length, 0)
  assert.equal(texts(db(p, [e('a', 'Under Review'), e('b', 'Under Review', 'Group')])).filter(x => x.startsWith('Duplicate application')).length, 0)
})

test('flags an Active enrollment whose effective date has no recorded source', () => {
  const p = [prov('1', 'Ana', 'Lopez', '1234567893')]
  const e = (extra) => ({ id: 'a', provId: '1', payId: 'x', stage: 'Active', level: 'Individual', submitted: '2026-01-01', effective: '2026-03-01', ...extra })
  const has = (d) => texts(d).some(x => x.startsWith('Effective date has no recorded source'))
  assert.equal(has(db(p, [e({ datesSource: '' })])), true)
  assert.equal(has(db(p, [e({ datesSource: 'Payer letter or email' })])), false)
  assert.equal(has(db(p, [e({})])), false)          // before migration 028 the column does not exist: stay quiet
})
