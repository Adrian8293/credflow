/**
 * ScreeningPage — monthly exclusion screening (OIG LEIE, SAM.gov).
 * Providers must be checked against the federal exclusion lists on a regular schedule (monthly is the usual payer and
 * compliance expectation). This page keeps the evidence: who was checked, on which list, when, and the result.
 * The OIG file is matched inside the browser; it is never uploaded.
 */
import { CountUp } from '../../components/ui/CountUp.jsx'
import { useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { DateInput } from '../../components/ui/DateInput.jsx'
import { recordExclusionChecks } from '../../lib/db'
import { SOURCES, RESULTS, CADENCE_DAYS, latestChecks, sourceStatus, parseLeie, matchLeie, describeHit, openFlags } from '../../lib/exclusions.js'
import { todayStr } from '../../lib/matrix.js'
import { fmtDate } from '../../lib/helpers.js'

const MIGRATION_MSG = 'Screening needs supabase-migration-029-exclusion-checks.sql. Run it in the Supabase SQL editor, then refresh.'
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16, marginBottom: 14 }
const RESULT_BADGE = { Clear: 'b-green', 'Possible match': 'b-amber', 'Confirmed exclusion': 'b-red' }
const WRITERS = ['owner', 'admin', 'credentialer']

function StatusCell({ st }) {
  if (st.result && st.result !== 'Clear') return <span><span className={`badge ${RESULT_BADGE[st.result]}`}>{st.result}</span><div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{fmtDate(st.last)}</div></span>
  if (st.state === 'never') return <span className="badge b-red">Never checked</span>
  if (st.state === 'due') return <span><span className="badge b-amber">Due</span><div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{st.days} days ago</div></span>
  return <span><span className="badge b-green">Clear</span><div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{st.days === 0 ? 'today' : `${st.days}d ago`}</div></span>
}

