import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIcs, fold } from '../lib/ics.js'
import { buildBackup, rowsToCsv } from '../lib/backup.js'

const items = [
  { type: 'credential', provId: 'p1', title: 'Ana Lopez, LCSW', sub: 'Malpractice · expires in 10d', days: 10 },
  { type: 'credential', provId: 'p1', title: 'Ana Lopez, LCSW', sub: 'License · expires in 10d', days: 10 },
  { type: 'task', taskId: 't1', title: 'Call Aetna, re: W-9; urgent', sub: 'due today', days: 0 },
  { type: 'credential', provId: 'p2', title: 'Old One', sub: 'License · expired 3d ago', days: -3 },
]
const opts = { today: '2026-10-24', now: new Date('2026-10-24T20:00:00Z') }

test('calendar file: all-day events with reminders, expired items left out', () => {
  const { text, count } = buildIcs(items, opts)
  assert.equal(count, 3)
  assert.match(text, /^BEGIN:VCALENDAR\r\n/)
  assert.match(text, /END:VCALENDAR\r\n$/)
  assert.match(text, /DTSTART;VALUE=DATE:20261103\r\n/)    // 10 days after Oct 24
  assert.match(text, /DTEND;VALUE=DATE:20261104\r\n/)
  assert.match(text, /DTSTART;VALUE=DATE:20261024\r\n/)
  assert.equal((text.match(/BEGIN:VALARM/g) || []).length, 6)
  assert.doesNotMatch(text, /Old One/)
})

test('calendar file: ids are stable, distinct, and special characters are escaped', () => {
  const a = buildIcs(items, opts).text, b = buildIcs(items, { ...opts, now: new Date('2026-10-25T01:00:00Z') }).text
  const uids = (t) => [...t.matchAll(/UID:(.+)\r\n/g)].map(m => m[1])
  assert.deepEqual(uids(a), uids(b))                       // same event ids on re-export (re-import updates, not duplicates)
  assert.equal(new Set(uids(a)).size, 3)                   // license and malpractice on the same day stay separate
  assert.match(a, /Call Aetna\\, re: W-9\; urgent/)
})

test('long lines fold at 75 bytes without splitting characters', () => {
  const line = 'SUMMARY:' + 'é'.repeat(80)
  const folded = fold(line).split('\r\n')
  assert.ok(folded.length > 1)
  folded.forEach(l => assert.ok(new TextEncoder().encode(l).length <= 75))
  assert.equal(folded.map((l, i) => i ? l.slice(1) : l).join(''), line)
})

test('backup: one CSV per table, a JSON copy, a README, and honest warnings', () => {
  const data = {
    providers: [{ id: 'p1', fname: 'Ana', lname: 'Lopez', npi: '1234567893', extra: { a: 1 } }, { id: 'p2', fname: 'Bo', lname: 'X', notes: '=1+1' }],
    enrollments: [], payers: [{ id: 'y', name: 'Aetna' }], settings: { practice: 'PIS' },
    providersMeta: { truncated: true, total: 3000 },
  }
  const { files, counts, notes } = buildBackup(data, { date: '2026-10-24' })
  assert.equal(counts.providers, 2)
  assert.ok(files['providers.csv'].includes('"Lopez"'))
  assert.ok(files['providers.csv'].includes('{""a"":1}'))        // nested values kept as JSON
  assert.ok(files['providers.csv'].includes(`"'=1+1"`))            // spreadsheet formulas neutralised
  assert.ok(files['lacentra-backup.json'].includes('"exportedOn": "2026-10-24"'))
  assert.match(files['README.txt'], /NOT inside/)
  assert.equal(notes.length, 1)
  assert.match(files['README.txt'], /incomplete/)
  assert.equal(rowsToCsv([]), '')
})
