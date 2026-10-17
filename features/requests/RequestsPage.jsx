/**
 * RequestsPage — ask providers for documents/info, review what they send, approve or send back.
 * Request titles, notes and rejection reasons are VISIBLE TO THE PROVIDER in their portal.
 */
import { useMemo, useState } from 'react'
import { DrawerModal } from '../../components/ui/Modal.jsx'
import { createRequest, reviewRequest, cancelRequest } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { fmtDate, daysUntil } from '../../lib/helpers.js'
import { DOC_TYPES } from '../../constants/docTypes.js'

const MIGRATION_MSG = 'Requests need supabase-migration-015-portal.sql. Run it in the Supabase SQL editor, then refresh.'
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16 }

// document type -> provider field that holds its expiration date
const EXP_FIELD = {
  License:     { key: 'licenseExp', col: 'license_exp', label: 'license expiration' },
  Malpractice: { key: 'malExp',     col: 'mal_exp',     label: 'malpractice expiration' },
  DEA:         { key: 'deaExp',     col: 'dea_exp',     label: 'DEA expiration' },
}

const STATUS_BADGE = {
  submitted: { cls: 'b-amber', label: 'Needs review' },
  requested: { cls: 'b-blue',  label: 'Waiting on provider' },
  rejected:  { cls: 'b-red',   label: 'Sent back' },
  approved:  { cls: 'b-green', label: 'Approved' },
}
const TABS = [
  ['review', 'Needs review', r => r.status === 'submitted'],
  ['open',   'Open',         r => r.status === 'requested' || r.status === 'rejected'],
  ['done',   'Approved',     r => r.status === 'approved'],
  ['all',    'All',          () => true],
]

