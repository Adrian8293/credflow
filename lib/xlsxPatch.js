/**
 * xlsxPatch — fill cells in a payer's own .xlsx WITHOUT rebuilding the file.
 *
 * Why not just load it into a spreadsheet library and save it again? Payer rosters carry things those libraries drop:
 * form controls, images, protection, dropdown lists, hidden columns, revision history. So this opens the .xlsx as a zip,
 * changes only the few <c> cells it has to inside the sheet's XML, and leaves every other byte of the package alone.
 *
 * Runs entirely in the browser; the payer's file is never uploaded anywhere.
 * Pure functions plus jszip and xlsx (SheetJS, used read-only for values).
 */
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

// ─── small helpers ───────────────────────────────────────────────────────────
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attr = (s, name) => { const m = s.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"')); return m ? unesc(m[1]) : null }
export const colLetters = i => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
export const colIndex = letters => letters.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
export const norm = t => String(t ?? '').toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim()

// ─── dates ────────────────────────────────────────────────────────────────────
const serialToIso = v => new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
const isoToSerial = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000 + 25569)
export function toIso(x) {
  if (x == null || x === '') return ''
  const s = String(x).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` }
  return ''
}
const isoToUs = iso => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}` }

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])
function formatIsDate(id, code) {
  if (BUILTIN_DATE_FMTS.has(id)) return true
  if (!code) return false
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[dmy]/i.test(c) && !/general/i.test(c)
}

// ─── open ─────────────────────────────────────────────────────────────────────
/** @returns {Promise<{zip, sheets: {name, path, hidden}[], names: Object, styles: {locked, isDate}[], sx: any}>} */
export async function openWorkbook(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  const zip = await JSZip.loadAsync(bytes, { createFolders: false })
  const wbFile = zip.file('xl/workbook.xml')
  if (!wbFile) throw new Error('This does not look like an .xlsx workbook.')
  const wbXml = await wbFile.async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const rels = {}
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target')
  const sheets = []
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const t = rels[attr(m[0], 'r:id')]
    if (!t) continue
    sheets.push({ name: attr(m[0], 'name'), path: t.startsWith('/') ? t.slice(1) : 'xl/' + t, hidden: /hidden/i.test(attr(m[0], 'state') || '') })
  }
  const names = {}
  for (const m of wbXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    const n = attr(m[1], 'name'); if (n && !attr(m[1], 'localSheetId')) names[n] = unesc(m[2])
  }
  // styles: locked? date?
  const styles = []
  const stF = zip.file('xl/styles.xml')
  if (stF) {
    const st = await stF.async('string')
    const custom = {}
    for (const m of st.matchAll(/<numFmt\b[^>]*>/g)) custom[+attr(m[0], 'numFmtId')] = attr(m[0], 'formatCode')
    const xfs = st.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
    if (xfs) {
      for (const m of xfs[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)) {
        const id = +(attr(m[0], 'numFmtId') || 0)
        styles.push({ locked: !/<protection\b[^>]*locked="0"/.test(m[0]), isDate: formatIsDate(id, custom[id]) })
      }
    }
  }
  const sx = XLSX.read(bytes, { type: 'array', cellFormula: false })
  return { zip, sheets, names, styles, sx }
}

// ─── reading a sheet (via SheetJS) ───────────────────────────────────────────
function sheetRange(ws) { const r = XLSX.utils.decode_range(ws['!ref'] || 'A1'); return r }
/** Text of a cell, 0-based row/col. Dates come back as ISO yyyy-mm-dd when the cell is a date. */
export function cellText(ws, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  if (!cell || cell.v == null) return ''
  if (cell.t === 'n') {
    if (cell.w && /[/-]|[A-Za-z]/.test(cell.w) && /\d/.test(cell.w) && cell.v > 20000 && cell.v < 80000) return serialToIso(cell.v)
    return Number.isInteger(cell.v) ? String(cell.v) : String(cell.w ?? cell.v)
  }
  return String(cell.v).trim()
}

