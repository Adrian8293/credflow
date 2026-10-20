/**
 * MfaChallenge — shown after password sign-in when the account has an authenticator app set up.
 * Until the 6-digit code is verified the session stays at assurance level aal1 and the app does not render.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function MfaChallenge({ onVerified, onSignOut }) {
  const [factorId, setFactorId] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error: e }) => {
      if (e) { setError(e.message); return }
      setFactorId((data?.totp || []).find(f => f.status === 'verified')?.id || null)
    })
  }, [])

  async function verify(value) {
    if (!factorId || value.length !== 6 || busy) return
    setBusy(true); setError('')
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: value })
    setBusy(false)
    if (e) { setError('That code did not work. Check your authenticator app and try again.'); setCode(''); return }
    onVerified?.()
  }

  function submit(ev) { ev.preventDefault(); verify(code) }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f8fafc)', fontFamily: 'Inter, sans-serif', padding: 16 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 440, background: 'var(--card, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 14, padding: 28, boxShadow: '0 8px 30px rgba(0,0,0,.06)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>Two-step verification</h2>
        <p style={{ margin: '0 0 20px', fontSize: 18, color: '#475569', lineHeight: 1.5 }}>
          Open your authenticator app on your phone and type the 6-digit number shown for Lacentra. It changes every 30 seconds.
        </p>
        <input
          autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) verify(v) }} placeholder="123456" aria-label="6-digit code"
          style={{ width: '100%', fontSize: 36, letterSpacing: 10, textAlign: 'center', padding: '12px 8px', minHeight: 72, border: '2px solid #94A3B8', borderRadius: 12, boxSizing: 'border-box' }}
        />
        {error && <div role="alert" style={{ color: '#B91C1C', background: '#FEF2F2', border: '2px solid #FCA5A5', borderRadius: 10, padding: '12px 14px', fontWeight: 600, fontSize: 17, marginTop: 12 }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6 || !factorId} style={{ width: '100%', marginTop: 18, height: 58, fontSize: 19, borderRadius: 12 }}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button type="button" onClick={onSignOut} style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: '#4338CA', fontWeight: 700, textDecoration: 'underline', fontSize: 17, padding: '10px 14px', cursor: 'pointer' }}>
          Sign out
        </button>
      </form>
    </div>
  )
}
