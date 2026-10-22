/**
 * RosterFillModal — fill the payer's OWN quarterly roster file (.xlsx) from Lacentra.
 *
 * 1. Pick the payer and group, drop in the file the payer sent.
 * 2. Check which column is which (guessed from the headings; remembered for next quarter).
 * 3. Lacentra fills the blanks IN the payer's file and hands it back, with a plain-language report.
 *
 * The file is read and written in this browser tab only; it is never uploaded. Date of birth, SSN and race/ethnicity
 * are never filled (Lacentra does not hold them). The full tax ID is typed here and used for this one file only.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { fetchEntities, fetchLocations, fetchContracts, fetchRosterMap, saveRosterMap, markRosterSent, addAudit } from '../../lib/db'
import { rosterRecords } from '../../lib/roster.js'

const sel = { width: '100%' }

export function RosterFillModal({ db, onClose, initial }) {
  const [X, setX] = useState(null)                       // lib/xlsxPatch, loaded on demand (keeps the main bundle small)
  const [entities, setEntities] = useState(null)
  const [entityId, setEntityId] = useState(initial?.entityId || '')
  const [payerId, setPayerId] = useState(initial?.payerId || '')
  const [scope, setScope] = useState('active')
  const [includePending, setIncludePending] = useState(false)
  const [taxId, setTaxId] = useState('')
  const [locations, setLocations] = useState([])
  const [contracts, setContracts] = useState([])

  const [fileName, setFileName] = useState('')
  const [wb, setWb] = useState(null)
  const [sheetName, setSheetName] = useState('')
  const [headerRow, setHeaderRow] = useState(1)           // 1-based on screen
  const [saved, setSaved] = useState(null)                // saved heading → field map for this payer + sheet
  const [overrides, setOverrides] = useState({})          // user edits this session: colIndex → field ('' = leave alone)
  const [overwrite, setOverwrite] = useState(false)
  const [allowAppend, setAllowAppend] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [moreDiff, setMoreDiff] = useState(false)
  const [mapSaved, setMapSaved] = useState(null)
  const [sentState, setSentState] = useState('')           // '' | 'saving' | 'done' | 'failed'
  const fileRef = useRef(null)

  useEffect(() => { import('../../lib/xlsxPatch.js').then(setX).catch(() => setErr('Could not load the spreadsheet tools. Check your connection and try again.')) }, [])
  useEffect(() => {
    let live = true
    fetchEntities().then(e => { if (live) { setEntities(e); if (e.length === 1) setEntityId(e[0].id) } }).catch(() => live && setEntities([]))
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!entityId) { setLocations([]); setContracts([]); return }
    let live = true
    Promise.all([fetchLocations(entityId), fetchContracts(entityId)]).then(([l, c]) => { if (live) { setLocations(l); setContracts(c) } }).catch(() => {})
    return () => { live = false }
  }, [entityId])

  const entity = (entities || []).find(e => e.id === entityId) || null
  const contract = contracts.find(c => c.payerId === payerId) || null
  const payers = [...db.payers].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const payerName = payers.find(p => p.id === payerId)?.name || ''

  const data = useMemo(
    () => (payerId ? rosterRecords(db, { payerId, entity, locations, contract, scope, includePending }) : null),
    [db, payerId, entity, locations, contract, scope, includePending])

  // Sheets and headings of the chosen file
  const sheetInfo = useMemo(() => {
    if (!X || !wb) return []
    return wb.sheets.map(s => {
      const ws = wb.sx.Sheets[s.name]
      if (!ws) return { name: s.name, hidden: s.hidden, score: 0, header: 0 }
      const header = X.detectHeaderRow(ws)
      const score = X.readHeaders(ws, header).filter(h => h.suggest).length
      return { name: s.name, hidden: s.hidden, score, header }
    })
  }, [X, wb])

  async function pickFile(file) {
    setErr(''); setResult(null); setOverrides({}); setSaved(null); setMapSaved(null)
    if (!file) return
    if (!/\.xlsx$/i.test(file.name)) { setErr('Please choose the payer’s .xlsx file. (Older .xls files: open them in Excel and use Save As → .xlsx first.)'); return }
    if (file.size > 15 * 1024 * 1024) { setErr('That file is over 15 MB, which is too large to fill here.'); return }
    setBusy(true)
    try {
      const w = await X.openWorkbook(await file.arrayBuffer())
      setWb(w); setFileName(file.name)
      const infos = w.sheets.filter(s => !s.hidden).map(s => {
        const ws = w.sx.Sheets[s.name]; const h = ws ? X.detectHeaderRow(ws) : 0
        return { name: s.name, header: h, score: ws ? X.readHeaders(ws, h).filter(x => x.suggest).length : 0 }
      }).sort((a, b) => b.score - a.score)
      setSheetName(infos[0]?.name || w.sheets[0]?.name || '')
      setHeaderRow((infos[0]?.header ?? 0) + 1)
    } catch (e) {
      setWb(null); setFileName('')
      setErr('That file could not be read. It may be password-protected or damaged. ' + (e?.message || ''))
    } finally { setBusy(false) }
  }

  // Remembered mapping for this payer + sheet
  useEffect(() => {
    if (!payerId || !sheetName) { setSaved(null); return }
    let live = true
    fetchRosterMap(payerId, sheetName).then(m => { if (live) setSaved(m) }).catch(() => live && setSaved(null))
    return () => { live = false }
  }, [payerId, sheetName])

  const ws = wb && X ? wb.sx.Sheets[sheetName] : null
  const headers = useMemo(() => (ws && X ? X.readHeaders(ws, Math.max(0, headerRow - 1)) : []), [ws, X, headerRow])
  const mapping = useMemo(() => {
    if (!X) return {}
    const auto = X.autoMapping(headers.map(h => (saved && saved[h.key] !== undefined ? { ...h, suggest: '' } : h)))
    const out = {}
    headers.forEach(h => {
      if (overrides[h.col] !== undefined) out[h.col] = overrides[h.col]
      else if (saved && saved[h.key] !== undefined) out[h.col] = saved[h.key] === '-' ? '' : saved[h.key]
      else out[h.col] = auto[h.col] || ''
    })
    return out
  }, [X, headers, saved, overrides])

  const hasNpi = Object.values(mapping).includes('npi')
  const mappedCount = Object.values(mapping).filter(Boolean).length

  async function run() {
    setErr(''); setResult(null); setBusy(true); setMapSaved(null); setSentState('')
    try {
      // fillSheet edits a fresh copy each time, so reload the workbook bytes from the file input
      const file = fileRef.current?.files?.[0]
      const fresh = file ? await X.openWorkbook(await file.arrayBuffer()) : wb
      const entityVals = { ...data.entityValues, ...(taxId.trim() ? { taxId: taxId.trim() } : {}) }
      const { bytes, report } = await X.fillSheet(fresh, {
        sheetName, headerRow: Math.max(0, headerRow - 1), mapping, records: data.records, entity: entityVals, overwrite, allowAppend,
      })
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const base = fileName.replace(/\.xlsx$/i, '')
      setResult({ report, blob, outName: `${base} - filled ${new Date().toISOString().slice(0, 10)}.xlsx` })
      // remember the column meanings for next quarter (headings only, never provider data)
      const toSave = {}
      headers.forEach(h => { toSave[h.key] = mapping[h.col] || '-' })
      addAudit('Roster', 'Filled', `${payerName}: ${report.filled} cells filled, ${report.matched} matched, ${report.appended.length} added`, payerId).catch(() => {})
      saveRosterMap(payerId, sheetName, toSave).then(() => setMapSaved(true)).catch(() => setMapSaved(false))
    } catch (e) {
      setErr('Could not fill the file: ' + (e?.message || 'unknown problem') + '. Your original file is untouched.')
    } finally { setBusy(false) }
  }

  async function markSent() {
    if (!contract) return
    setSentState('saving')
    try { await markRosterSent(contract.id, undefined, `${payerName} roster`); setSentState('done') } catch { setSentState('failed') }
  }

  function download() {
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a'); a.href = url; a.download = result.outName
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const canRun = !!(data && wb && sheetName && !busy && (data.records.length > 0 || !!data.entityValues.groupName) && mappedCount > 0)
  const r = result?.report
  const skippedList = r ? Object.entries(r.skipped).map(([k, n]) => { const [f, why] = k.split('|'); return { f, why, n } }) : []

  return (
    <Modal lg title="Fill a payer’s roster file" sub="Upload the form the payer sent. Lacentra fills it in and gives it back." onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        {result
          ? <button className="btn btn-primary" onClick={download}>Download filled file</button>
          : <button className="btn btn-primary" disabled={!canRun} onClick={run}>{busy ? 'Working…' : 'Fill the file'}</button>}
      </>}>

      <div className="form-grid">
        <div className="fg">
          <label>Group</label>
          <select style={sel} value={entityId} onChange={e => { setEntityId(e.target.value); setResult(null) }}>
            <option value="">{entities === null ? 'Loading…' : entities.length ? 'Choose a group…' : 'No groups yet (add one on Groups)'}</option>
            {(entities || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Payer</label>
          <select style={sel} value={payerId} onChange={e => { setPayerId(e.target.value); setOverrides({}); setResult(null) }}>
            <option value="">Choose a payer…</option>
            {payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="fg">
          <label>Which providers</label>
          <select style={sel} value={scope} onChange={e => { setScope(e.target.value); setResult(null) }}>
            <option value="active">Current providers (adds, updates)</option>
            <option value="termed">Terminated providers (for “remove from panel” sheets)</option>
          </select>
        </div>
        <div className="fg">
          <label>Group tax ID (optional)</label>
          <input value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="Typed here, used for this file only" autoComplete="off" inputMode="numeric" />
          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>Not saved anywhere. Leave blank to fill it in yourself.</div>
        </div>
        {scope === 'active' && (
          <div className="fg full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked={includePending} onChange={e => { setIncludePending(e.target.checked); setResult(null) }} style={{ width: 20, height: 20 }} />
              Also include providers whose application is still in progress
            </label>
          </div>
        )}
        <div className="fg full">
          <label>The payer’s file (.xlsx)</label>
          <input ref={fileRef} type="file" accept=".xlsx" disabled={!X || busy} onChange={e => pickFile(e.target.files?.[0])} style={{ fontSize: 15 }} />
          <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>The file is read in your browser and never uploaded. Your original is not changed; you get a filled copy.</div>
        </div>
      </div>

      {err && <div role="alert" style={{ marginTop: 12, background: 'var(--red-l, #fef2f2)', border: '1px solid var(--red-b, #fecaca)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>{err}</div>}

      {payerId && data && (
        <p style={{ fontSize: 13.5, margin: '12px 0 0', color: 'var(--text-3)' }}>
          {data.records.length} provider{data.records.length === 1 ? '' : 's'} with an NPI will be matched against the file.
          {data.noNpi.length > 0 && <> <b>No NPI on file, so skipped:</b> {data.noNpi.join(', ')}.</>}
        </p>
      )}

      {wb && !result && (
        <div style={{ marginTop: 14 }}>
          <div className="form-grid">
            <div className="fg">
              <label>Sheet to fill</label>
              <select style={sel} value={sheetName} onChange={e => { setSheetName(e.target.value); setOverrides({}); const i = sheetInfo.find(s => s.name === e.target.value); if (i) setHeaderRow(i.header + 1) }}>
                {wb.sheets.filter(s => !s.hidden).map(s => <option key={s.name} value={s.name}>{s.name.trim()}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Heading row</label>
              <input type="number" min="1" max="60" value={headerRow} onChange={e => { setHeaderRow(Math.max(1, +e.target.value || 1)); setOverrides({}) }} />
            </div>
          </div>

          {!hasNpi && (
            <p style={{ fontSize: 13.5, margin: '10px 0 0' }}>
              This sheet has no NPI column, so Lacentra treats it as a <b>group / location</b> sheet and fills one row of group details.
              Pick “Individual NPI” below on the NPI column if it is a provider sheet.
            </p>
          )}

          <p style={{ fontSize: 14, fontWeight: 600, margin: '14px 0 6px' }}>What goes in each column <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>(guessed from the headings; fix any that are wrong)</span></p>
          <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
            {headers.map(h => (
              <div key={h.col} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, padding: '7px 10px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }} title={h.text}>{h.text.split('\n')[0].slice(0, 70)}</div>
                <select style={{ ...sel, fontSize: 14 }} value={mapping[h.col] || ''} onChange={e => setOverrides(o => ({ ...o, [h.col]: e.target.value }))} aria-label={`Meaning of column ${h.text.split('\n')[0]}`}>
                  <option value="">Leave as is</option>
                  {X && X.FIELD_KEYS.map(k => <option key={k} value={k} disabled={!!X.FIELD_INFO[k].never}>{X.FIELD_INFO[k].label}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked={allowAppend} onChange={e => setAllowAppend(e.target.checked)} style={{ width: 20, height: 20 }} />
              Add providers that are in Lacentra but not yet in the file
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} style={{ width: 20, height: 20 }} />
              Also replace values that already differ from Lacentra <span style={{ color: 'var(--text-4)' }}>(off = only fill blanks and list the differences)</span>
            </label>
          </div>
        </div>
      )}

      {r && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ background: 'var(--green-l, #ecfdf5)', border: '1px solid var(--green-b, #a7f3d0)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
            <b>Filled {r.filled} cell{r.filled === 1 ? '' : 's'}</b> in “{r.sheet.trim()}”. {r.matched} provider{r.matched === 1 ? '' : 's'} matched by NPI{r.appended.length ? `, ${r.appended.length} added` : ''}. {r.alreadyRight} value{r.alreadyRight === 1 ? ' was' : 's were'} already correct.
            {mapSaved === true && <div style={{ fontSize: 12.5, marginTop: 4 }}>Column choices saved for {payerName}, so next quarter is just upload and download.</div>}
            {mapSaved === false && <div style={{ fontSize: 12.5, marginTop: 4 }}>Could not save the column choices (run migration 023). The file is still fine.</div>}
          </div>

          <Note title="After you send it to the payer">
            {contract ? (
              sentState === 'done' ? <span>Recorded. Lacentra will remind you when the next {payerName} roster is due.</span> : (
                <>
                  <button className="btn btn-secondary" disabled={sentState === 'saving'} onClick={markSent}>✓ Mark as sent to {payerName}</button>
                  {sentState === 'failed' && <div style={{ marginTop: 6 }}>Could not save (run migration 024). The file is still fine.</div>}
                </>
              )
            ) : <span>Add this payer’s contract on the Groups page, with its roster cadence, and Lacentra can remind you when the next roster is due.</span>}
          </Note>

          {r.appended.length > 0 && <Note title={`Added ${r.appended.length} new provider${r.appended.length === 1 ? '' : 's'} to the file`}>{r.appended.map(a => `${a.name} (row ${a.row})`).join(', ')}. Set the payer’s Action / change-type column for these rows if the form has one.</Note>}
          {r.cannotAppend.length > 0 && <Note warn title="Could not add">{r.cannotAppend.map(a => `${a.name}: ${a.why}`).join('; ')}. Add these by hand.</Note>}
          {Object.keys(r.needManual).length > 0 && <Note warn title="Still needs you">{Object.entries(r.needManual).map(([k, v]) => `${k}: ${v.count} row${v.count === 1 ? '' : 's'} blank in “${v.header}”`).join('; ')}. Lacentra does not store these on purpose; enter them in the payer’s file (or the payer may already have them on file).</Note>}
          {r.notInLacentra.length > 0 && <Note warn title={`${r.notInLacentra.length} row${r.notInLacentra.length === 1 ? '' : 's'} in the payer’s file have no ${scope === 'termed' ? 'terminated' : 'current'} enrollment in Lacentra`}>{r.notInLacentra.slice(0, 12).map(n => `${n.name} (row ${n.row})`).join(', ')}{r.notInLacentra.length > 12 ? `, and ${r.notInLacentra.length - 12} more` : ''}. They were left alone. If someone has left, mark them termed on the payer’s form.</Note>}
          {r.differs.length > 0 && (
            <Note warn title={`${r.differs.length} value${r.differs.length === 1 ? '' : 's'} in the file differ from Lacentra (not changed)`}>
              {(moreDiff ? r.differs : r.differs.slice(0, 6)).map((d, i) => <div key={i}>Row {d.row}, {d.field}: file says “{d.theirs}”, Lacentra has “{d.ours}”</div>)}
              {r.differs.length > 6 && <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setMoreDiff(m => !m)}>{moreDiff ? 'Show fewer' : `Show all ${r.differs.length}`}</button>}
              <div style={{ marginTop: 6 }}>Check which is right. To use Lacentra’s values, tick “replace values that differ” and run it again.</div>
            </Note>
          )}
          {skippedList.length > 0 && <Note title="Left blank on purpose">{skippedList.map(s => `${s.f}: ${s.n} (${s.why})`).join('; ')}.</Note>}
          {r.protectedSheet && <Note title="Protected sheet">Only the cells the payer left unlocked were filled.</Note>}
        </div>
      )}
    </Modal>
  )
}

function Note({ title, warn, children }) {
  return (
    <div style={{ background: warn ? 'var(--amber-l, #fffbeb)' : 'var(--raised, #f3f4f9)', border: `1px solid ${warn ? 'var(--amber-b, #fde68a)' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', fontSize: 13.5 }}>
      <b>{title}</b>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  )
}