export function ScreeningPage({ db, setDb, toast, role, onOpenProvider }) {
  const ready = Array.isArray(db.exclusions)
  const canWrite = WRITERS.includes(role)
  const today = todayStr()
  const providers = useMemo(() => (db.providers || []).filter(p => p.status !== 'Inactive').sort((a, b) => `${a.lname}${a.fname}`.localeCompare(`${b.lname}${b.fname}`)), [db.providers])
  const latest = useMemo(() => latestChecks(db.exclusions || []), [db.exclusions])
  const [selected, setSelected] = useState([])
  const [bulkSource, setBulkSource] = useState(SOURCES[0].id)
  const [form, setForm] = useState(null)          // record-a-check modal
  const [leie, setLeie] = useState(null)          // { fileName, total, matches, clear }
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const dueCount = providers.filter(p => SOURCES.some(s => sourceStatus(latest, p.id, s.id, today).state !== 'ok')).length
  const flags = openFlags(db)
  const nameOf = id => { const p = (db.providers || []).find(x => x.id === id); return p ? `${p.fname} ${p.lname}` : 'Provider' }

  async function save(rows, okMsg) {
    if (!ready) return toast(MIGRATION_MSG, 'error')
    setBusy(true)
    try {
      const saved = await recordExclusionChecks(rows)
      setDb(prev => ({ ...prev, exclusions: [...saved, ...(prev.exclusions || [])] }))
      toast(okMsg, 'success'); return true
    } catch (e) { toast(/exclusion_checks|schema cache|does not exist/i.test(e.message || '') ? MIGRATION_MSG : 'Could not save: ' + (e.message || e), 'error'); return false }
    finally { setBusy(false) }
  }

  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const allSel = providers.length > 0 && selected.length === providers.length

  async function markSelected() {
    const ok = await save(selected.map(provId => ({ provId, source: bulkSource, result: 'Clear', checkedOn: today })), `Recorded ${selected.length} clear check${selected.length === 1 ? '' : 's'} on ${bulkSource}.`)
    if (ok) setSelected([])
  }

  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const text = await file.text()
    const { rows, error } = parseLeie(text)
    if (error) return toast(error, 'error')
    const { matches, clear } = matchLeie(providers, rows)
    setLeie({ fileName: file.name, total: rows.length, matches, clear })
  }

  async function recordLeie() {
    const rows = [
      ...leie.clear.map(p => ({ provId: p.id, source: 'OIG LEIE', result: 'Clear', checkedOn: today, note: `Checked against ${leie.fileName}` })),
      ...leie.matches.map(m => ({ provId: m.prov.id, source: 'OIG LEIE', result: 'Possible match', checkedOn: today, note: m.hits.slice(0, 3).map(describeHit).join(' | ') })),
    ]
    const ok = await save(rows, `OIG check recorded: ${leie.clear.length} clear, ${leie.matches.length} to review.`)
    if (ok) setLeie(null)
  }

  async function submitForm() {
    const ok = await save([{ provId: form.provId, source: form.source, result: form.result, note: form.note, checkedOn: form.checkedOn }], 'Check recorded.')
    if (ok) setForm(null)
  }

  const history = form ? (db.exclusions || []).filter(c => c.provId === form.provId).slice(0, 8) : []

  return (
    <div className="page">
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Exclusion Screening</h2>
        <p style={{ fontSize: 13, color: 'var(--text-4)', maxWidth: 760 }}>
          Payers expect every provider to be checked against the federal exclusion lists on a regular schedule — monthly is the usual standard. Record each check here so you have proof. No patient information is involved.
        </p>
      </div>

      {!ready && <div style={{ ...card, borderColor: 'var(--amber)', background: 'rgba(180,83,9,.06)', fontSize: 13 }}>{MIGRATION_MSG}</div>}

      <div className="kpi-strip" style={{ marginBottom: 14 }}>
        {[['Providers to screen', providers.length, ''], ['Need a check this month', dueCount, dueCount ? 'var(--amber)' : 'var(--green)'], ['Possible matches to review', flags.length, flags.length ? 'var(--red)' : 'var(--green)']].map(([l, n, c]) => (
          <div key={l} className="kpi">
            <div className="kpi-label">{l}</div>
            <div className="kpi-value" style={c ? { color: c } : undefined}><CountUp value={n} /></div>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Fastest way: check everyone against the OIG file</h3>
        <ol style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 10px 18px' }}>
          <li>Download the current “UPDATED.csv” (LEIE database) from <a href={SOURCES[0].download} target="_blank" rel="noopener noreferrer">the OIG exclusions page</a>.</li>
          <li>Choose that file below. Lacentra compares it with your providers’ NPIs and names <strong>on this computer only</strong> — the file is not uploaded.</li>
          <li>Review any matches, then record the check.</li>
        </ol>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} aria-label="OIG LEIE file" />
        <button className="btn btn-primary" disabled={!canWrite} onClick={() => fileRef.current?.click()}>Choose the OIG file…</button>
        {!canWrite && <span style={{ fontSize: 12, color: 'var(--text-4)', marginLeft: 10 }}>Only owners, admins and credentialers can record checks.</span>}
        <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 10, lineHeight: 1.5 }}>
          Names alone are not proof — people share names, and dates of birth are not stored here — so every match is a “possible match” for you to confirm on the <a href={SOURCES[0].search} target="_blank" rel="noopener noreferrer">OIG search</a>. SAM.gov has no free bulk file: search each provider on <a href={SOURCES[1].search} target="_blank" rel="noopener noreferrer">SAM.gov</a>, then record it below.
        </p>
      </div>

      {flags.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--red)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: 'var(--red)' }}>Needs your decision</h3>
          {flags.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border-l)' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{nameOf(c.provId)} · {c.source} · <span className={`badge ${RESULT_BADGE[c.result]}`}>{c.result}</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.note || 'No note'}</div>
              </div>
              {canWrite && <button className="btn btn-sm btn-secondary" onClick={() => setForm({ provId: c.provId, source: c.source, result: 'Clear', checkedOn: today, note: 'Reviewed — not the same person.' })}>Resolve…</button>}
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Every provider</h3>
          {canWrite && <>
            <select aria-label="List to record" className="filter-select" value={bulkSource} onChange={e => setBulkSource(e.target.value)}>{SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <button className="btn btn-secondary btn-sm" disabled={!selected.length || busy} onClick={markSelected}>Mark {selected.length || ''} selected clear today</button>
          </>}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              {canWrite && <th className="no-sort" style={{ width: 34 }}><input type="checkbox" aria-label="Select all providers" checked={allSel} onChange={() => setSelected(allSel ? [] : providers.map(p => p.id))} /></th>}
              <th className="no-sort">Provider</th><th className="no-sort">NPI</th>
              {SOURCES.map(s => <th key={s.id} className="no-sort">{s.id}</th>)}
              <th className="no-sort">Action</th>
            </tr></thead>
            <tbody>
              {providers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-4)', padding: 20 }}>No active providers yet.</td></tr>}
              {providers.map(p => (
                <tr key={p.id}>
                  {canWrite && <td><input type="checkbox" aria-label={`Select ${p.fname} ${p.lname}`} checked={selected.includes(p.id)} onChange={() => toggle(p.id)} /></td>}
                  <td><button type="button" onClick={() => onOpenProvider?.(p.id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--pr)', font: 'inherit', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>{p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}</button></td>
                  <td>{p.npi || '—'}</td>
                  {SOURCES.map(s => <td key={s.id}><StatusCell st={sourceStatus(latest, p.id, s.id, today)} /></td>)}
                  <td>{canWrite && <button className="btn btn-sm btn-secondary" onClick={() => setForm({ provId: p.id, source: SOURCES[1].id, result: 'Clear', checkedOn: today, note: '' })}>Record…</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 8 }}>“Due” means more than {CADENCE_DAYS} days since the last check on that list.</p>
      </div>

      {leie && (
        <Modal lg title="OIG check results" sub={`${leie.fileName} · ${leie.total.toLocaleString()} excluded entries compared with ${providers.length} providers`} onClose={() => setLeie(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setLeie(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={recordLeie}>{busy ? 'Saving…' : `Record check (${leie.clear.length} clear${leie.matches.length ? `, ${leie.matches.length} to review` : ''})`}</button>
          </>}>
          {leie.matches.length === 0
            ? <p style={{ fontSize: 13.5 }}>✔ No provider matched by NPI or name. Recording will log a clear OIG check for all {leie.clear.length} providers, dated today.</p>
            : <>
              <p style={{ fontSize: 13.5, marginBottom: 10 }}><strong>{leie.matches.length}</strong> provider{leie.matches.length === 1 ? '' : 's'} need a person to look. A name match is often a different person with the same name — confirm on the OIG search before treating it as an exclusion. Recording keeps them flagged as “Possible match” until you resolve them.</p>
              {leie.matches.map(m => (
                <div key={m.prov.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border-l)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.prov.fname} {m.prov.lname} <span className={`badge ${m.strong ? 'b-red' : 'b-amber'}`}>{m.strong ? 'NPI match' : 'Name match'}</span></div>
                  {m.hits.slice(0, 3).map((h, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-3)' }}>{describeHit(h)}</div>)}
                </div>
              ))}
              <p style={{ fontSize: 12.5, marginTop: 10 }}>The other {leie.clear.length} will be recorded as clear.</p>
            </>}
        </Modal>
      )}

      {form && (
        <Modal title="Record an exclusion check" sub={nameOf(form.provId)} onClose={() => setForm(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submitForm}>{busy ? 'Saving…' : 'Save check'}</button></>}>
          <div className="form-grid">
            <div className="fg"><label>List checked</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>{[...SOURCES.map(s => s.id), 'State Medicaid list'].map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="fg"><label>Result</label>
              <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))}>{RESULTS.map(r => <option key={r}>{r}</option>)}</select></div>
            <div className="fg"><label>Date checked</label><DateInput value={form.checkedOn} onChange={e => setForm(f => ({ ...f, checkedOn: e.target.value }))} /></div>
            <div className="fg" style={{ gridColumn: '1 / -1' }}><label>Note (optional)</label>
              <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Searched by name and NPI; no records found" /></div>
          </div>
          {history.length > 0 && <div style={{ marginTop: 12, fontSize: 12.5 }}><strong>Recent checks</strong>
            {history.map(c => <div key={c.id} style={{ color: 'var(--text-3)' }}>{fmtDate(c.checkedOn)} · {c.source} · {c.result}{c.note ? ` — ${c.note}` : ''}</div>)}</div>}
        </Modal>
      )}
    </div>
  )
}
