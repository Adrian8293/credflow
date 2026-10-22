// Builds a tiny but realistic payer-style .xlsx in memory (no real provider data): header row, two provider rows,
// a dropdown, optional sheet protection with unlocked cells, and an extra part that must survive untouched.
import JSZip from 'jszip'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const str = (ref, v, s = 0) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`
const num = (ref, v, s = 0) => `<c r="${ref}" s="${s}"><v>${v}</v></c>`

export const HEADERS = ['Provider Last Name', 'Provider First Name', 'NPI', 'Gender', 'License Expiration', 'Date of Birth', 'Telehealth (Y/N)', 'Action']
const COLS = 'ABCDEFGH'

/**
 * @param opts { protect: bool (only styles 1 and 2 are unlocked), rows: [[last, first, npi, gender, licExp(serial|''), dob, tele]], dropdown: 'F,M' }
 */
export async function mkXlsx({ protect = false, rows = [], dropdown = '"F,M"', header = HEADERS } = {}) {   // dropdown: null = none
  const z = new JSZip()
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
  z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  z.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId1"/></sheets></workbook>')
  z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  // xf 0 = plain (locked), xf 1 = unlocked text, xf 2 = unlocked date (m/d/yyyy)
  z.file('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="0"><protection locked="0"/></xf><xf numFmtId="14"><protection locked="0"/></xf></cellXfs></styleSheet>')
  z.file('customXml/keepme.xml', '<keep>this part must come back byte-for-byte</keep>')

  const body = []
  body.push(`<row r="1">${header.map((h, i) => str(COLS[i] + 1, h)).join('')}</row>`)
  rows.forEach((r, k) => {
    const rn = k + 2, st = protect ? 1 : 0
    const cells = [
      str('A' + rn, r[0], st), str('B' + rn, r[1], st), str('C' + rn, r[2], st), r[3] ? str('D' + rn, r[3], st) : `<c r="D${rn}" s="${st}"/>`,
      r[4] ? num('E' + rn, r[4], protect ? 2 : 2) : `<c r="E${rn}" s="2"/>`, r[5] ? str('F' + rn, r[5], st) : `<c r="F${rn}" s="${st}"/>`,
      r[6] ? str('G' + rn, r[6], st) : `<c r="G${rn}" s="${st}"/>`,
    ]
    body.push(`<row r="${rn}">${cells.join('')}</row>`)
  })
  const last = rows.length + 1
  z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${last}"/><sheetData>${body.join('')}</sheetData>${protect ? '<sheetProtection sheet="1" objects="1" scenarios="1"/>' : ''}${dropdown ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="D2:D50"><formula1>${esc(dropdown)}</formula1></dataValidation></dataValidations>` : ''}</worksheet>`)
  return z.generateAsync({ type: 'uint8array' })
}