// ─── header detection and field suggestion ───────────────────────────────────
const RULES = [
  ['ssn', /\bssn\b|social security/],
  ['dob', /\bdob\b|date of birth|birth ?date/],
  ['action', /^action$/],
  ['termedYN', /\btermed\b.*\by n\b|is (the )?(provider|practitioner) termed/],
  ['taxId', /\btax ?id\b|\btaxid\b|^tin$|\bein\b|federal tax/],
  ['groupNpi', /(group|clinic|organi[sz]ation(al)?|facility|billing|type 2) npi|npi type 2|type 2 organi/],
  ['locTaxonomy', /(type 2|organi[sz]ational|group|clinic|facility).*taxonomy/],
  ['npi', /\bnpi\b/],
  ['taxonomy', /taxonomy/],
  ['licenseExp', /licen[sc]e.*(exp|expir)/],
  ['licenseState', /licen[sc]e.*state|state.*licen[sc]e|licensing state/],
  ['license', /licen[sc]e (number|no|#)|^licen[sc]e( id)?$|licen[sc]e id|state licen[sc]e/],
  ['cred', /licen[sc]e type|credential|^title$|degree|provider type|^license level$/],
  ['caqh', /caqh/],
  ['lname', /last name|surname|family name/],
  ['fname', /first name|given name/],
  ['email', /(provider|practitioner|individual) e ?mail|^e ?mail( address)?$/],
  ['gender', /\bgender\b|^sex$/],
  ['languages', /language/],
  ['acceptsNew', /new patient/],
  ['telehealth', /telemedicine|telehealth/],
  ['spec', /specialty|speciality/],
  ['termDate', /^(term(ination|ed)?|end) date\b|^date terminated$/],
  ['effective', /^(effective|eff|start) date\b|^eff(ective)? start( date)?$|^date added$/],
  ['payerProviderId', /(provider|payer|payor|plan|php|kp)( internal)? ?id$|kp internal ?id/],
  ['contractNo', /contract (#|number|no)/],
  ['groupName', /group name|provider group|(practice|organi[sz]ation|clinic|facility|legal) name|^group$|^practice$/],
  ['locName', /^(service )?location( name)?$|^service location name$/],
  ['addr1', /^(service loc(ation)? |physical |practice |location )?(street )?address( line)? ?1?( cms 1500 hcfa)?$|^street$|^service loc addr( cms 1500 hcfa)?$|^physical address line ?1$/],
  ['city', /^(service loc(ation)? |physical |practice |location )?city$/],
  ['state', /^(service loc(ation)? |physical |practice |location )?state$/],
  ['zip', /^(service loc(ation)? |physical |practice |location )?(zip|postal)( code)?$/],
]
const EXCLUDE = /mailing|pay to|1099|billing address|alternate|secondary|previous|former/

/**
 * First-guess mapping for a header list: { colIndex: field }. When several columns look like the same field
 * (e.g. two "Languages" columns) only the first is mapped, so one value is never written into two places.
 */
export function autoMapping(headers) {
  const used = new Set(), out = {}
  headers.forEach(h => { if (h.suggest && !used.has(h.suggest)) { used.add(h.suggest); out[h.col] = h.suggest } })
  return out
}

/** What each field is called on screen, and whether Lacentra will ever write it. */
export const FIELD_INFO = {
  lname: { label: 'Last name' }, fname: { label: 'First name' }, cred: { label: 'Credential / license type' },
  spec: { label: 'Specialty' }, npi: { label: 'Individual NPI (match key)' }, taxonomy: { label: 'Taxonomy code' },
  license: { label: 'License number' }, licenseState: { label: 'License state' }, licenseExp: { label: 'License expiration' },
  caqh: { label: 'CAQH ID' }, email: { label: 'Provider email' }, gender: { label: 'Gender' }, languages: { label: 'Languages' },
  acceptsNew: { label: 'Accepting new patients' }, telehealth: { label: 'Offers telehealth' },
  effective: { label: 'Effective date' }, termDate: { label: 'Term date' }, termedYN: { label: 'Termed? (Y/N)' },
  payerProviderId: { label: "Payer's provider ID" }, contractNo: { label: 'Contract #' },
  groupName: { label: 'Group name' }, groupNpi: { label: 'Group NPI (Type 2)' }, taxId: { label: 'Tax ID (typed at export)' },
  locName: { label: 'Location name' }, addr1: { label: 'Street address' }, city: { label: 'City' }, state: { label: 'State' }, zip: { label: 'ZIP' },
  locTaxonomy: { label: 'Group taxonomy' },
  dob: { label: 'Date of birth (never filled)', never: true }, ssn: { label: 'SSN (never filled)', never: true }, action: { label: 'Action code (never filled)', never: true },
}
export const FIELD_KEYS = Object.keys(FIELD_INFO)

export function suggestField(header) {
  // Payers bury instructions in the heading ("Taxonomy Code (example: 101YM0800X)"), so match on the first line / text before "(".
  const n = norm(String(header ?? '').split(/[\n(]/)[0])
  if (!n) return ''
  if (EXCLUDE.test(n)) return ''
  for (const [f, re] of RULES) if (re.test(n)) return f
  return ''
}

/** Best guess at which row holds the column headings (0-based). */
export function detectHeaderRow(ws) {
  const rg = sheetRange(ws)
  let best = -1, bestScore = 0, firstTexty = -1
  for (let r = rg.s.r; r <= Math.min(rg.e.r, 40); r++) {
    let score = 0, texts = 0
    for (let c = rg.s.c; c <= rg.e.c; c++) {
      const t = cellText(ws, r, c)
      if (t && isNaN(+t)) { texts++; if (suggestField(t)) score++ }
    }
    if (firstTexty < 0 && texts >= 3) firstTexty = r
    if (score > bestScore) { best = r; bestScore = score }
  }
  return bestScore >= 2 ? best : (firstTexty >= 0 ? firstTexty : 0)
}

/** [{ col, text, key, suggest }] for the header row. */
export function readHeaders(ws, headerRow) {
  const rg = sheetRange(ws), out = []
  for (let c = 0; c <= rg.e.c; c++) {
    const text = cellText(ws, headerRow, c)
    if (text) out.push({ col: c, text, key: norm(text), suggest: suggestField(text) })
  }
  return out
}

// ─── dropdown lists ───────────────────────────────────────────────────────────
function parseRef(ref, defaultSheet) {
  const m = ref.match(/^(?:'((?:[^']|'')+)'|([^'!]+))?!?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/)
  if (!m) return null
  const sheet = m[1] ? m[1].replace(/''/g, "'") : (m[2] && ref.includes('!') ? m[2] : defaultSheet)
  return { sheet, c1: colIndex(m[3]), r1: +m[4] - 1, c2: colIndex(m[5] || m[3]), r2: +(m[6] || m[4]) - 1 }
}
function rangesFromSqref(sq) {
  return sq.split(/\s+/).filter(Boolean).map(p => {
    const m = p.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/); if (!m) return null
    return { c1: colIndex(m[1]), r1: +m[2] - 1, c2: colIndex(m[3] || m[1]), r2: +(m[4] || m[2]) - 1 }
  }).filter(Boolean)
}
function resolveList(wb, formula, sheetName, depth = 0) {
  let f = unesc(formula).trim()
  if (!f) return null
  if (f.startsWith('"')) return f.replace(/^"|"$/g, '').split(',').map(s => s.trim()).filter(Boolean)
  if (wb.names[f] && depth < 2) return resolveList(wb, wb.names[f], sheetName, depth + 1)
  const ref = parseRef(f.replace(/^=/, ''), sheetName)
  if (!ref) return null
  const ws = wb.sx.Sheets[ref.sheet]
  if (!ws) return null
  const vals = []
  for (let r = ref.r1; r <= ref.r2 && vals.length < 500; r++) for (let c = ref.c1; c <= ref.c2; c++) { const t = cellText(ws, r, c); if (t) vals.push(t) }
  return vals
}
/** Dropdown rules for a sheet: [{ ranges, options|null }]  (options null = a list we could not read). */
async function readValidations(wb, sheet) {
  const xml = await wb.zip.file(sheet.path).async('string')
  const out = []
  for (const m of xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
    if (attr(m[1], 'type') !== 'list') continue
    const f = m[2].match(/<formula1>([\s\S]*?)<\/formula1>/)
    out.push({ ranges: rangesFromSqref(attr(m[1], 'sqref') || ''), options: f ? resolveList(wb, f[1], sheet.name) : null })
  }
  for (const m of xml.matchAll(/<x14:dataValidation\b([^>]*)>([\s\S]*?)<\/x14:dataValidation>/g)) {
    if (attr(m[1], 'type') !== 'list') continue
    const f = m[2].match(/<xm:f>([\s\S]*?)<\/xm:f>/), sq = m[2].match(/<xm:sqref>([\s\S]*?)<\/xm:sqref>/)
    out.push({ ranges: rangesFromSqref(sq ? sq[1] : ''), options: f ? resolveList(wb, f[1], sheet.name) : null })
  }
  return out
}
const inRanges = (rs, r, c) => rs.some(x => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2)

