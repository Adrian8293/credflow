// pages/invite.js — public page. The invited person sets their own password here.
import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { AUTH_READABLE_CSS } from '../lib/authCss'

const ROLE_LABEL = {
  provider: 'provider', clinic_staff: 'clinic staff member', admin: 'administrator',
  credentialer: 'credentialing specialist', viewer: 'viewer',
}

export default function InvitePage() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : ''
  const [info, setInfo] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | invalid | done
  const [error, setError] = useState('')
  const [accountExists, setAccountExists] = useState(false)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionEmail((data?.user?.email || '').toLowerCase()))
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    if (!token) { setState('invalid'); return }
    fetch(`/api/invite-info?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) { setError(j.error || 'This invite link is not valid.'); setState('invalid'); return }
        setInfo(j); setState('ready')
      })
      .catch(() => { setError('Could not check this invite. Please try again.'); setState('invalid') })
  }, [router.isReady, token])

  function problem() {
    if (pw.length < 8) return 'Password must be at least 8 characters.'
    if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.'
    if (!/[0-9]/.test(pw)) return 'Password must contain a number.'
    if (pw !== pw2) return 'Passwords do not match.'
    return ''
  }

  const alreadySignedIn = !!info && !!sessionEmail && sessionEmail === info.email.toLowerCase()

  async function submit(e) {
    e.preventDefault()
    const p = alreadySignedIn ? '' : problem()
    if (p) { setError(p); return }
    setBusy(true); setError(''); setAccountExists(false)
    try {
      const r = await fetch('/api/accept-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw, firstName: first.trim(), lastName: last.trim() }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Something went wrong.'); setAccountExists(j.code === 'account_exists'); setBusy(false); return }
      if (alreadySignedIn) { window.location.href = '/'; return }
      const { error: sErr } = await supabase.auth.signInWithPassword({ email: info.email, password: pw })
      if (sErr) { setState('done'); setBusy(false); return }
      window.location.href = '/'
    } catch {
      setError('Something went wrong. Please try again.'); setBusy(false)
    }
  }

  const signInHref = `/login?next=${encodeURIComponent(`/invite?token=${token}`)}`

  return (
    <>
      <Head><title>Accept invitation</title></Head>
      <style>{CSS + AUTH_READABLE_CSS}</style>
      <main className="iv-wrap">
        <div className="iv-card">
          <div className="iv-brand"><span>LAC</span>entra</div>

          {state === 'loading' && <p className="iv-muted">Checking your invitation…</p>}

          {state === 'invalid' && (
            <>
              <h1>Invitation not available</h1>
              <p className="iv-muted">{error || 'This invite link is not valid or has expired.'}</p>
              <p className="iv-muted">Ask your credentialing team to send you a new link.</p>
              <Link className="iv-link" href="/login">Go to sign in</Link>
            </>
          )}

          {state === 'done' && (
            <>
              <h1>You're all set</h1>
              <p className="iv-muted">Your account is ready. Sign in with {info?.email} and the password you just chose.</p>
              <Link className="iv-btn" href="/login">Sign in</Link>
            </>
          )}

          {state === 'ready' && info && (
            <form onSubmit={submit} noValidate>
              <h1>Welcome to {info.orgName}</h1>
              <p className="iv-muted">
                You were invited as a {ROLE_LABEL[info.role] || info.role}. Choose a password for <b>{info.email}</b>.
              </p>

              {alreadySignedIn ? (
                <>
                  <p className="iv-muted">You are signed in as <b>{sessionEmail}</b>. Accepting adds this organization to your account.</p>
                  {error && <div className="iv-error" role="alert">{error}</div>}
                  <button className="iv-btn" type="submit" disabled={busy}>{busy ? 'Accepting…' : 'Accept invitation'}</button>
                </>
              ) : (<>
              <div className="iv-row">
                <label>First name<input value={first} onChange={e => setFirst(e.target.value)} autoComplete="given-name" /></label>
                <label>Last name<input value={last} onChange={e => setLast(e.target.value)} autoComplete="family-name" /></label>
              </div>
              <label>Email<input value={info.email} readOnly aria-readonly="true" /></label>
              <label>Password
                <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" />
              </label>
              <label>Confirm password
                <input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" />
              </label>
              <label className="iv-check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show passwords</label>
              <p className="iv-hint">At least 8 characters, with an uppercase letter and a number.</p>

              {error && <div className="iv-error" role="alert">{error}</div>}
              {accountExists && <a className="iv-link" href={signInHref}>Sign in to accept this invitation</a>}

              <button className="iv-btn" type="submit" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
              </>)}
            </form>
          )}
        </div>
      </main>
    </>
  )
}

const CSS = `
.iv-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#F6F7FB;font-family:Inter,system-ui,sans-serif;color:#111827}
.iv-card{width:100%;max-width:440px;background:#fff;border:1px solid #E5E7EF;border-radius:14px;padding:28px 24px;box-shadow:0 8px 30px rgba(17,24,39,.06)}
.iv-brand{font-size:20px;font-weight:800;letter-spacing:-.02em;margin-bottom:14px}.iv-brand span{color:#4F46E5}
h1{font-size:21px;margin:0 0 6px;letter-spacing:-.01em}
.iv-muted{color:#6B7280;font-size:14px;line-height:1.5;margin:0 0 14px}
label{display:block;font-size:12.5px;font-weight:600;color:#374151;margin-bottom:12px}
input[type=text],input[type=password],input:not([type]){display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px 11px;border:1px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit}
input[readonly]{background:#F3F4F6;color:#6B7280}
input:focus{outline:2px solid #C7D2FE;border-color:#4F46E5}
.iv-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.iv-check{display:flex;align-items:center;gap:7px;font-weight:500}.iv-check input{margin:0}
.iv-hint{font-size:12px;color:#6B7280;margin:0 0 12px}
.iv-error{background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:8px;padding:9px 11px;font-size:13px;margin-bottom:12px}
.iv-btn{display:block;width:100%;text-align:center;box-sizing:border-box;background:#4F46E5;color:#fff;border:none;border-radius:9px;padding:11px 14px;font-size:14.5px;font-weight:600;cursor:pointer;text-decoration:none}
.iv-btn:disabled{opacity:.6;cursor:default}
.iv-link{display:inline-block;margin:0 0 12px;color:#4F46E5;font-weight:600;font-size:14px}
@media(max-width:420px){.iv-row{grid-template-columns:1fr}}
`
