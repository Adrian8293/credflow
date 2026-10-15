import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function ResetPassword() {
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [showConf, setShowConf]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  function passStrength(p) {
    if (!p) return 0
    let s = 0
    if (p.length >= 8) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    return s
  }
  const strength = passStrength(password)
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', '#F43F5E', '#F59E0B', '#00C9A7', '#00C9A7'][strength]

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!/[A-Z]/.test(password)) { setError('Password must contain an uppercase letter.'); return }
    if (!/[0-9]/.test(password)) { setError('Password must contain a number.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSuccess(true)
      setTimeout(() => { window.location.href = '/' }, 3000)
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>Lacentra — Set New Password</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </Head>

      <div className="pc-root">
        <div className="blob blob-teal" />
        <div className="blob blob-blue" />

        <div className="pc-box">

          {/* Logo */}
          <div className="pc-logo">
            <PcMark size={36} />
            <div className="pc-logo-text">
              <span className="pc-prime">LAC</span>
              <span className="pc-credential">entra</span>
            </div>
          </div>

          {success ? (
            <div className="pc-success-state">
              <div className="pc-success-icon">✓</div>
              <div className="pc-heading">Password updated</div>
              <div className="pc-sub">You're all set. Redirecting you to the app…</div>
            </div>
          ) : (
            <>
              <div className="pc-heading">Set a new password</div>
              <div className="pc-sub">Choose something strong. You won't be able to reuse your old one.</div>

              {error && (
                <div className="pc-msg pc-msg--err">
                  <span className="pc-msg-icon">!</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="pc-form" noValidate>

                <div className="pc-field">
                  <label className="pc-label">New password</label>
                  <div className="pc-input-wrap">
                    <span className="pc-input-icon"><LockIcon /></span>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                    />
                    <span className="pc-input-right">
                      <button type="button" className="eye-btn" onClick={() => setShowPass(s => !s)} tabIndex={-1}>
                        {showPass ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </span>
                  </div>
                  {password && (
                    <div className="pc-strength">
                      <div className="pc-strength-bars">
                        {[1,2,3,4].map(i => (
                          <div key={i} className="pc-strength-bar" style={{ background: i <= strength ? strengthColor : '#E7E9F1' }} />
                        ))}
                      </div>
                      <span className="pc-strength-label" style={{ color: strengthColor }}>{strengthLabel}</span>
                    </div>
                  )}
                  <div className="pc-rules">
                    {[
                      [password.length >= 8, '8+ characters'],
                      [/[A-Z]/.test(password), 'Uppercase letter'],
                      [/[0-9]/.test(password), 'Number'],
                    ].map(([ok, txt]) => (
                      <div key={txt} className={`pc-rule${ok ? ' ok' : ''}`}><span>{ok ? '✓' : '○'}</span>{txt}</div>
                    ))}
                  </div>
                </div>

                <div className="pc-field">
                  <label className="pc-label">Confirm password</label>
                  <div className="pc-input-wrap">
                    <span className="pc-input-icon"><LockIcon /></span>
                    <input
                      type={showConf ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                    />
                    <span className="pc-input-right">
                      <button type="button" className="eye-btn" onClick={() => setShowConf(s => !s)} tabIndex={-1}>
                        {showConf ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </span>
                  </div>
                  {confirm && (
                    password === confirm
                      ? <span className="pc-inline-ok">✓ Passwords match</span>
                      : <span className="pc-inline-err">Passwords do not match</span>
                  )}
                </div>

                <button type="submit" className="pc-submit" disabled={loading}>
                  {loading ? <><Spinner /> Updating password…</> : 'Update Password →'}
                </button>

              </form>

              <div className="pc-trust">
                <div className="pc-trust-item"><span>🔒</span>Encrypted connection</div>
                <div className="pc-trust-sep" />
                <div className="pc-trust-item"><span>🛡</span>Authorized users only</div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function PcMark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lmg2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00C9A7"/>
          <stop offset="100%" stopColor="#3B82F6"/>
        </linearGradient>
      </defs>
      <rect x="2" y="10" width="30" height="4" rx="2" fill="url(#lmg2)"/>
      <rect x="2" y="20" width="21" height="4" rx="2" fill="#00C9A7" opacity=".5"/>
      <rect x="2" y="30" width="25" height="4" rx="2" fill="#00C9A7" opacity=".28"/>
      <circle cx="39" cy="31" r="9" fill="none" stroke="#00C9A7" strokeWidth="2"/>
      <path d="M36 31l2.4 2.4 4.6-5" fill="none" stroke="#00C9A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const LockIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const EyeIcon    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const EyeOffIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
function Spinner() { return <span className="pc-spinner" /> }

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overflow:hidden;}
body{font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased;background:#F6F7FB;color:#111827;font-size:14px;}
button{font-family:inherit;cursor:pointer;border:none;background:none;}
input{font-family:inherit;}
.pc-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:#F6F7FB;overflow-y:auto;}
.blob{position:fixed;border-radius:50%;pointer-events:none;filter:blur(100px);}
.blob-teal{width:600px;height:600px;top:-200px;left:-200px;background:radial-gradient(circle,rgba(79,70,229,.08) 0%,transparent 70%);}
.blob-blue{width:500px;height:500px;bottom:-150px;right:-100px;background:radial-gradient(circle,rgba(79,70,229,.07) 0%,transparent 70%);}
.pc-box{position:relative;z-index:1;width:100%;max-width:440px;background:#fff;border:1px solid #E7E9F1;border-radius:20px;padding:40px 36px 32px;box-shadow:0 16px 40px rgba(16,24,40,.10),0 4px 12px rgba(16,24,40,.05);}
.pc-logo{display:flex;align-items:center;gap:10px;margin-bottom:28px;}
.pc-logo-text{display:flex;align-items:baseline;}
.pc-prime{font-size:18px;font-weight:700;color:#4F46E5;letter-spacing:-.4px;}
.pc-credential{font-size:18px;font-weight:600;color:#111827;letter-spacing:-.2px;}
.pc-heading{font-size:22px;font-weight:700;color:#111827;letter-spacing:-.5px;margin-bottom:6px;}
.pc-sub{font-size:13px;color:#5B6478;margin-bottom:24px;line-height:1.5;}
.pc-success-state{text-align:center;padding:20px 0 12px;}
.pc-success-icon{width:56px;height:56px;border-radius:50%;background:rgba(5,150,105,.10);border:2px solid rgba(5,150,105,.3);display:flex;align-items:center;justify-content:center;font-size:22px;color:#059669;margin:0 auto 18px;}
.pc-form{display:flex;flex-direction:column;gap:16px;}
.pc-field{display:flex;flex-direction:column;gap:5px;}
.pc-label{font-size:11px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#5B6478;}
.pc-input-wrap{position:relative;display:flex;align-items:center;}
.pc-input-wrap input{width:100%;padding:10px 40px 10px 38px;border:1.5px solid #D6DAE6;border-radius:8px;font-size:13.5px;color:#111827;background:#fff;outline:none;transition:border-color .15s,box-shadow .15s;}
.pc-input-wrap input:focus{border-color:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.12);}
.pc-input-wrap input::placeholder{color:#8A93A6;}
.pc-input-icon{position:absolute;left:12px;color:#6B7385;display:flex;align-items:center;pointer-events:none;z-index:1;}
.pc-input-right{position:absolute;right:12px;display:flex;align-items:center;z-index:1;}
.eye-btn{background:none;border:none;color:#6B7385;display:flex;align-items:center;padding:0;cursor:pointer;transition:color .15s;}
.eye-btn:hover{color:#111827;}
.pc-strength{display:flex;align-items:center;gap:8px;margin-top:4px;}
.pc-strength-bars{display:flex;gap:4px;flex:1;}
.pc-strength-bar{flex:1;height:3px;border-radius:3px;transition:background .3s;}
.pc-strength-label{font-size:11px;font-weight:600;min-width:36px;}
.pc-rules{display:flex;flex-direction:column;gap:3px;padding:8px 12px;background:#F6F7FB;border:1px solid #E7E9F1;border-radius:8px;margin-top:4px;}
.pc-rule{font-size:11.5px;color:#5B6478;display:flex;gap:7px;align-items:center;}
.pc-rule.ok{color:#059669;}
.pc-inline-ok{font-size:11.5px;color:#059669;margin-top:2px;}
.pc-inline-err{font-size:11.5px;color:#DC2626;margin-top:2px;}
.pc-msg{display:flex;align-items:flex-start;gap:10px;border-radius:8px;padding:11px 14px;font-size:12.5px;line-height:1.5;margin-bottom:4px;}
.pc-msg--err{background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.22);color:#B91C1C;}
.pc-msg-icon{width:20px;height:20px;border-radius:50%;background:currentColor;color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;}
.pc-submit{display:flex;align-items:center;justify-content:center;gap:9px;padding:12px 20px;width:100%;background:#4F46E5;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;transition:background .15s,transform .15s;box-shadow:0 1px 2px rgba(79,70,229,.25),0 4px 12px rgba(79,70,229,.18);margin-top:4px;cursor:pointer;}
.pc-submit:hover:not(:disabled){background:#4338CA;transform:translateY(-1px);}
.pc-submit:disabled{opacity:.5;cursor:not-allowed;transform:none;}
.pc-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
@keyframes spin{to{transform:rotate(360deg);}}
.pc-trust{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:22px;flex-wrap:wrap;}
.pc-trust-item{display:flex;align-items:center;gap:5px;font-size:10px;color:#6B7385;}
.pc-trust-sep{width:3px;height:3px;border-radius:50%;background:#D6DAE6;}
`

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth. Removing getServerSideProps eliminates
// the server round-trip that was causing tab-switch delays (every navigation
// previously waited for a /_next/data fetch before rendering).
