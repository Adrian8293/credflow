/**
 * PortalPage — what providers and clinic staff see. Reads ONLY portal_summary() (curated by the
 * database) and uploads through /api/portal-upload. No staff data, notes or other organizations.
 */
import { compressImage } from '../../lib/compressImage'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DOC_TYPES } from '../../constants/docTypes'
import {
  portalEnrollmentStatus, REQUEST_LABEL, daysFromToday, fmtDateLong,
} from '../../lib/portalStatus'
import { DateInput } from '../../components/ui/DateInput.jsx'

// Where providers sign in to CAQH to re-attest and authorize payers. Override with NEXT_PUBLIC_CAQH_URL if CAQH moves it.
const CAQH_URL = process.env.NEXT_PUBLIC_CAQH_URL || 'https://proview.caqh.org'
const MAX_BYTES = 10 * 1024 * 1024
const sizeProblem = (f) => (f && f.size > MAX_BYTES ? 'That file is over 10 MB. Please upload a smaller PDF or photo.' : '')

// Sends the upload with a time limit and plain-language failures. Returns { ok, error }.
async function postUpload(fd) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, error: 'You are offline, so nothing was sent. Reconnect to the internet, then tap Send again. Your file is still selected.' }
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 90_000)
  try {
    const r = await fetch('/api/portal-upload', { method: 'POST', body: fd, signal: ctl.signal })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: j.error || 'The upload did not go through. Please tap Send again.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError'
      ? 'The upload is taking too long, probably because of a weak signal. Your file is still selected. Try again when you have a better connection.'
      : 'The upload did not go through. Check your internet connection and tap Send again. Your file is still selected.' }
  } finally { clearTimeout(timer) }
}

const WELCOME_KEY = 'lc_portal_welcome_seen'
const isIphone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)

// Three plain steps, shown the first time and reopenable from "How does this work?".
function Welcome({ onClose }) {
  const steps = [
    ['Look at the top of the page', 'A green box means you are all set. An orange box means we need something from you.'],
    ['Tap the big button to send a file', 'Choose a file from your phone, or take a clear photo of the document. Then tap the green “Send” button.'],
    ['Put this on your phone (optional)', isIphone()
      ? 'In Safari, tap the Share button (square with an arrow), then “Add to Home Screen”. After that you can open it like any app.'
      : 'In your browser menu, choose “Install app” or “Add to Home screen”. After that you can open it like any app.'],
  ]
  return (
    <div className="pt-welcome-back" role="dialog" aria-modal="true" aria-label="How this works">
      <div className="pt-welcome">
        <h2>How this works</h2>
        {steps.map(([t, d], i) => (
          <div className="pt-step" key={t}><span className="pt-step-n">{i + 1}</span><div><b>{t}</b><p>{d}</p></div></div>
        ))}
        <button className="pt-btn pt-btn-go" onClick={onClose} autoFocus>Got it</button>
      </div>
    </div>
  )
}

const EXPIRING_TYPES = ['License', 'Malpractice', 'DEA', 'CAQH Attestation', 'Supervision Agreement', 'Recredentialing']

