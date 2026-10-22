import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import * as X from '../lib/xlsxPatch.js'
import { mkXlsx } from './helpers/mkxlsx.mjs'

const MAPPING = { 0: 'lname', 1: 'fname', 2: 'npi', 3: 'gender', 4: 'licenseExp', 5: 'dob', 6: 'telehealth', 7: 'action' }
const rec = (npi, over = {}) => ({ label: 'Test ' + npi, npi, values: { lname: 'Doe', fname: 'Jo', gender: 'Female', licenseExp: '2027-05-31', telehealth: 'Yes', ...over } })

async function run(bytes, cfg = {}) {
  const wb = await X.openWorkbook(bytes)
  const out = await X.fillSheet(wb, { sheetName: 'Roster', headerRow: 0, mapping: MAPPING, records: [], entity: {}, overwrite: false, allowAppend: true, ...cfg })
  const wb2 = await X.openWorkbook(out.bytes)
  const ws = wb2.sx.Sheets.Roster
  return { ...out, cell: (r, c) => X.cellText(ws, r, c), wb2 }
}

test('suggests fields from payer headings and maps each field once', () => {
  assert.equal(X.suggestField('Provider Last Name'), 'lname')
  assert.equal(X.suggestField('Practitioner Taxonomy Code\n(example: 101YM0800X)'), 'taxonomy')
  assert.equal(X.suggestField('Is Provider Termed? (Y/N)'), 'termedYN')
  assert.equal(X.suggestField('Mailing Address'), '', 'mailing/pay-to addresses are never the practice location')
  assert.equal(X.suggestField('SSN (999-99-9999)'), 'ssn')
  const m = X.autoMapping([{ col: 0, suggest: 'languages' }, { col: 1, suggest: 'languages' }])
  assert.deepEqual(m, { 0: 'languages' })
})

test('fills blanks, matches by NPI, leaves differing values alone and reports them', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '1111111112', '', '', '', ''], ['Smith', 'Al', '2222222223', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112'), rec('2222222223', { lname: 'Jones' })] })
  assert.equal(r.cell(1, 0), 'Doe')                           // blank was filled
  assert.equal(r.cell(2, 0), 'Smith')                         // differing value NOT overwritten
  const d = r.report.differs.find(x => x.field === 'Last name')
  assert.deepEqual([d.theirs, d.ours], ['Smith', 'Jones'])
  assert.equal(r.report.matched, 2)
})

test('overwrite option replaces differing values', async () => {
  const bytes = await mkXlsx({ rows: [['Smith', 'Al', '2222222223', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('2222222223', { lname: 'Jones' })], overwrite: true })
  assert.equal(r.cell(1, 0), 'Jones')
})

test('respects a dropdown: Female becomes F, a value not in the list is left blank and reported', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '1111111112', '', '', '', '']] })
  const a = await run(bytes, { records: [rec('1111111112')] })
  assert.equal(a.cell(1, 3), 'F')
  const b = await run(bytes, { records: [rec('1111111112', { gender: 'Non-binary' })] })
  assert.equal(b.cell(1, 3), '')
  assert.ok(Object.keys(b.report.skipped).some(k => k.startsWith('Gender')))
})

test('follows conventions spelled out in the heading, (Y/N)', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '1111111112', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112')] })
  assert.equal(r.cell(1, 6), 'Y')
})

test('writes a real date serial into a date-formatted cell', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '1111111112', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112')] })
  assert.equal(r.cell(1, 4), '2027-05-31')                    // read back as the same calendar date
  assert.match(await (await JSZip.loadAsync(r.bytes)).file('xl/worksheets/sheet1.xml').async('string'), /<c r="E2" s="2"><v>\d{5}<\/v><\/c>/, 'stored as a true Excel date, not text')
})

test('never fills date of birth or the action column, and says how many DOBs are still needed', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '1111111112', '', '', '', ''], ['', '', '2222222223', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112'), rec('2222222223')] })
  assert.equal(r.cell(1, 5), ''); assert.equal(r.cell(1, 7), '')
  assert.equal(r.report.needManual['Date of birth'].count, 2)
})

test('adds providers missing from the file, and lists rows Lacentra has no record of', async () => {
  const bytes = await mkXlsx({ rows: [['Smith', 'Al', '9999999994', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112')] })
  assert.equal(r.report.appended.length, 1)
  assert.equal(r.cell(2, 2), '1111111112')
  assert.equal(r.report.notInLacentra.length, 1)
  assert.equal(r.cell(1, 0), 'Smith')                         // the unknown row is untouched
  const off = await run(bytes, { records: [rec('1111111112')], allowAppend: false })
  assert.equal(off.report.appended.length, 0)
})

test('protected sheet: fills only unlocked cells, and refuses to add rows the payer locked', async () => {
  // style 1 cells are unlocked in the helper, so use a header-only locked region by building rows with protect=true
  const bytes = await mkXlsx({ protect: true, rows: [['', '', '1111111112', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112'), rec('3333333334')] })
  assert.equal(r.report.protectedSheet, true)
  assert.equal(r.cell(1, 0), 'Doe')                           // unlocked cell filled
  assert.equal(r.report.appended.length, 0)                   // new rows not allowed on a protected sheet
  assert.equal(r.report.cannotAppend.length, 1)
})

test('changes only the sheet that was filled; every other part of the package is byte-identical', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '1111111112', '', '', '', '']] })
  const r = await run(bytes, { records: [rec('1111111112')] })
  const a = await JSZip.loadAsync(bytes), b = await JSZip.loadAsync(r.bytes)
  assert.deepEqual(Object.keys(b.files), Object.keys(a.files))
  for (const name of Object.keys(a.files).filter(n => !a.files[n].dir)) {
    const [x, y] = await Promise.all([a.file(name).async('string'), b.file(name).async('string')])
    if (name === 'xl/worksheets/sheet1.xml') assert.notEqual(x, y); else assert.equal(y, x, name)
  }
  assert.match(await b.file('xl/worksheets/sheet1.xml').async('string'), /<dataValidation /)   // dropdown survived
})

test('a group/location sheet (no NPI column) fills one row of group details', async () => {
  const bytes = await mkXlsx({ rows: [['', '', '', '', '', '', '']], header: ['Group Name', 'Group NPI', 'Tax ID', 'City', 'State', 'ZIP', 'x', 'y'], dropdown: null })
  const wb = await X.openWorkbook(bytes)
  const mapping = { 0: 'groupName', 1: 'groupNpi', 2: 'taxId', 3: 'city', 4: 'state', 5: 'zip' }
  const out = await X.fillSheet(wb, { sheetName: 'Roster', headerRow: 0, mapping, records: [], entity: { groupName: 'Test Group', groupNpi: '1234567893', taxId: '99-9999999', city: 'Beaverton', state: 'OR', zip: '97005' } })
  const ws = (await X.openWorkbook(out.bytes)).sx.Sheets.Roster
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(c => X.cellText(ws, 1, c)), ['Test Group', '1234567893', '99-9999999', 'Beaverton', 'OR', '97005'])
})