/** Pick the option that means the same as `value` ("Female" → "F", "Yes" → "Y (Yes)"). null if none does. */
export function matchOption(value, options) {
  const v = norm(value)
  if (!v) return null
  for (const o of options) if (norm(o) === v) return o
  for (const o of options) { const t = norm(o).split(' '); if (t.includes(v)) return o }
  for (const o of options) { const n = norm(o); if (n.length <= 2 && v.startsWith(n) && !/^(non|no)/.test(v)) return o }
  return null
}

// ─── sheet XML patcher ────────────────────────────────────────────────────────
class SheetXml {
  constructor(xml) {
    this.xml = xml
    let x = xml.replace(/<sheetData\s*\/>/, '<sheetData></sheetData>')
    const open = x.indexOf('<sheetData>'), close = x.lastIndexOf('</sheetData>')
    if (open < 0 || close < 0) throw new Error('Unreadable sheet.')
    this.head = x.slice(0, open + 11)
    this.tail = x.slice(close)
    const body = x.slice(open + 11, close)
    this.rows = []                       // { r, raw, parsed? }
    for (const m of body.matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)) this.rows.push({ r: +attr(m[0].match(/^<row\b[^>]*>/)[0], 'r'), raw: m[0] })
    this.protection = (x.match(/<sheetProtection\b[^>]*\/?>/) || [''])[0]
    this.hasTables = /<tableParts\b/.test(x)
  }
  get isProtected() { return /(?:^|\s)sheet="(1|true)"/.test(this.protection) }
  get rowsLocked() { return this.isProtected && !/insertRows="(0|false)"/.test(this.protection) }
  find(r) { return this.rows.find(x => x.r === r) }
  parsed(r) {
    const row = this.find(r); if (!row) return null
    if (!row.parsed) {
      const head = row.raw.match(/^<row\b([^>]*?)(\/?)>/)
      const cells = []
      if (!head[2]) {
        const inner = row.raw.slice(head[0].length, row.raw.lastIndexOf('</row>'))
        for (const m of inner.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const a = m[1]; const ref = attr(a, 'r')
          cells.push({ col: colIndex(ref.replace(/\d+/g, '')), s: attr(a, 's'), hasFormula: /<f\b/.test(m[2] || ''), raw: m[0] })
        }
      }
      row.parsed = { attrs: head[1].replace(/\s*spans="[^"]*"/, ''), cells, dirty: false }
    }
    return row.parsed
  }
  cellStyle(r, c) { const p = this.parsed(r); const cell = p && p.cells.find(x => x.col === c); return cell ? cell.s : null }
  hasFormula(r, c) { const p = this.parsed(r); const cell = p && p.cells.find(x => x.col === c); return !!(cell && cell.hasFormula) }
  ensureRow(r) {
    if (this.find(r)) return
    const row = { r, raw: `<row r="${r}"></row>` }
    const at = this.rows.findIndex(x => x.r > r)
    if (at < 0) this.rows.push(row); else this.rows.splice(at, 0, row)
  }
  set(r1, c, kind, value, style) {
    this.ensureRow(r1)
    const p = this.parsed(r1)
    const ref = colLetters(c) + r1
    const sAttr = style != null ? ` s="${style}"` : ''
    const xml = kind === 'num'
      ? `<c r="${ref}"${sAttr}><v>${value}</v></c>`
      : `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
    const cell = { col: c, s: style, raw: xml }
    const i = p.cells.findIndex(x => x.col === c)
    if (i >= 0) p.cells[i] = cell
    else { const at = p.cells.findIndex(x => x.col > c); if (at < 0) p.cells.push(cell); else p.cells.splice(at, 0, cell) }
    p.dirty = true
  }
  serialize() {
    let maxR = 0, maxC = 0
    const body = this.rows.map(row => {
      maxR = Math.max(maxR, row.r)
      if (row.parsed) row.parsed.cells.forEach(c => { maxC = Math.max(maxC, c.col) })
      if (!row.parsed || !row.parsed.dirty) return row.raw
      return `<row${row.parsed.attrs}>${row.parsed.cells.map(c => c.raw).join('')}</row>`
    }).join('')
    let head = this.head
    head = head.replace(/<dimension\b[^>]*ref="([^"]+)"[^>]*\/>/, (all, ref) => {
      const m = ref.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/); if (!m) return all
      const c2 = Math.max(colIndex(m[3] || m[1]), maxC), r2 = Math.max(+(m[4] || m[2]), maxR)
      return all.replace(ref, `${m[1]}${m[2]}:${colLetters(c2)}${r2}`)
    })
    return head + body + this.tail
  }
}

// ─── the fill ─────────────────────────────────────────────────────────────────
const DATE_FIELDS = new Set(['licenseExp', 'effective', 'termDate'])
const FORMATTED_FIELDS = new Set(['gender', 'languages', 'acceptsNew', 'telehealth', 'spec', 'cred', 'termedYN'])
const sameValue = (field, a, b) => {
  if (DATE_FIELDS.has(field)) return toIso(a) === toIso(b) && toIso(a) !== ''
  if (field === 'zip') return String(a).replace(/\D/g, '').slice(0, 5) === String(b).replace(/\D/g, '').slice(0, 5)
  if (['npi', 'groupNpi', 'caqh', 'taxId'].includes(field)) return String(a).replace(/\D/g, '') === String(b).replace(/\D/g, '')
  return norm(a) === norm(b)
}

/**
 * @param wb        from openWorkbook
 * @param cfg       { sheetName, headerRow (0-based), mapping { colIndex: field }, records, entity, overwrite, allowAppend }
 *                  records: [{ label, npi, values: {field: string} }]   (provider level)
 *                  entity:  { field: string }                          (group, location, tax ID typed at export…)
 * @returns { bytes: Uint8Array, report }
 */
export async function fillSheet(wb, cfg) {
  const sheet = wb.sheets.find(s => s.name === cfg.sheetName)
  if (!sheet) throw new Error('Sheet not found: ' + cfg.sheetName)
  const ws = wb.sx.Sheets[sheet.name]
  const sx = new SheetXml(await wb.zip.file(sheet.path).async('string'))
  const vals = await readValidations(wb, sheet)
  const rg = sheetRange(ws)
  const h = cfg.headerRow
  const colOf = {}
  Object.entries(cfg.mapping).forEach(([c, f]) => { if (f && !FIELD_INFO[f]?.never) colOf[f] = +c })
  const headerOf = c => cellText(ws, h, c)
  const providerLevel = colOf.npi != null
  const entity = cfg.entity || {}

  const report = {
    sheet: sheet.name, mode: providerLevel ? 'providers' : 'group', filled: 0, alreadyRight: 0,
    matched: 0, appended: [], cannotAppend: [], notInLacentra: [], differs: [], skipped: {}, needManual: {}, protectedSheet: sx.isProtected, formulaCells: 0,
  }
  const skip = (key, why) => { const k = key + '|' + why; report.skipped[k] = (report.skipped[k] || 0) + 1 }

  // Pseudo-option lists learned from what the payer already typed in the column.
  const learned = {}
  function learnedOptions(c) {
    if (learned[c]) return learned[c]
    const seen = new Set()
    for (let r = h + 1; r <= rg.e.r; r++) {
      const t = cellText(ws, r, c); if (!t) continue
      t.split(/\s*[,;]\s*/).forEach(x => x && seen.add(x))
      if (seen.size > 40) break
    }
    return (learned[c] = [...seen])
  }

  function pickValue(field, c, r, value) {
    // 1. a real dropdown wins
    const v = vals.find(x => inRanges(x.ranges, r, c))
    if (v) {
      if (!v.options) return { skip: 'dropdown we could not read' }
      const parts = field === 'languages' ? value.split(/\s*,\s*/) : [value]
      const m = parts.map(p => matchOption(p, v.options)).filter(Boolean)
      if (!m.length) return { skip: 'not one of the payer’s dropdown choices' }
      return { text: m.join(', ') }
    }
    // 2. a convention spelled out in the heading, e.g. "Gender (M,F)" or "Telehealth (Y/N)"
    const hint = String(headerOf(c) || '')
    if (field === 'gender') {
      if (/\bm\s*[,/]\s*f\b|\bf\s*[,/]\s*m\b/i.test(hint)) { const g = norm(value)[0]; return g === 'f' || g === 'm' ? { text: g.toUpperCase() } : { skip: 'the payer only accepts M or F' } }
    }
    if (['acceptsNew', 'telehealth', 'termedYN'].includes(field)) {
      const yn = /\by\s*[,/]\s*n\b|\(y\/n\)/i.test(hint)
      const yesno = /yes\s*\/\s*no/i.test(hint)
      if (yn || yesno) { const y = /^(y|yes|true)/i.test(value); return { text: yn ? (y ? 'Y' : 'N') : (y ? 'Yes' : 'No') } }
    }
    // 3. wording the payer already uses in this column
    if (FORMATTED_FIELDS.has(field)) {
      const opts = learnedOptions(c)
      if (opts.length) {
        const parts = field === 'languages' ? value.split(/\s*,\s*/) : [value]
        const m = parts.map(p => matchOption(p, opts)).filter(Boolean)
        if (!m.length) return { skip: 'your value does not match the payer’s wording for this column' }
        return { text: m.join(', ') }
      }
    }
    return { text: value }
  }

  function styleFor(r, c, sampleRows) {
    const own = sx.cellStyle(r, c)
    if (own != null) return own
    for (const sr of sampleRows) { const s = sx.cellStyle(sr, c); if (s != null) return s }
    return null
  }
  const lockedStyle = s => sx.isProtected && (wb.styles[+(s ?? 0)]?.locked ?? true)

  /** Try to put one value into one cell. Returns true if written. */
  function put(field, r, c, value, sampleRows) {
    if (value === '' || value == null) return false
    const name = FIELD_INFO[field]?.label || field
    if (sx.hasFormula(r, c)) { report.formulaCells++; return false }
    const existing = cellText(ws, r, c)
    if (existing && sameValue(field, existing, value)) { report.alreadyRight++; return false }
    if (existing && !cfg.overwrite) {
      report.differs.push({ row: r + 1, field: name, theirs: existing, ours: value })
      return false
    }
    const style = styleFor(r, c, sampleRows)
    if (lockedStyle(style)) { skip(name, 'locked by the payer'); return false }
    const pv = pickValue(field, c, r, value)
    if (pv.skip) { skip(name, pv.skip); return false }
    let text = pv.text
    if (DATE_FIELDS.has(field)) {
      const iso = toIso(text)
      if (!iso) { skip(name, 'not a valid date'); return false }
      if (wb.styles[+(style ?? 0)]?.isDate) sx.set(r + 1, c, 'num', isoToSerial(iso), style)
      else sx.set(r + 1, c, 'str', isoToUs(iso), style)
    } else {
      const colNumeric = (() => { for (let rr = h + 1; rr <= Math.min(rg.e.r, h + 40); rr++) { const cell = ws[XLSX.utils.encode_cell({ r: rr, c })]; if (cell && cell.v != null && cell.v !== '') return cell.t === 'n' } return false })()
      if (colNumeric && /^\d{1,15}$/.test(text) && ['npi', 'groupNpi', 'caqh', 'zip'].includes(field)) sx.set(r + 1, c, 'num', text, style)
      else sx.set(r + 1, c, 'str', text, style)
    }
    report.filled++
    return true
  }

  // Values that are the same for every row (group, location, tax ID).
  const entityFields = ['groupName', 'groupNpi', 'taxId', 'locName', 'addr1', 'city', 'state', 'zip', 'locTaxonomy', 'contractNo']
  const fillEntityCells = (r, sampleRows) => entityFields.forEach(f => { if (colOf[f] != null && entity[f]) put(f, r, colOf[f], entity[f], sampleRows) })

  if (!providerLevel) {
    // Group / location sheet (e.g. Kaiser "Company Information"): one data row.
    const r = h + 1
    const sample = [r]
    if (!sx.find(r + 1) || true) fillEntityCells(r, sample)
    report.matched = 1
  } else {
    // Provider sheet: match rows by NPI.
    const npiCol = colOf.npi
    const rowsByNpi = new Map()
    let lastData = h
    const nameCol = colOf.lname
    for (let r = h + 1; r <= rg.e.r; r++) {
      const npi = cellText(ws, r, npiCol).replace(/\D/g, '')
      const nm = nameCol != null ? cellText(ws, r, nameCol) : ''
      if (npi || nm) lastData = r
      if (npi) { if (!rowsByNpi.has(npi)) rowsByNpi.set(npi, []); rowsByNpi.get(npi).push(r) }
    }
    const providerFields = Object.keys(colOf).filter(f => !entityFields.includes(f) && f !== 'npi' && !['action'].includes(f))
    const seen = new Set()
    const sampleRows = lastData > h ? [lastData, h + 1] : []
    const toAdd = []
    for (const rec of cfg.records) {
      const rows = rowsByNpi.get((rec.npi || '').replace(/\D/g, ''))
      if (!rows) { toAdd.push(rec); continue }
      seen.add((rec.npi || '').replace(/\D/g, ''))
      report.matched++
      for (const r of rows) {
        for (const f of providerFields) if (rec.values[f]) put(f, r, colOf[f], rec.values[f], sampleRows)
        fillEntityCells(r, sampleRows)
      }
    }
    // Rows in the file that Lacentra has no enrollment for.
    rowsByNpi.forEach((rows, npi) => {
      if (seen.has(npi)) return
      const r = rows[0]
      const nm = [colOf.fname != null ? cellText(ws, r, colOf.fname) : '', nameCol != null ? cellText(ws, r, nameCol) : ''].filter(Boolean).join(' ')
      report.notInLacentra.push({ row: r + 1, name: nm || 'Row ' + (r + 1), npi })
    })
    // Providers Lacentra has that the file does not: use the next empty row.
    let nextRow = lastData + 1
    for (const rec of toAdd) {
      if (cfg.allowAppend === false) { report.cannotAppend.push({ name: rec.label, why: 'adding rows was switched off' }); continue }
      const exists = !!sx.find(nextRow + 1)
      if (!exists && sx.hasTables) { report.cannotAppend.push({ name: rec.label, why: 'the sheet is a locked table' }); continue }
      if (!exists && sx.rowsLocked) { report.cannotAppend.push({ name: rec.label, why: 'the payer’s file does not allow new rows' }); continue }
      const before = report.filled
      put('npi', nextRow, npiCol, rec.npi, sampleRows)
      for (const f of providerFields) if (rec.values[f]) put(f, nextRow, colOf[f], rec.values[f], sampleRows)
      fillEntityCells(nextRow, sampleRows)
      if (report.filled === before) { report.cannotAppend.push({ name: rec.label, why: 'those cells are locked' }); continue }
      report.appended.push({ row: nextRow + 1, name: rec.label })
      nextRow++
    }
    // Things Lacentra deliberately never holds.
    ;['dob', 'ssn'].forEach(f => {
      const c = Object.entries(cfg.mapping).find(([, x]) => x === f)
      if (!c) return
      let blanks = 0
      for (let r = h + 1; r <= rg.e.r; r++) if (cellText(ws, r, npiCol) && !cellText(ws, r, +c[0])) blanks++
      blanks += report.appended.length
      if (blanks) report.needManual[FIELD_INFO[f].label.replace(' (never filled)', '')] = { count: blanks, header: headerOf(+c[0]) }
    })
  }

  wb.zip.file(sheet.path, sx.serialize(), { createFolders: false })
  const bytes = await wb.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return { bytes, report }
}