export default function PortalPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [provId, setProvId] = useState('')
  const [email, setEmail] = useState('')
  const [flash, setFlash] = useState('')
  const [welcome, setWelcome] = useState(false)

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc('portal_summary')
    if (e) { setError(e.message || 'Could not load your information.'); return }
    setData(d)
    setProvId(prev => (prev && d.providers.some(p => p.id === prev)) ? prev : (d.providers[0]?.id || ''))
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(''), 30000)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    try { if (!localStorage.getItem(WELCOME_KEY)) setWelcome(true) } catch { /* storage unavailable */ }
    load()
    supabase.auth.getUser().then(({ data: u }) => setEmail(u?.user?.email || ''))
  }, [load])

  function closeWelcome() { setWelcome(false); try { localStorage.setItem(WELCOME_KEY, '1') } catch { /* storage unavailable */ } }

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

  const soon = expirations.filter(x => x.days <= 90)
  const isCaqh = (x) => /caqh/i.test(x.label)
  // Payers that cannot see this provider's CAQH profile until the provider authorizes them.
  const caqhNeeded = (prov?.enrollments || []).filter(e => e.caqh_status === 'needed' && e.stage !== 'Active' && e.stage !== 'Denied')
  const needCount = openRequests.length + (caqhNeeded.length ? 1 : 0)

  return (
    <div className="pt-root">
      <style>{CSS}</style>
      {welcome && data && data.providers.length > 0 && <Welcome onClose={closeWelcome} />}

      <header className="pt-top">
        <div className="pt-brand"><span>LAC</span>entra</div>
        <div className="pt-top-r">
          {data?.org && <span className="pt-org">{data.org}</span>}
          <button className="pt-signout" onClick={signOut}>Sign out</button>
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
                <h1>{data.role === 'provider' ? `Hello, ${prov?.name?.split(' ')[0] || 'there'}` : 'Provider credentialing'}</h1>
                <p className="pt-muted">{email}</p>
              </div>
              {data.providers.length > 1 && (
                <label className="pt-pick">Provider
                  <select value={provId} onChange={e => setProvId(e.target.value)}>
                    {data.providers.map(p => <option key={p.id} value={p.id}>{p.name}{p.cred ? `, ${p.cred}` : ''}</option>)}
                  </select>
                </label>
              )}
            </div>

            {flash && (
              <div className="pt-thanks" role="status">
                <div className="pt-thanks-icon" aria-hidden="true">✓</div>
                <div className="pt-thanks-body"><b>Received. Thank you!</b><span>{flash}</span></div>
                <button className="pt-btn pt-btn-quiet" onClick={() => setFlash('')}>OK</button>
              </div>
            )}

            {/* ── The one thing to know right now ── */}
            {needCount > 0 ? (
              <a href={openRequests.length > 0 ? '#pt-needed' : '#pt-caqh'} className="pt-status pt-status-action">
                <span className="pt-status-icon" aria-hidden="true">!</span>
                <span><b>{needCount === 1 ? 'We need 1 thing from you' : `We need ${needCount} things from you`}</b><small>Tap here to see what to do</small></span>
              </a>
            ) : (
              <div className="pt-status pt-status-ok">
                <span className="pt-status-icon" aria-hidden="true">✓</span>
                <span><b>You&apos;re all set</b><small>Nothing is needed from you right now</small></span>
              </div>
            )}

            {soon.length > 0 && (
              <div className="pt-soon">
                <h2>Renewing soon</h2>
                {soon.map(x => (
                  <div key={x.label} className={`pt-soon-row pt-tone-${x.days < 0 ? 'bad' : x.days <= 30 ? 'action' : 'wait'}`}>
                    <div><b>{x.label}</b><span>{x.days < 0 ? `Expired ${Math.abs(x.days)} days ago` : x.days === 0 ? 'Expires today' : `Expires in ${x.days} days`} · {fmtDateLong(x.date)}</span></div>
                    {isCaqh(x)
                      ? <a href={CAQH_URL} target="_blank" rel="noopener noreferrer" className="pt-btn pt-btn-small">Open CAQH</a>
                      : <a href="#pt-send" className="pt-btn pt-btn-small">Send renewal</a>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Action needed ── */}
            {openRequests.length > 0 && (
              <section className="pt-card" id="pt-needed">
                <h2>What we need from you {<span className="pt-count">{openRequests.length}</span>}</h2>
                {openRequests.map(r => (
                  <RequestCard key={r.id} req={r} providerId={prov.id}
                    onDone={msg => { setFlash(msg); load(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
                ))}
              </section>
            )}

            {/* ── CAQH: authorize payers ── */}
            {caqhNeeded.length > 0 && (
              <section className="pt-card" id="pt-caqh">
                <h2>Authorize these payers in CAQH <span className="pt-count">{caqhNeeded.length}</span></h2>
                <p className="pt-muted">A payer cannot read your CAQH profile until you allow it. It only takes a minute. Sign in to CAQH, find the authorization section, and turn on:</p>
                <ul className="pt-list">
                  {caqhNeeded.map(e => <li key={e.id}><span><b>{e.payer || 'Payer'}</b></span><span className="pt-pill pt-action">Needs your OK</span></li>)}
                </ul>
                <p style={{ marginTop: 14 }}><a href={CAQH_URL} target="_blank" rel="noopener noreferrer" className="pt-btn">Open CAQH</a></p>
                <p className="pt-muted">Done already? Please let your credentialing team know so they can confirm it.</p>
              </section>
            )}

            {/* ── Send a document ── */}
            <section className="pt-card" id="pt-send">
              <h2>Send a document</h2>
              <p className="pt-muted">Renewed a license or insurance? Send the new copy here.</p>
              <SendForm providerId={prov.id} onDone={msg => { setFlash(msg); load(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
            </section>

            {/* ── My details (providers only) ── */}
            {data?.role === 'provider' && <DetailsCard key={prov.id} onSaved={msg => { setFlash(msg); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}

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

            {/* ── All expiration dates ── */}
            <section className="pt-card">
              <h2>All expiration dates</h2>
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
            </section>

            {/* ── History ── */}
            {sentRequests.length > 0 && (
              <section className="pt-card">
                <h2>Documents you sent</h2>
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

            <p className="pt-help"><button className="pt-btn pt-btn-outline pt-btn-small" onClick={() => setWelcome(true)}>How does this work?</button></p>
            <p className="pt-help">Questions? Contact your credentialing team{data.org ? ` at ${data.org}` : ''}.</p>
          </>
        )}
      </main>
    </div>
  )
}

// Big, obvious file chooser. On a phone the same button also offers the camera.
function FilePicker({ file, onFile, label }) {
  const id = useId()   // stable per component; Math.random() during render is flagged by the linter and differs between server and browser
  return (
    <div className="pt-file">
      <input id={id} className="pt-file-input" type="file" aria-label={label}
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,application/pdf,image/*"
        onChange={e => onFile(e.target.files?.[0] || null)} />
      <label htmlFor={id} className={`pt-btn pt-btn-outline pt-file-btn${file ? ' has-file' : ''}`}>
        <span aria-hidden="true">{file ? '✓' : '📎'}</span> {file ? 'Change file' : 'Choose a file or take a photo'}
      </label>
      {file && <div className="pt-file-name">{file.name}</div>}
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
    if (!file) { setErr('Please choose a file first (tap the button above).'); return }
    setBusy(true); setErr('')
    const toSend = await compressImage(file)   // phone photos get smaller before sending; this also helps on weak signal
    if (sizeProblem(toSend)) { setErr(sizeProblem(toSend)); setBusy(false); return }
    const fd = new FormData()
    fd.append('providerId', providerId); fd.append('requestId', req.id)
    if (exp) fd.append('exp', exp)
    fd.append('file', toSend)
    const res = await postUpload(fd)
    if (!res.ok) { setErr(res.error); setBusy(false); return }
    onDone(`"${req.title}" was sent to your credentialing team for review.`)
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
        <FilePicker file={file} onFile={f => { setFile(f); setErr('') }} label={`File for ${req.title}`} />
        {EXPIRING_TYPES.includes(req.doc_type) && (
          <label className="pt-exp">Expiration date (if any)
            <DateInput  value={exp} onChange={e => setExp(e.target.value)} /></label>
        )}
        <button className="pt-btn pt-btn-go" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send to my credentialing team'}</button>
      </div>
      {err && <div className="pt-err" role="alert">{err}</div>}
    </div>
  )
}

// ─── Provider confirms their own roster details ──────────────────────────────
// Payer directories ask for these. Only the provider's own four answers can be changed from here.
function DetailsCard({ onSaved }) {
  const [state, setState] = useState('loading')   // loading | ready | hidden
  const [f, setF] = useState({ gender: '', languages: '', accepts: '', telehealth: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    supabase.rpc('portal_my_details').then(({ data: d, error: e }) => {
      if (!live) return
      if (e || !d) { setState('hidden'); return }       // not set up yet (migration 025) or not a provider account
      const yn = v => (v === true ? 'Yes' : v === false ? 'No' : '')
      setF({ gender: d.gender || '', languages: d.languages || '', accepts: yn(d.accepts_new_patients), telehealth: yn(d.telehealth) })
      setState('ready')
    })
    return () => { live = false }
  }, [])

  if (state !== 'ready') return null
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const tri = v => (v === 'Yes' ? true : v === 'No' ? false : null)

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('portal_save_details', {
      p_gender: f.gender || null, p_languages: f.languages.trim() || null, p_accepts: tri(f.accepts), p_telehealth: tri(f.telehealth),
    })
    setBusy(false)
    if (error) { setErr('That did not save. Please check your internet connection and tap Save again.'); return }
    onSaved('Thank you. Your details were saved.')
  }

  return (
    <section className="pt-card">
      <h2>Your directory details</h2>
      <p className="pt-muted">Insurance companies list these in their provider directories. Everything here is optional, and you can change it any time.</p>
      <form onSubmit={save} className="pt-send">
        <label>Gender<select value={f.gender} onChange={e => set('gender', e.target.value)}>
          <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option></select></label>
        <label>Languages you see clients in<input value={f.languages} maxLength={200} onChange={e => set('languages', e.target.value)} placeholder="e.g. English, Spanish" /></label>
        <label>Taking new clients?<select value={f.accepts} onChange={e => set('accepts', e.target.value)}>
          <option value="">Not sure yet</option><option>Yes</option><option>No</option></select></label>
        <label>Offer telehealth (video or phone)?<select value={f.telehealth} onChange={e => set('telehealth', e.target.value)}>
          <option value="">Not sure yet</option><option>Yes</option><option>No</option></select></label>
        {err && <div className="pt-err" role="alert">{err}</div>}
        <button className="pt-btn pt-btn-go" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save my details'}</button>
      </form>
    </section>
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
    if (!file) { setErr('Please choose a file first (tap the button above).'); return }
    setBusy(true); setErr('')
    const toSend = await compressImage(file)   // phone photos get smaller before sending; this also helps on weak signal
    if (sizeProblem(toSend)) { setErr(sizeProblem(toSend)); setBusy(false); return }
    const fd = new FormData()
    fd.append('providerId', providerId); fd.append('docType', docType)
    fd.append('title', title.trim() || docType)
    if (exp) fd.append('exp', exp)
    fd.append('file', toSend)
    const res = await postUpload(fd)
    if (!res.ok) { setErr(res.error); setBusy(false); return }
    setFile(null); setTitle(''); setExp(''); setKey(k => k + 1); setBusy(false)
    onDone('Your document was sent to your credentialing team for review.')
  }

  return (
    <form onSubmit={send} className="pt-send">
      <label>Type<select value={docType} onChange={e => setDocType(e.target.value)}>
        {DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Description (optional)<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Renewed license 2027" /></label>
      {EXPIRING_TYPES.includes(docType) && (
        <label>Expiration date (if any)<DateInput  value={exp} onChange={e => setExp(e.target.value)} /></label>
      )}
      <div><div className="pt-lbl">File (PDF or photo, up to 10 MB)</div><FilePicker key={key} file={file} onFile={f => { setFile(f); setErr('') }} label="File to send" /></div>
      {err && <div className="pt-err" role="alert">{err}</div>}
      <button className="pt-btn pt-btn-go" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to my credentialing team'}</button>
    </form>
  )
}

const CSS = `
.pt-root{min-height:100vh;background:#F6F7FB;font-family:Inter,system-ui,sans-serif;color:#111827;font-size:17px;line-height:1.5}
.pt-top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;background:#fff;border-bottom:1px solid #E5E7EF}
.pt-brand{font-size:21px;font-weight:800;letter-spacing:-.02em}.pt-brand span{color:#4F46E5}
.pt-top-r{display:flex;align-items:center;gap:12px;font-size:15px;color:#6B7280}
.pt-org{font-weight:600;color:#111827;display:none}
.pt-signout{background:#fff;border:2px solid #4F46E5;color:#4F46E5;font-weight:700;font-size:15px;border-radius:10px;padding:9px 16px;min-height:44px;cursor:pointer}
.pt-main{max-width:760px;margin:0 auto;padding:20px 16px 70px}
.pt-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:16px}
h1{margin:0 0 2px;font-size:32px;letter-spacing:-.02em;line-height:1.15}
h2{margin:0 0 12px;font-size:21px;display:flex;align-items:center;gap:10px}
.pt-muted{color:#4B5563;font-size:16px;margin:0 0 10px}
.pt-sub{color:#4B5563;font-size:14.5px;margin-top:2px}
.pt-card{background:#fff;border:1.5px solid #E5E7EF;border-radius:16px;padding:20px;margin-bottom:16px}
.pt-count{background:#EEF2FF;color:#4338CA;border-radius:999px;font-size:15px;padding:1px 12px}
.pt-pick{font-size:15px;font-weight:700;color:#374151;display:block}
.pt-pick select{display:block;margin-top:4px;padding:12px;border:2px solid #9CA3AF;border-radius:10px;font-size:17px;min-width:240px;min-height:48px;background:#fff}
.pt-pill{display:inline-block;border-radius:999px;font-size:14.5px;font-weight:700;padding:3px 12px}
.pt-ok{background:#ECFDF5;color:#047857}.pt-wait{background:#EFF6FF;color:#1D4ED8}.pt-action{background:#FFF7ED;color:#C2410C}
.pt-bad{background:#FEF2F2;color:#B91C1C}
span.pt-muted.pt-pill{background:#F3F4F6;color:#4B5563}
.pt-banner{border-radius:10px;padding:12px 14px;font-size:16px;margin:0 0 12px}

.pt-status{display:flex;align-items:center;gap:14px;border-radius:16px;padding:18px 20px;margin-bottom:16px;text-decoration:none;font-size:20px}
.pt-status b{display:block;font-size:22px;line-height:1.2}.pt-status small{display:block;font-size:16px;font-weight:500;margin-top:2px}
.pt-status-icon{flex:0 0 44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff}
.pt-status-action{background:#FFF7ED;border:2px solid #FB923C;color:#9A3412}.pt-status-action .pt-status-icon{background:#EA580C}
.pt-status-ok{background:#ECFDF5;border:2px solid #34D399;color:#065F46}.pt-status-ok .pt-status-icon{background:#059669}

.pt-thanks{display:flex;align-items:center;gap:14px;background:#ECFDF5;border:2px solid #34D399;border-radius:16px;padding:16px 18px;margin-bottom:16px;color:#065F46;flex-wrap:wrap}
.pt-thanks-icon{flex:0 0 44px;height:44px;border-radius:50%;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800}
.pt-thanks-body{flex:1;min-width:180px}.pt-thanks-body b{display:block;font-size:20px}.pt-thanks-body span{font-size:16px}

.pt-soon{background:#fff;border:1.5px solid #E5E7EF;border-radius:16px;padding:18px 20px;margin-bottom:16px}
.pt-soon-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;margin-top:8px;border-left:6px solid}
.pt-soon-row b{display:block;font-size:18px}.pt-soon-row span{font-size:15.5px}
.pt-tone-bad{background:#FEF2F2;border-color:#DC2626;color:#7F1D1D}.pt-tone-action{background:#FFF7ED;border-color:#EA580C;color:#7C2D12}.pt-tone-wait{background:#EFF6FF;border-color:#2563EB;color:#1E3A8A}

.pt-table-wrap{overflow-x:auto}
.pt-table{width:100%;border-collapse:collapse;font-size:16px}
.pt-table th{text-align:left;font-size:14px;color:#4B5563;font-weight:700;padding:6px 10px 8px 0;border-bottom:1px solid #E5E7EF}
.pt-table td{padding:12px 10px 12px 0;border-bottom:1px solid #F1F2F6;vertical-align:top}
.pt-list{list-style:none;margin:0 0 10px;padding:0}
.pt-list li{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #F1F2F6;font-size:16.5px;flex-wrap:wrap}
.pt-req{border:2px solid #FDBA74;background:#FFFBF5;border-radius:14px;padding:16px;margin-bottom:12px}
.pt-req-h{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;font-size:19px}
.pt-note{margin:8px 0;font-size:16.5px;color:#374151;white-space:pre-wrap}
.pt-up{display:grid;gap:14px;margin-top:12px}
.pt-exp,.pt-send label,.pt-lbl{font-size:16px;font-weight:700;color:#374151;display:block}
.pt-exp input,.pt-send input,.pt-send select{display:block;margin-top:6px;padding:12px;border:2px solid #9CA3AF;border-radius:10px;font-size:17px;font-family:inherit;box-sizing:border-box;min-height:50px;background:#fff}
.pt-send{display:grid;gap:16px;max-width:520px}.pt-send input,.pt-send select{width:100%}

.pt-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#4F46E5;color:#fff;border:2px solid #4F46E5;border-radius:12px;padding:12px 20px;font-size:18px;font-weight:700;cursor:pointer;min-height:54px;text-decoration:none;font-family:inherit}
.pt-btn:disabled{opacity:.6;cursor:default}
.pt-btn-go{background:#059669;border-color:#059669;width:100%}
.pt-btn-outline{background:#fff;color:#4338CA}
.pt-btn-quiet{background:#fff;color:#065F46;border-color:#059669;min-height:48px}
.pt-btn-small{min-height:46px;font-size:16px;padding:8px 16px}
.pt-file-input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}
.pt-file{position:relative}
.pt-file-btn{width:100%;border-style:dashed}.pt-file-btn.has-file{border-style:solid;color:#047857;border-color:#059669;background:#ECFDF5}
.pt-file-input:focus-visible + .pt-file-btn{outline:3px solid #4F46E5;outline-offset:2px}
.pt-file-name{margin-top:8px;font-size:16px;font-weight:600;word-break:break-all}
.pt-err{color:#B91C1C;font-size:16px;font-weight:600;margin-top:8px}
.pt-welcome-back{position:fixed;inset:0;background:rgba(17,24,39,.6);z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
.pt-welcome{background:#fff;border-radius:18px;padding:24px;max-width:480px;width:100%}
.pt-welcome h2{font-size:26px;margin-bottom:16px}
.pt-step{display:flex;gap:14px;margin-bottom:18px}.pt-step b{font-size:19px;display:block}.pt-step p{margin:4px 0 0;font-size:17px;color:#374151}
.pt-step-n{flex:0 0 40px;height:40px;border-radius:50%;background:#4F46E5;color:#fff;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center}
.pt-help{text-align:center;color:#4B5563;font-size:16px;margin-top:24px}
@media(min-width:700px){.pt-org{display:inline}.pt-btn-go{width:auto}.pt-file-btn{width:auto}}
@media(max-width:640px){
  h1{font-size:28px}
  .pt-table thead{display:none}
  .pt-table tr{display:block;border-bottom:1px solid #E5E7EF;padding:8px 0}
  .pt-table td{display:block;border:none;padding:4px 0}
  .pt-table td::before{content:attr(data-l);display:block;font-size:13px;color:#4B5563;font-weight:700}
  .pt-soon-row .pt-btn{width:100%}
}
`