export function RequestsPage({ db, setDb, toast }) {
  const requests = db.requests || []
  const providers = db.providers || []
  const [tab, setTab] = useState('review')
  const [form, setForm] = useState(null)       // new-request drawer
  const [rejecting, setRejecting] = useState(null) // { id, reason }
  const [busyId, setBusyId] = useState('')

  const provName = id => { const p = providers.find(x => x.id === id); return p ? `${p.fname} ${p.lname}` : 'Unknown' }
  const counts = useMemo(() => Object.fromEntries(TABS.map(([k, , f]) => [k, requests.filter(f).length])), [requests])
  const filter = TABS.find(t => t[0] === tab)[2]
  const rows = requests.filter(filter)

  const upsertLocal = (r) => setDb(prev => ({
    ...prev,
    requests: prev.requests.some(x => x.id === r.id)
      ? prev.requests.map(x => (x.id === r.id ? r : x))
      : [r, ...prev.requests],
  }))

  async function openFile(r) {
    if (!r.documentId) return
    try {
      const res = await fetch(`/api/get-document-url?documentId=${encodeURIComponent(r.documentId)}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Could not open the file')
      window.open(j.signedUrl, '_blank', 'noopener')
    } catch (e) { toast(e.message, 'error') }
  }

  async function approve(r, syncExp) {
    setBusyId(r.id)
    try {
      const updated = await reviewRequest(r.id, true)
      upsertLocal(updated)
      const map = EXP_FIELD[r.docType]
      if (syncExp && map && r.docExp) {
        const { error } = await supabase.from('providers').update({ [map.col]: r.docExp }).eq('id', r.provId)
        if (error) throw error
        setDb(prev => ({ ...prev, providers: prev.providers.map(p => (p.id === r.provId ? { ...p, [map.key]: r.docExp } : p)) }))
        toast(`Approved. Provider ${map.label} updated to ${fmtDate(r.docExp)}.`, 'success')
      } else {
        toast('Approved', 'success')
      }
    } catch (e) { toast(e.message || 'Could not approve', 'error') }
    setBusyId('')
  }

  async function sendBack() {
    if (!rejecting) return
    setBusyId(rejecting.id)
    try {
      const updated = await reviewRequest(rejecting.id, false, rejecting.reason)
      upsertLocal(updated)
      toast('Sent back to the provider', 'success')
      setRejecting(null)
    } catch (e) { toast(e.message || 'Could not send back', 'error') }
    setBusyId('')
  }

  async function cancel(r) {
    if (!window.confirm(`Cancel "${r.title}" for ${provName(r.provId)}?`)) return
    setBusyId(r.id)
    try {
      await cancelRequest(r.id)
      setDb(prev => ({ ...prev, requests: prev.requests.filter(x => x.id !== r.id) }))
    } catch (e) { toast(e.message || 'Could not cancel', 'error') }
    setBusyId('')
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Requests</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Ask providers for documents or information, then review what they send. Providers see and answer these in their portal.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ provIds: [], docType: 'W-9', title: '', note: '', due: '' })}>+ New request</button>
      </div>

      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => (
          <div key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
            {l}{counts[k] > 0 && k !== 'all' ? ` (${counts[k]})` : ''}
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">{tab === 'review' ? 'Nothing waiting for review' : 'No requests here'}</div>
          <div className="empty-state-desc">
            {requests.length === 0
              ? `Create a request to ask a provider for a document. They need a portal login first (Access page).`
              : 'Switch tabs to see other requests.'}
          </div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Provider</th><th>Request</th><th>Due</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const b = STATUS_BADGE[r.status] || { cls: 'b-gray', label: r.status }
                const overdue = r.status === 'requested' && r.due && daysUntil(r.due) < 0
                const map = EXP_FIELD[r.docType]
                return (
                  <tr key={r.id}>
                    <td><b>{provName(r.provId)}</b></td>
                    <td>
                      {r.title}
                      <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>
                        {r.docType}{r.docExp ? ` · expires ${fmtDate(r.docExp)}` : ''}
                        {r.status === 'rejected' && r.rejectReason ? ` · "${r.rejectReason}"` : ''}
                      </div>
                    </td>
                    <td>{r.due ? <span style={overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{fmtDate(r.due)}</span> : '—'}</td>
                    <td><span className={`badge ${b.cls}`}>{overdue ? 'Overdue' : b.label}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.documentId && <button className="btn btn-sm btn-secondary" onClick={() => openFile(r)}>View file</button>}{' '}
                      {r.status === 'submitted' && (
                        <>
                          <button className="btn btn-sm btn-primary" disabled={busyId === r.id}
                            onClick={() => approve(r, !!(map && r.docExp))}
                            title={map && r.docExp ? `Also updates the provider's ${map.label}` : undefined}>
                            {map && r.docExp ? 'Approve + update date' : 'Approve'}
                          </button>{' '}
                          <button className="btn btn-sm btn-secondary" disabled={busyId === r.id} onClick={() => setRejecting({ id: r.id, reason: '' })}>Send back</button>
                        </>
                      )}
                      {(r.status === 'requested' || r.status === 'rejected') && (
                        <button className="btn btn-sm btn-secondary" disabled={busyId === r.id} onClick={() => cancel(r)}>Cancel</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && (
        <DrawerModal title="Send back to provider" onClose={() => setRejecting(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setRejecting(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={sendBack} disabled={busyId === rejecting.id || !rejecting.reason.trim()}>Send back</button></>}>
          <div className="fg full"><label>What needs to change? (the provider will see this)</label>
            <textarea autoFocus value={rejecting.reason} onChange={e => setRejecting({ ...rejecting, reason: e.target.value })}
              placeholder="e.g. The scan is cut off on the right side. Please upload the full page." /></div>
        </DrawerModal>
      )}

      {form && (
        <NewRequest form={form} setForm={setForm} providers={providers} toast={toast}
          onCreated={(created) => { created.forEach(upsertLocal); setForm(null); setTab('open') }} />
      )}
    </div>
  )
}

function NewRequest({ form, setForm, providers, toast, onCreated }) {
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const active = providers.filter(p => (p.status || 'Active') !== 'Inactive')
  const shown = active.filter(p => `${p.fname} ${p.lname}`.toLowerCase().includes(q.toLowerCase()))
  const toggle = id => set('provIds', form.provIds.includes(id) ? form.provIds.filter(x => x !== id) : [...form.provIds, id])
  const title = form.title.trim() || form.docType

  async function save() {
    setBusy(true)
    try {
      const created = []
      for (const provId of form.provIds) {
        created.push(await createRequest({ provId, docType: form.docType, title, note: form.note, due: form.due }))
      }
      toast(`${created.length} request${created.length === 1 ? '' : 's'} created`, 'success')
      onCreated(created)
    } catch (e) {
      const msg = /relation .*doc_requests|does not exist/i.test(e.message || '') ? MIGRATION_MSG : (e.message || 'Could not create the request')
      toast(msg, 'error'); setBusy(false)
    }
  }

  return (
    <DrawerModal title="New request" sub="Visible to the provider in their portal" onClose={() => setForm(null)}
      footer={<><button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || form.provIds.length === 0}>
          {busy ? 'Creating…' : `Request from ${form.provIds.length || 'selected'} provider${form.provIds.length === 1 ? '' : 's'}`}</button></>}>
      <div className="form-grid">
        <div className="fg"><label>Document type</label>
          <select value={form.docType} onChange={e => set('docType', e.target.value)}>{DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="fg"><label>Due date (optional)</label><input type="date" value={form.due} onChange={e => set('due', e.target.value)} /></div>
        <div className="fg full"><label>Title</label>
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder={form.docType} maxLength={120} /></div>
        <div className="fg full"><label>Instructions (optional)</label>
          <textarea value={form.note} onChange={e => set('note', e.target.value)} placeholder="e.g. Please upload the current, signed W-9. Include your full legal name." /></div>
        <div className="fg full"><label>Providers</label>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search providers" />
          <div style={{ display: 'flex', gap: 8, margin: '6px 0' }}>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => set('provIds', Array.from(new Set([...form.provIds, ...shown.map(p => p.id)])))}>Select shown</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('provIds', [])}>Clear</button>
          </div>
          <div style={{ ...card, padding: 8, maxHeight: 260, overflowY: 'auto' }}>
            {shown.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-4)', padding: 6 }}>No providers match.</div>}
            {shown.map(p => (
              <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 6px', fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.provIds.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}
              </label>
            ))}
          </div>
        </div>
      </div>
    </DrawerModal>
  )
}
