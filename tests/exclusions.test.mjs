import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLeie, matchLeie, screeningDue, latestChecks, sourceStatus, openFlags } from '../lib/exclusions.js'

const CSV = [
  'LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WVRSTATE',
  'SMITH,JOHN,,,GEN,SOCIAL WORKER,,1234567893,19700101,1 MAIN,PDX,OR,97201,1128a1,20200115,00000000,00000000,',
  '"O\'BRIEN",MARY,,,GEN,NURSE,,0000000000,19800202,2 OAK,SEA,WA,98101,1128b4,20190301,00000000,00000000,',
  'DOE,JANE,,,GEN,PT,,1245319599,19650505,3 ELM,SLC,UT,84101,1128a1,20150101,20180101,00000000,',
].join('\r\n')

test('parses the LEIE file and skips reinstated entries and empty NPIs', () => {
  const { rows, error } = parseLeie(CSV)
  assert.equal(error, '')
  assert.equal(rows.length, 2)                         // Jane Doe was reinstated
  assert.equal(rows[0].npi, '1234567893')
  assert.equal(rows[1].npi, '')                        // 0000000000 means "no NPI"
  assert.equal(rows[1].last, "O'BRIEN")
})

test('rejects a file that is not the LEIE', () => {
  assert.match(parseLeie('a,b\n1,2').error, /LEIE/)
  assert.match(parseLeie('').error, /empty/)
})

test('matching: NPI is strong, name is possible, everyone else is clear; no date of birth is used', () => {
  const { rows } = parseLeie(CSV)
  const providers = [
    { id: 'a', fname: 'Johnny', lname: 'Smyth', npi: '1234567893' },       // NPI match
    { id: 'b', fname: 'mary', lname: "O'Brien", npi: '' },                   // name match
    { id: 'c', fname: 'Jane', lname: 'Doe', npi: '1245319599' },             // reinstated: not excluded
    { id: 'd', fname: 'Ana', lname: 'Lopez', npi: '' },
  ]
  const { matches, clear } = matchLeie(providers, rows)
  assert.deepEqual(matches.map(m => [m.prov.id, m.strong]), [['a', true], ['b', false]])
  assert.deepEqual(clear.map(p => p.id), ['c', 'd'])
})

const db = (extra) => ({ providers: [{ id: 'a', status: 'Active' }, { id: 'z', status: 'Inactive' }], exclusions: [], ...extra })

test('due logic: never, due after 30 days, ok within 30, inactive providers skipped', () => {
  const today = '2026-10-24'
  assert.equal(screeningDue(db(), today).length, 1)
  assert.equal(screeningDue(db(), today)[0].never, true)
  const fresh = [{ provId: 'a', source: 'OIG LEIE', checkedOn: '2026-10-10', result: 'Clear' }, { provId: 'a', source: 'SAM.gov', checkedOn: '2026-10-20', result: 'Clear' }]
  assert.equal(screeningDue(db({ exclusions: fresh }), today).length, 0)
  const old = [{ provId: 'a', source: 'OIG LEIE', checkedOn: '2026-09-01', result: 'Clear' }, fresh[1]]
  const due = screeningDue(db({ exclusions: old }), today)
  assert.equal(due.length, 1); assert.equal(due[0].never, false); assert.equal(due[0].needs[0].source, 'OIG LEIE')
})

test('before migration 029 (exclusions null) nothing is reported', () => {
  assert.deepEqual(screeningDue(db({ exclusions: null }), '2026-10-24'), [])
  assert.deepEqual(openFlags({ exclusions: null }), [])
})

test('latest check wins; a flag stays open until a newer Clear is recorded', () => {
  const checks = [
    { provId: 'a', source: 'OIG LEIE', checkedOn: '2026-10-01', result: 'Possible match' },
    { provId: 'a', source: 'OIG LEIE', checkedOn: '2026-10-05', result: 'Clear' },
    { provId: 'b', source: 'OIG LEIE', checkedOn: '2026-10-02', result: 'Possible match' },
  ]
  assert.equal(sourceStatus(latestChecks(checks), 'a', 'OIG LEIE', '2026-10-24').result, 'Clear')
  assert.deepEqual(openFlags({ exclusions: checks }).map(c => c.provId), ['b'])
})
