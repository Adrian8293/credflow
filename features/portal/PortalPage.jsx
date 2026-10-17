/**
 * PortalPage — what providers and clinic staff see. Reads ONLY portal_summary() (curated by the
 * database) and uploads through /api/portal-upload. No staff data, notes or other organizations.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DOC_TYPES } from '../../constants/docTypes'
import {
  portalEnrollmentStatus, REQUEST_LABEL, daysFromToday, fmtDateLong,
} from '../../lib/portalStatus'

const EXPIRING_TYPES = ['License', 'Malpractice', 'DEA', 'CAQH Attestation', 'Supervision Agreement', 'Recredentialing']

export default function PortalPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [provId, setProvId] = useState('')
  const [email, setEmail] = useState('')
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc('portal_summary')
    if (e) { setError(e.message || 'Could not load your information.'); return }
    setData(d)
    setProvId(prev => (prev && d.providers.some(p => p.id === prev)) ? prev : (d.providers[0]?.id || ''))
  }, [])

  useEffect(() => {
    load()
    supabase.auth.getUser().then(({ data: u }) => setEmail(u?.user?.email || ''))
  }, [load])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const prov = useMemo(() => data?.providers.find(p => p.id === provId) || null, [data, provId])

  const openRequests = (prov?.requests || []).filter(r => r.status === 'requested' || r.status === 'rejected')
  const sentRequests = (prov?.requests || []).filter(r => r.status === 'submitted' || r.status === 'approved')
  const expirations = (prov?.expirations || []).filter(x => x.date)
    .map(x => ({ ...x, days: daysFromToday(x.date) }))
    .sort((a, b) => a.days - b.days)

  return (
    <div className="pt-root">
      <style>{CSS}</style>

      <header className="pt-top">
        <div className="pt-brand"><span>LAC</span>entra</div>
        <div className="pt-top-r">
          {data?.org && <span className="pt-org">{data.org}</span>}
          <span className="pt-email">{email}</span>
          <button className="pt-link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="pt-main">
        {error && <div className="pt-banner pt-bad" role="alert">{error}</div>}
        {!data && !error && <p className="pt-muted">Loading…</p>}

        {data && data.providers.length === 0 && (
          <div className="pt-card"><h2>No provider record yet</h2>
            <p className="pt-muted">Your login is set up, but no provider record is linked to it. Please contact your credentialing team.</p></div>
        )}

        {data && data.providers.length > 0 && (
          <>
            <div className="pt-head">
              <div>
                <h1>{data.role === 'provider' ? `Hi, ${prov?.name?.split(' ')[0] || 'there'}` : 'Provider credentialing'}</h1>
                <p className="pt-muted">Track your applications, send requested documents and see when things expire.</p>
              </div>
              {data.providers.length > 1 && (
                <label className="pt-pick">Provider
                  <select value={provId} onChange={e => setProvId(e.target.value)}>
                    {data.providers.map(p => <option key={p.id} value={p.id}>{p.name}{p.cred ? `, ${p.cred}` : ''}</option>)}
                  </select>
                </label>
              )}
            </div>

            {flash && <div className="pt-banner pt-ok" role="status">{flash}</div>}

            {/* ── Action needed ── */}
            <section className="pt-card">
              <h2>Action needed {openRequests.length > 0 && <span className="pt-count">{openRequests.length}</span>}</h2>
              {openRequests.length === 0
                ? <p className="pt-muted">Nothing is needed from you right now.</p>
                : openRequests.map(r => (
                  <RequestCard key={r.id} req={r} providerId={prov.id}
                    onDone={msg => { setFlash(msg); load() }} />
                ))}
            </section>

            {/* ── Applications ── */}
            <section className="pt-card">
              <h2>Your payer applications</h2>
              {(prov?.enrollments || []).length === 0
                ? <p className="pt-muted">No applications have been started yet.</p>
                : (
                  <div className="pt-table-wrap">
                    <table className="pt-table">
                      <thead><tr><th>Payer</th><th>Status</th><th>Effective</th><th>Re-credential by</th></tr></thead>
                      <tbody>
                        {prov.enrollments.map(e => {
                          const st = portalEnrollmentStatus(e)
                          const eff = e.billable_from || e.credentialing_effective || e.effective
                          return (
                            <tr key={e.id}>
                              <td data-l="Payer"><b>{e.payer || 'Payer'}</b>{e.state && <span className="pt-sub"> · {e.state}</span>}</td>
                              <td data-l="Status"><span className={`pt-pill pt-${st.tone}`}>{st.label}</span><div className="pt-sub">{st.hint}</div></td>
                              <td data-l="Effective">{eff ? fmtDateLong(eff) : <span className="pt-sub">Not yet</span>}</td>
                              <td data-l="Re-credential by">{e.recred ? fmtDateLong(e.recred) : <span className="pt-sub">—</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
            </section>

            {/* ── Expirations ── */}
            <section className="pt-card">
              <h2>Expiration dates</h2>
              {expirations.length === 0
                ? <p className="pt-muted">No expiration dates are on file.</p>
                : (
                  <ul className="pt-list">
                    {expirations.map(x => {
                      const tone = x.days < 0 ? 'bad' : x.days <= 30 ? 'action' : x.days <= 90 ? 'wait' : 'ok'
                      return (
                        <li key={x.label}>
                          <span>{x.label}</span>
                          <span><b>{fmtDateLong(x.date)}</b>{' '}
                            <span className={`pt-pill pt-${tone}`}>
                              {x.days < 0 ? `Expired ${Math.abs(x.days)}d ago` : x.days === 0 ? 'Expires today' : `${x.days}d left`}
                            </span></span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              <p className="pt-sub">Renewed something? Send the new document below so your team can update your record.</p>
            </section>

            {/* ── Send a document ── */}
            <section className="pt-card">
              <h2>Send a document</h2>
              <SendForm providerId={prov.id} onDone={msg => { setFlash(msg); load() }} />
            </section>

            {/* ── History ── */}
            {sentRequests.length > 0 && (
              <section className="pt-card">
                <h2>Sent documents</h2>
                <ul className="pt-list">
                  {sentRequests.map(r => {
                    const l = REQUEST_LABEL[r.status]
                    return (
                      <li key={r.id}>
                        <span>{r.title}<span className="pt-sub"> · {r.submitted_at ? fmtDateLong(r.submitted_at.slice(0, 10)) : ''}</span></span>
                        <span className={`pt-pill pt-${l.tone}`}>{l.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

// ─── An open request with its upload control ─────────────────────────────────
function RequestCard({ req, providerId, onDone }) {
  const [file, setFile] = useState(null)
  const [exp, setExp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const overdue = req.due && daysFromToday(req.due) < 0
  const l = REQUEST_LABEL[req.status]

  async function send() {
    if (!file) { setErr('Choose a file first.'); return }
    setBusy(true); setErr('')
    const fd = new FormData()
    fd.append('providerId', providerId); fd.append('requestId', req.id)
    if (exp) fd.append('exp', exp)
    fd.append('file', file)
    try {
      const r = await fetch('/api/portal-upload', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'Upload failed.'); setBusy(false); return }
      onDone(`Thanks, "${req.title}" was sent for review.`)
    } catch { setErr('Upload failed. Check your connection and try again.'); setBusy(false) }
  }

  return (
    <div className="pt-req">
      <div className="pt-req-h">
        <b>{req.title}</b>
        <span className={`pt-pill pt-${overdue ? 'bad' : l.tone}`}>{overdue ? 'Overdue' : l.label}</span>
      </div>
      {req.due && <div className="pt-sub">Due {fmtDateLong(req.due)}</div>}
      {req.note && <p className="pt-note">{req.note}</p>}
      {req.status === 'rejected' && req.reject_reason && <div className="pt-banner pt-bad">Reason: {req.reject_reason}</div>}
      <div className="pt-up">
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,application/pdf,image/*"
          onChange={e => setFile(e.target.files?.[0] || null)} aria-label={`File for ${req.title}`} />
        {EXPIRING_TYPES.includes(req.doc_type) && (
          <label className="pt-exp">Expiration date (if any)
            <input type="date" value={exp} onChange={e => setExp(e.target.value)} /></label>
        )}
        <button className="pt-btn" onClick={send} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
      {err && <div className="pt-err" role="alert">{err}</div>}
    </div>
  )
}

// ─── Self-initiated upload ───────────────────────────────────────────────────
function SendForm({ providerId, onDone }) {
  const [docType, setDocType] = useState('License')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [exp, setExp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [key, setKey] = useState(0)

  async function send(e) {
    e.preventDefault()
    if (!file) { setErr('Choose a file first.'); return }
    setBusy(true); setErr('')
    const fd = new FormData()
    fd.append('providerId', providerId); fd.append('docType', docType)
    fd.append('title', title.trim() || docType)
    if (exp) fd.append('exp', exp)
    fd.append('file', file)
    try {
      const r = await fetch('/api/portal-upload', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'Upload failed.'); setBusy(false); return }
      setFile(null); setTitle(''); setExp(''); setKey(k => k + 1); setBusy(false)
      onDone('Thanks, your document was sent for review.')
    } catch { setErr('Upload failed. Check your connection and try again.'); setBusy(false) }
  }

  return (
    <form onSubmit={send} className="pt-send">
      <label>Type<select value={docType} onChange={e => setDocType(e.target.value)}>
        {DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Description (optional)<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Renewed license 2027" /></label>
      {EXPIRING_TYPES.includes(docType) && (
        <label>Expiration date (if any)<input type="date" value={exp} onChange={e => setExp(e.target.value)} /></label>
      )}
      <label>File (PDF or image, up to 10 MB)
        <input key={key} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,application/pdf,image/*"
          onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      {err && <div className="pt-err" role="alert">{err}</div>}
      <button className="pt-btn" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Send document'}</button>
    </form>
  )
}

const CSS = `
.pt-root{min-height:100vh;background:#F6F7FB;font-family:Inter,system-ui,sans-serif;color:#111827}
.pt-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px;background:#fff;border-bottom:1px solid #E5E7EF;flex-wrap:wrap}
.pt-brand{font-size:18px;font-weight:800;letter-spacing:-.02em}.pt-brand span{color:#4F46E5}
.pt-top-r{display:flex;align-items:center;gap:12px;font-size:13px;color:#6B7280;flex-wrap:wrap}
.pt-org{font-weight:600;color:#111827}
.pt-link{background:none;border:none;color:#4F46E5;font-weight:600;cursor:pointer;font-size:13px;padding:0}
.pt-main{max-width:860px;margin:0 auto;padding:22px 16px 60px}
.pt-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:14px}
h1{margin:0 0 4px;font-size:24px;letter-spacing:-.02em}
h2{margin:0 0 12px;font-size:16px;display:flex;align-items:center;gap:8px}
.pt-muted{color:#6B7280;font-size:14px;margin:0}
.pt-sub{color:#6B7280;font-size:12.5px;margin-top:2px}
.pt-card{background:#fff;border:1px solid #E5E7EF;border-radius:12px;padding:18px;margin-bottom:14px}
.pt-count{background:#EEF2FF;color:#4F46E5;border-radius:999px;font-size:12px;padding:1px 9px}
.pt-pick{font-size:12.5px;font-weight:600;color:#374151;display:block}
.pt-pick select{display:block;margin-top:4px;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:14px;min-width:220px}
.pt-pill{display:inline-block;border-radius:999px;font-size:12px;font-weight:600;padding:2px 10px}
.pt-ok{background:#ECFDF5;color:#047857}.pt-wait{background:#EFF6FF;color:#1D4ED8}.pt-action{background:#FFF7ED;color:#C2410C}
.pt-bad{background:#FEF2F2;color:#B91C1C}.pt-muted-pill,.pt-muted{}
span.pt-muted.pt-pill{background:#F3F4F6;color:#4B5563}
.pt-banner{border-radius:8px;padding:10px 12px;font-size:13.5px;margin:0 0 12px}
.pt-table-wrap{overflow-x:auto}
.pt-table{width:100%;border-collapse:collapse;font-size:14px}
.pt-table th{text-align:left;font-size:12px;color:#6B7280;font-weight:600;padding:6px 10px 8px 0;border-bottom:1px solid #E5E7EF}
.pt-table td{padding:11px 10px 11px 0;border-bottom:1px solid #F1F2F6;vertical-align:top}
.pt-list{list-style:none;margin:0 0 10px;padding:0}
.pt-list li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #F1F2F6;font-size:14px;flex-wrap:wrap}
.pt-req{border:1px solid #E5E7EF;border-radius:10px;padding:14px;margin-bottom:10px}
.pt-req-h{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.pt-note{margin:8px 0;font-size:14px;color:#374151;white-space:pre-wrap}
.pt-up{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:10px}
.pt-exp,.pt-send label{font-size:12.5px;font-weight:600;color:#374151;display:block}
.pt-exp input,.pt-send input,.pt-send select{display:block;margin-top:4px;padding:8px 10px;border:1px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box}
.pt-send{display:grid;gap:12px;max-width:460px}.pt-send input,.pt-send select{width:100%}
.pt-btn{background:#4F46E5;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
.pt-btn:disabled{opacity:.6;cursor:default}
.pt-err{color:#B91C1C;font-size:13px;margin-top:8px}
@media(max-width:640px){
  .pt-table thead{display:none}
  .pt-table tr{display:block;border-bottom:1px solid #E5E7EF;padding:8px 0}
  .pt-table td{display:block;border:none;padding:4px 0}
  .pt-table td::before{content:attr(data-l);display:block;font-size:11px;color:#6B7280;font-weight:600}
}
`
