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

  async function submit(ev) {
    ev.preventDefault()
    if (!factorId || code.length !== 6) return
    setBusy(true); setError('')
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (e) { setError('That code did not work. Check your authenticator app and try again.'); setCode(''); return }
    onVerified?.()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #f8fafc)', fontFamily: 'Inter, sans-serif', padding: 16 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360, background: 'var(--card, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 14, padding: 28, boxShadow: '0 8px 30px rgba(0,0,0,.06)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700 }}>Two-step verification</h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-3, #6b7280)', lineHeight: 1.5 }}>
          Open your authenticator app and enter the 6-digit code for Lacentra.
        </p>
        <input
          autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" aria-label="6-digit code"
          style={{ width: '100%', fontSize: 24, letterSpacing: 8, textAlign: 'center', padding: '10px 8px', border: '1.5px solid var(--border, #d1d5db)', borderRadius: 8, boxSizing: 'border-box' }}
        />
        {error && <div role="alert" style={{ color: 'var(--danger, #b42318)', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6 || !factorId} style={{ width: '100%', marginTop: 16, height: 40 }}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
        <button type="button" onClick={onSignOut} style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', color: 'var(--text-3, #6b7280)', fontSize: 12.5, cursor: 'pointer' }}>
          Sign out
        </button>
      </form>
    </div>
  )
}
