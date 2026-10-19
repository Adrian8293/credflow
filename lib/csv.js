// One safe CSV writer for every export in the app.
// - Quotes every cell and doubles embedded quotes.
// - Neutralizes spreadsheet formulas: a text cell starting with = + - @ (or tab / CR) gets a leading
//   apostrophe so Excel/Sheets treat it as text instead of running it (CSV injection).
// - Adds a UTF-8 BOM so Excel shows accents correctly.
export function csvCell(v) {
  let s = v == null ? '' : String(v)
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

// rows: array of arrays (first row = headers)
export function csvFromRows(rows) {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n')
}

// rows: array of objects with the same keys
export function csvFromObjects(objs) {
  if (!objs.length) return ''
  const cols = Object.keys(objs[0])
  return csvFromRows([cols, ...objs.map(o => cols.map(c => o[c]))])
}

export function downloadCsv(filename, csvText) {
  const url = URL.createObjectURL(new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
