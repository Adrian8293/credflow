import test from 'node:test'
import assert from 'node:assert/strict'
import { providerFromDb, providerToDb } from '../lib/mappers.js'

const NEW = ['gender', 'languages', 'accepts_new_patients', 'telehealth']

test('before migration 023 the new columns are never sent, so saving a provider still works', () => {
  const p = providerFromDb({ id: '1', fname: 'A', lname: 'B' })
  assert.ok(!('gender' in p))
  assert.deepEqual(Object.keys(providerToDb(p)).filter(k => NEW.includes(k)), [])
})

test('after migration 023 the answers round-trip, and clearing one really clears it', () => {
  const p = providerFromDb({ id: '1', fname: 'A', lname: 'B', gender: 'Female', languages: 'English', accepts_new_patients: true, telehealth: false })
  assert.deepEqual([p.gender, p.languages, p.acceptsNew, p.telehealth], ['Female', 'English', 'Yes', 'No'])
  const db = providerToDb({ ...p, gender: '', acceptsNew: '' })
  assert.equal(db.gender, null); assert.equal(db.accepts_new_patients, null); assert.equal(db.telehealth, false)
})
