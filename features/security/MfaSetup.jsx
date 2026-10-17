/**
 * MfaSetup — authenticator-app (TOTP) two-factor for the signed-in user.
 * Uses Supabase Auth MFA (TOTP is free on every plan; SMS/phone MFA is not offered here).
 * Each person turns it on for their own account. To make it mandatory at the database level, see
 * supabase-migration-017-require-mfa.sql.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useGlobalContext } from '../../context/AppContext'

export function MfaSetup() {
  const { toast, requestConfirm } = useGlobalContext()
  const [factors, setFactors] = useState(null)      // verified TOTP factors
  const [enroll, setEnroll] = useState(null)        // { id, qr, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.auth.mfa.listFactors()
    if (e) { setError(e.message); setFactors([]); return }
    setFactors((data?.totp || []).filter(f => f.status === 'verified'))
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true); setError('')
    // Clear abandoned (never verified) attempts first; Supabase rejects duplicate friendly names.
    const { data: all } = await supabase.auth.mfa.listFactors()
    for (const f of (all?.all || []).filter(x => x.factor_type === 'totp' && x.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (e) { setError(e.message); return }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setCode('')
  }

  async function verify(ev) {
    ev.preventDefault()
    setBusy(true); setError('')
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code })
    setBusy(false)
    if (e) { setError('That code did not work. Check the time on your phone and try again.'); setCode(''); return }
    setEnroll(null); setCode('')
    toast('Two-step verification is on.', 'success')
    load()
  }

  async function cancel() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id })
    setEnroll(null); setCode(''); setError('')
  }

  async function remove(f) {
    if (!(await requestConfirm({
      title: 'Turn off two-step verification',
      body: 'Your account will go back to password-only sign-in. You can set it up again at any time.',
      confirmText: 'Turn off', danger: true,
    }))) return
    const { error: e } = await supabase.auth.mfa.unenroll({ factorId: f.id })
    if (e) { toast(e.message, 'error'); return }
    toast('Two-step verification turned off.', 'warn')
    load()
  }

  const on = (factors || []).length > 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <strong style={{ fontSize: 13.5 }}>Two-step verification (authenticator app)</strong>
        {factors && <span className={`badge ${on ? 'b-green' : 'b-gray'}`} style={{ fontSize: 10.5 }}>{on ? 'On for your account' : 'Off'}</span>}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55, margin: '0 0 12px' }}>
        After your password, you enter a 6-digit code from an app like Google Authenticator, Microsoft Authenticator or 1Password.
        Each person turns this on for their own account.
      </p>

      {!enroll && !on && factors && <button className="btn btn-primary btn-sm" onClick={start} disabled={busy}>Set up authenticator app</button>}

      {!enroll && on && factors.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          <span style={{ color: 'var(--text-3)' }}>{f.friendly_name || 'Authenticator app'}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => remove(f)}>Turn off</button>
        </div>
      ))}

      {enroll && (
        <form onSubmit={verify} style={{ border: '1.5px solid var(--pr)', borderRadius: 10, padding: 14, maxWidth: 360 }}>
          <div style={{ fontSize: 12.5, marginBottom: 8 }}><strong>1.</strong> Scan this QR code with your authenticator app.</div>
          <img src={enroll.qr} alt="QR code to add Lacentra to your authenticator app" width={176} height={176} style={{ display: 'block', background: '#fff', margin: '0 auto 8px' }} />
          <div style={{ fontSize: 11.5, color: 'var(--text-4)', wordBreak: 'break-all', marginBottom: 12 }}>
            Can’t scan? Enter this key by hand: <code>{enroll.secret}</code>
          </div>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}><strong>2.</strong> Enter the 6-digit code it shows.</div>
          <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456" aria-label="6-digit code" style={{ width: '100%', fontSize: 18, letterSpacing: 6, textAlign: 'center', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={cancel}>Cancel</button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy || code.length !== 6}>Turn on</button>
          </div>
        </form>
      )}
      {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
    </div>
  )
}
