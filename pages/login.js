import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [org, setOrg] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function switchMode(m) {
    setMode(m); setStep(1); setError(''); setSuccess('')
    setEmail(''); setPassword(''); setFirstName(''); setLastName('')
    setConfirmPass(''); setOrg(''); setShowPass(false); setShowConfirm(false)
  }

  function validateStep1() {
    if (!firstName.trim()) return 'First name is required.'
    if (!lastName.trim()) return 'Last name is required.'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email address is required.'
    return null
  }

  function validateStep2() {
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
    if (password !== confirmPass) return 'Passwords do not match.'
    return null
  }

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
  const strengthColor = ['', '#ef4444', '#f59e0b', '#10b981', '#10b981'][strength]

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess('')

    if (mode === 'signup') {
      if (step === 1) {
        const err = validateStep1()
        if (err) { setError(err); return }
        setStep(2); return
      }
      const err = validateStep2()
      if (err) { setError(err); return }
      setLoading(true)
      try {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { first_name: firstName, last_name: lastName, organization: org } }
        })
        if (error) throw error
        setSuccess('Account created! Check ' + email + ' for a confirmation link before signing in.')
        setTimeout(() => switchMode('login'), 6000)
      } catch (err) { setError(err.message) }
      setLoading(false)
      return
    }

    if (mode === 'reset') {
      if (!email.trim()) { setError('Please enter your email address.'); return }
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/reset-password',
        })
        if (error) throw error
        setSuccess('Reset link sent! Check your inbox and spam folder.')
      } catch (err) { setError(err.message) }
      setLoading(false)
      return
    }

    if (!email.trim() || !password) { setError('Email and password are required.'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      window.location.href = '/'
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  const year = new Date().getFullYear()

  return (
    <>
      <Head>
        <title>CredFlow — {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Reset Password'}</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </Head>

      <div className="cf-page">

        {/* HEADER */}
        <header className="cf-header">
          <div className="cf-header-inner">
            <div className="cf-logo">
              <CredFlowLogoIcon size={44} />
              <div className="cf-logo-text">
                <div className="cf-logo-wordmark"><span className="cred">Cred</span><span className="flow">Flow</span></div>
                <div className="cf-logo-tagline">CREDENTIALING · SIMPLIFIED · ACCELERATED</div>
              </div>
            </div>
            <nav className="cf-header-nav">
              <a href="#" className="cf-nav-link">Features</a>
              <a href="#" className="cf-nav-link">Pricing</a>
              <a href="#" className="cf-nav-link">Support</a>
              {mode === 'login'
                ? <button className="cf-nav-cta" onClick={() => switchMode('signup')}>Create Account</button>
                : <button className="cf-nav-cta" onClick={() => switchMode('login')}>Sign In</button>
              }
            </nav>
          </div>
        </header>

        {/* HERO */}
        <div className="cf-hero-band">
          <div className="cf-hero-inner">
            <div className="cf-hero-tag">
              <span className="tag-dot"></span>
              Healthcare Credentialing Platform
            </div>
            <h1 className="cf-hero-h1">
              {mode === 'login' && 'Welcome Back to CredFlow'}
              {mode === 'signup' && 'Start Your Free Account'}
              {mode === 'reset' && 'Reset Your Password'}
            </h1>
            <p className="cf-hero-sub">
              {mode === 'login' && 'Sign in to manage provider credentials, payer enrollments, and compliance — all in one place.'}
              {mode === 'signup' && 'Join credentialing teams who trust CredFlow to stay compliant and get reimbursed faster.'}
              {mode === 'reset' && "Enter your email and we'll send a secure reset link straight to your inbox."}
            </p>
          </div>
        </div>

        {/* MAIN */}
        <main className="cf-main">
          <div className={`cf-layout ${mode === 'reset' ? 'cf-layout--reset' : ''}`}>

            {mode !== 'reset' && (
              <div className="cf-sidebar">
                <div className="cf-sidebar-inner">
                  <h2 className="sidebar-heading">Why CredFlow?</h2>
                  <p className="sidebar-intro">Built for credentialing specialists by people who understand the process.</p>
                  <div className="sidebar-features">
                    {[
                      { title: 'Trust & Reliability', desc: 'HIPAA-compliant platform built for healthcare data security.' },
                      { title: 'Speed & Efficiency', desc: 'Streamline workflows and eliminate costly credentialing delays.' },
                      { title: 'Clarity & Control', desc: 'Real-time visibility into enrollments and expiration dates.' },
                      { title: 'Built for Healthcare', desc: 'Designed by credentialing experts who know the process.' },
                    ].map(f => (
                      <div key={f.title} className="sf-row">
                        <div className="sf-icon">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div>
                          <div className="sf-title">{f.title}</div>
                          <div className="sf-desc">{f.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="sidebar-stat-row">
                    {[['500+','Providers'],['18+','Payers'],['99%','Uptime']].map(([n,l]) => (
                      <div key={l} className="sidebar-stat">
                        <div className="stat-num">{n}</div>
                        <div className="stat-lbl">{l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="sidebar-quote">
                    <div className="sq-text">"CredFlow cut our credentialing time in half and eliminated missed expirations."</div>
                    <div className="sq-author">— Practice Administrator, Behavioral Health Group</div>
                  </div>
                </div>
              </div>
            )}

            {/* FORM CARD */}
            <div className="cf-form-col">
              <div className="cf-card">
                <div className="card-top-logo">
                  <CredFlowLogoIcon size={30} />
                  <span className="ctl-name"><span className="cred">Cred</span><span className="flow">Flow</span></span>
                </div>

                {mode === 'signup' && (
                  <div className="step-bar">
                    <div className={'step-item' + (step >= 1 ? ' active' : '') + (step > 1 ? ' done' : '')}>
                      <div className="step-num">{step > 1 ? '✓' : '1'}</div>
                      <div className="step-lbl">Your Info</div>
                    </div>
                    <div className="step-line"></div>
                    <div className={'step-item' + (step >= 2 ? ' active' : '')}>
                      <div className="step-num">2</div>
                      <div className="step-lbl">Security</div>
                    </div>
                  </div>
                )}

                <div className="card-heading">
                  {mode === 'login' && 'Sign in to your account'}
                  {mode === 'signup' && step === 1 && 'Create your account'}
                  {mode === 'signup' && step === 2 && 'Secure your account'}
                  {mode === 'reset' && 'Reset your password'}
                </div>
                <div className="card-sub">
                  {mode === 'login' && 'Enter your credentials to access your dashboard.'}
                  {mode === 'signup' && step === 1 && 'Step 1 of 2 — Tell us a bit about yourself.'}
                  {mode === 'signup' && step === 2 && 'Step 2 of 2 — Choose a strong password.'}
                  {mode === 'reset' && "We'll email you a secure link to reset your password."}
                </div>

                {success && (
                  <div className="msg-success">
                    <span className="msg-icon msg-icon--green">✓</span>
                    <span>{success}</span>
                  </div>
                )}

                {!success && (
                  <form onSubmit={handleSubmit} className="cf-form" noValidate>

                    {mode === 'login' && (
                      <>
                        <div className="cf-field">
                          <label htmlFor="email">Email address</label>
                          <div className="cf-input-wrap">
                            <span className="cf-input-icon"><EmailSVG /></span>
                            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@practice.com" autoComplete="email" required />
                          </div>
                        </div>
                        <div className="cf-field">
                          <label htmlFor="pass">Password</label>
                          <div className="cf-input-wrap">
                            <span className="cf-input-icon"><LockSVG /></span>
                            <input id="pass" type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
                            <button type="button" className="eye-btn" onClick={() => setShowPass(s => !s)}>{showPass ? <EyeOffSVG /> : <EyeSVG />}</button>
                          </div>
                        </div>
                        <div className="forgot-row">
                          <button type="button" className="link-sm" onClick={() => switchMode('reset')}>Forgot password?</button>
                        </div>
                      </>
                    )}

                    {mode === 'signup' && step === 1 && (
                      <>
                        <div className="field-row-2">
                          <div className="cf-field">
                            <label htmlFor="fn">First name</label>
                            <div className="cf-input-wrap">
                              <span className="cf-input-icon"><UserSVG /></span>
                              <input id="fn" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" required />
                            </div>
                          </div>
                          <div className="cf-field">
                            <label htmlFor="ln">Last name</label>
                            <div className="cf-input-wrap">
                              <input id="ln" type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Smith" autoComplete="family-name" required style={{ paddingLeft: '12px' }} />
                            </div>
                          </div>
                        </div>
                        <div className="cf-field">
                          <label htmlFor="semail">Work email address</label>
                          <div className="cf-input-wrap">
                            <span className="cf-input-icon"><EmailSVG /></span>
                            <input id="semail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@yourpractice.com" autoComplete="email" required />
                          </div>
                        </div>
                        <div className="cf-field">
                          <label htmlFor="org">Organization / Practice name <span className="opt-lbl">(optional)</span></label>
                          <div className="cf-input-wrap">
                            <span className="cf-input-icon"><OrgSVG /></span>
                            <input id="org" type="text" value={org} onChange={e => setOrg(e.target.value)} placeholder="Your practice name" autoComplete="organization" />
                          </div>
                        </div>
                      </>
                    )}

                    {mode === 'signup' && step === 2 && (
                      <>
                        <div className="recap-box">
                          <span className="recap-name">{firstName} {lastName}</span>
                          <span className="recap-email">{email}</span>
                        </div>
                        <div className="cf-field">
                          <label htmlFor="np">Create password</label>
                          <div className="cf-input-wrap">
                            <span className="cf-input-icon"><LockSVG /></span>
                            <input id="np" type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" required />
                            <button type="button" className="eye-btn" onClick={() => setShowPass(s => !s)}>{showPass ? <EyeOffSVG /> : <EyeSVG />}</button>
                          </div>
                        </div>
                        {password && (
                          <div className="strength-wrap">
                            <div className="strength-bars">
                              {[1, 2, 3, 4].map(n => (
                                <div key={n} className="strength-bar" style={{ background: n <= strength ? strengthColor : '#E2E8F0' }} />
                              ))}
                            </div>
                            <span className="strength-lbl" style={{ color: strengthColor }}>{strengthLabel}</span>
                          </div>
                        )}
                        <div className="pass-rules">
                          <div className={'pass-rule' + (password.length >= 8 ? ' pass-rule--ok' : '')}><span>{password.length >= 8 ? '✓' : '○'}</span> At least 8 characters</div>
                          <div className={'pass-rule' + (/[A-Z]/.test(password) ? ' pass-rule--ok' : '')}><span>{/[A-Z]/.test(password) ? '✓' : '○'}</span> One uppercase letter</div>
                          <div className={'pass-rule' + (/[0-9]/.test(password) ? ' pass-rule--ok' : '')}><span>{/[0-9]/.test(password) ? '✓' : '○'}</span> One number</div>
                        </div>
                        <div className="cf-field">
                          <label htmlFor="cp">Confirm password</label>
                          <div className="cf-input-wrap">
                            <span className="cf-input-icon"><LockSVG /></span>
                            <input id="cp" type={showConfirm ? 'text' : 'password'} value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Re-enter password" autoComplete="new-password" required />
                            <button type="button" className="eye-btn" onClick={() => setShowConfirm(s => !s)}>{showConfirm ? <EyeOffSVG /> : <EyeSVG />}</button>
                          </div>
                        </div>
                        {confirmPass && password !== confirmPass && <div className="inline-warn">✗ Passwords do not match</div>}
                        {confirmPass && password === confirmPass && <div className="inline-ok">✓ Passwords match</div>}
                      </>
                    )}

                    {mode === 'reset' && (
                      <div className="cf-field">
                        <label htmlFor="remail">Email address</label>
                        <div className="cf-input-wrap">
                          <span className="cf-input-icon"><EmailSVG /></span>
                          <input id="remail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@practice.com" autoComplete="email" required />
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="msg-error">
                        <span className="msg-icon msg-icon--red">!</span>
                        <span>{error}</span>
                      </div>
                    )}

                    <button type="submit" className="cf-submit" disabled={loading}>
                      {loading
                        ? <><span className="spinner"></span>{mode === 'signup' ? (step === 1 ? 'Continuing…' : 'Creating account…') : mode === 'reset' ? 'Sending…' : 'Signing in…'}</>
                        : mode === 'login' ? 'Sign In →'
                        : mode === 'signup' && step === 1 ? 'Continue →'
                        : mode === 'signup' && step === 2 ? 'Create My Account'
                        : 'Send Reset Link'
                      }
                    </button>

                    {mode === 'signup' && step === 2 && (
                      <button type="button" className="cf-back" onClick={() => { setStep(1); setError('') }}>← Back to step 1</button>
                    )}
                  </form>
                )}

                <div className="card-divider"><span>or</span></div>
                <div className="card-switch">
                  {mode === 'login' && <p>Don't have an account? <button className="link-primary" onClick={() => switchMode('signup')}>Create one for free</button></p>}
                  {mode === 'signup' && <p>Already have an account? <button className="link-primary" onClick={() => switchMode('login')}>Sign in</button></p>}
                  {mode === 'reset' && <p>Remembered it? <button className="link-primary" onClick={() => switchMode('login')}>Back to sign in</button></p>}
                </div>

                {mode === 'login' && (
                  <div className="sso-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Enterprise SSO available — <button className="link-sm" onClick={() => {}}>Sign in with SSO</button>
                  </div>
                )}
              </div>

              <div className="trust-row">
                <div className="trust-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> 256-bit SSL</div>
                <div className="trust-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> HIPAA Compliant</div>
                <div className="trust-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg> SOC 2 Certified</div>
              </div>
            </div>

          </div>
        </main>

        {/* FOOTER */}
        <footer className="cf-footer">
          <div className="cf-footer-top">
            <div className="cf-footer-brand">
              <div className="footer-logo">
                <CredFlowLogoIcon size={28} dark={false} />
                <span className="footer-logo-name"><span className="cred">Cred</span><span className="flow">Flow</span></span>
              </div>
              <p className="footer-brand-desc">The all-in-one credentialing platform built for healthcare providers and RCM teams. Automate. Track. Stay compliant. Get reimbursed faster.</p>
            </div>
            <div className="footer-links-grid">
              {[
                { title: 'Product', links: ['Dashboard','Providers','Payer Enrollments','Revenue Cycle','Compliance Alerts'] },
                { title: 'Company', links: ['About','Careers','Blog','Contact'] },
                { title: 'Resources', links: ['Credentialing Guide','Payer Directory','CAQH Tips','Help Center'] },
                { title: 'Legal & Security', links: ['Privacy Policy','Terms of Service','HIPAA Compliance','Security'] },
              ].map(col => (
                <div key={col.title} className="footer-col">
                  <div className="footer-col-title">{col.title}</div>
                  {col.links.map(l => <a key={l} className="footer-link" href="#">{l}</a>)}
                </div>
              ))}
            </div>
          </div>
          <div className="cf-footer-bar">
            <div className="cf-footer-bar-inner">
              <div className="footer-features">
                {['Automate Workflows','Ensure Compliance','Reduce Denials','Increase Reimbursement'].map(f => (
                  <div key={f} className="ff-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </div>
                ))}
              </div>
              <div className="footer-copy">
                © {year} CredFlow · <a href="#" className="footer-copy-link">Privacy</a> · <a href="#" className="footer-copy-link">Terms</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </>
  )
}

function CredFlowLogoIcon({ size = 44, dark = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 46 46" fill="none">
      <circle cx="23" cy="23" r="20" fill="none" stroke={dark ? '#0D1B3D' : 'rgba(255,255,255,0.6)'} strokeWidth="3.5"/>
      <circle cx="34" cy="10" r="5" fill="#10B981"/>
      <circle cx="23" cy="23" r="10" fill="#0D1B3D"/>
      <path d="M18 23l3.2 3.2 6.8-7" stroke="#10B981" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <circle cx="15" cy="37" r="2.5" fill="#A7F3D0"/>
      <circle cx="22" cy="39.5" r="2" fill="#2563EB"/>
    </svg>
  )
}

const EmailSVG = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
const LockSVG  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const UserSVG  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const OrgSVG   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const EyeSVG   = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const EyeOffSVG= () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { font-family: 'Poppins', system-ui, sans-serif; -webkit-font-smoothing: antialiased; background: #F3F4F6; color: #0D1B3D; font-size: 14px; }
a { text-decoration: none; color: inherit; }
button { font-family: inherit; cursor: pointer; }
:root { --navy:#0D1B3D; --blue:#2563EB; --blue-h:#1d55d4; --green:#10B981; --green-l:#A7F3D0; --border:#E2E8F0; --ink-3:#64748B; --ink-4:#94A3B8; }
.cf-page { display:flex; flex-direction:column; min-height:100vh; }

.cf-header { background:#fff; border-bottom:1px solid var(--border); position:sticky; top:0; z-index:100; box-shadow:0 1px 4px rgba(13,27,61,.06); }
.cf-header-inner { max-width:1200px; margin:0 auto; padding:0 32px; height:72px; display:flex; align-items:center; justify-content:space-between; gap:24px; }
.cf-logo { display:flex; align-items:center; gap:12px; flex-shrink:0; }
.cf-logo-text { display:flex; flex-direction:column; }
.cf-logo-wordmark { font-size:24px; font-weight:800; letter-spacing:-.5px; line-height:1; }
.cred { color:var(--navy); }
.flow { color:var(--green); }
.cf-logo-tagline { font-size:7.5px; font-weight:600; letter-spacing:1.4px; color:var(--ink-4); margin-top:2px; }
.cf-header-nav { display:flex; align-items:center; gap:4px; }
.cf-nav-link { padding:7px 14px; border-radius:8px; font-size:13px; font-weight:500; color:var(--ink-3); transition:all .15s; border:none; background:none; }
.cf-nav-link:hover { background:#F1F5F9; color:var(--navy); }
.cf-nav-cta { padding:8px 18px; background:var(--blue); color:white; border:none; border-radius:8px; font-size:13px; font-weight:600; transition:all .15s; box-shadow:0 2px 8px rgba(37,99,235,.3); margin-left:8px; }
.cf-nav-cta:hover { background:var(--blue-h); transform:translateY(-1px); box-shadow:0 4px 14px rgba(37,99,235,.4); }

.cf-hero-band { background:linear-gradient(135deg,#0D1B3D 0%,#132240 55%,#1a3060 100%); padding:52px 32px 58px; position:relative; overflow:hidden; }
.cf-hero-band::before { content:''; position:absolute; top:-80px; right:-80px; width:400px; height:400px; background:radial-gradient(circle,rgba(16,185,129,.15) 0%,transparent 70%); border-radius:50%; }
.cf-hero-band::after { content:''; position:absolute; bottom:-50px; left:4%; width:280px; height:280px; background:radial-gradient(circle,rgba(37,99,235,.18) 0%,transparent 70%); border-radius:50%; }
.cf-hero-inner { max-width:740px; margin:0 auto; text-align:center; position:relative; z-index:1; }
.cf-hero-tag { display:inline-flex; align-items:center; gap:8px; background:rgba(16,185,129,.14); border:1px solid rgba(16,185,129,.3); border-radius:20px; padding:5px 14px; font-size:10.5px; font-weight:600; color:#A7F3D0; letter-spacing:.8px; text-transform:uppercase; margin-bottom:18px; }
.tag-dot { width:6px; height:6px; background:#10B981; border-radius:50%; animation:pulse 2s infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
.cf-hero-h1 { font-size:38px; font-weight:800; color:white; letter-spacing:-.8px; line-height:1.15; margin-bottom:14px; }
.cf-hero-sub { font-size:15.5px; color:rgba(255,255,255,.6); line-height:1.65; max-width:580px; margin:0 auto; }

.cf-main { flex:1; padding:48px 32px 64px; }
.cf-layout { max-width:1100px; margin:0 auto; display:grid; grid-template-columns:1fr 460px; gap:40px; align-items:start; }
.cf-layout--reset { grid-template-columns:1fr; max-width:480px; }

.cf-sidebar { position:sticky; top:90px; }
.cf-sidebar-inner { background:#fff; border:1px solid var(--border); border-radius:18px; padding:30px 26px; box-shadow:0 2px 12px rgba(13,27,61,.06); }
.sidebar-heading { font-size:19px; font-weight:700; color:var(--navy); letter-spacing:-.3px; margin-bottom:8px; }
.sidebar-intro { font-size:13px; color:var(--ink-3); line-height:1.6; margin-bottom:26px; }
.sidebar-features { display:flex; flex-direction:column; gap:16px; margin-bottom:24px; }
.sf-row { display:flex; align-items:flex-start; gap:12px; }
.sf-icon { width:32px; height:32px; background:#EFF6FF; border:1px solid #BFDBFE; border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--blue); flex-shrink:0; }
.sf-title { font-size:13px; font-weight:600; color:var(--navy); margin-bottom:2px; }
.sf-desc { font-size:11.5px; color:var(--ink-3); line-height:1.5; }
.sidebar-stat-row { display:flex; gap:10px; background:#F8FAFC; border:1px solid var(--border); border-radius:12px; padding:14px 16px; margin-bottom:20px; }
.sidebar-stat { flex:1; text-align:center; }
.stat-num { font-size:20px; font-weight:700; color:var(--navy); }
.stat-lbl { font-size:10px; color:var(--ink-4); font-weight:600; margin-top:1px; text-transform:uppercase; letter-spacing:.4px; }
.sidebar-quote { background:linear-gradient(135deg,#EFF6FF,#F0FDF4); border:1px solid #DBEAFE; border-left:3px solid var(--blue); border-radius:10px; padding:14px 15px; }
.sq-text { font-size:12px; color:var(--navy); line-height:1.65; font-style:italic; margin-bottom:8px; }
.sq-author { font-size:10.5px; color:var(--ink-4); font-weight:600; }

.cf-form-col {}
.cf-card { background:#fff; border:1px solid var(--border); border-radius:18px; padding:34px 34px 26px; box-shadow:0 4px 24px rgba(13,27,61,.09); }
.card-top-logo { display:flex; align-items:center; gap:9px; margin-bottom:22px; }
.ctl-name { font-size:16px; font-weight:700; letter-spacing:-.3px; }

.step-bar { display:flex; align-items:center; margin-bottom:20px; background:#F8FAFC; border:1px solid var(--border); border-radius:10px; padding:10px 16px; }
.step-item { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:500; color:var(--ink-4); flex:1; }
.step-item.active { color:var(--blue); }
.step-item.done { color:#10B981; }
.step-num { width:22px; height:22px; border-radius:50%; border:2px solid currentColor; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:700; flex-shrink:0; }
.step-item.active .step-num { background:var(--blue); border-color:var(--blue); color:white; }
.step-item.done .step-num { background:#10B981; border-color:#10B981; color:white; }
.step-line { flex:1; height:2px; background:var(--border); margin:0 10px; }
.step-lbl { white-space:nowrap; }

.card-heading { font-size:21px; font-weight:700; color:var(--navy); letter-spacing:-.3px; margin-bottom:5px; }
.card-sub { font-size:13px; color:var(--ink-3); margin-bottom:22px; line-height:1.5; }

.cf-form { display:flex; flex-direction:column; gap:13px; }
.cf-field { display:flex; flex-direction:column; gap:5px; }
.cf-field label { font-size:12.5px; font-weight:600; color:#374151; }
.opt-lbl { font-weight:400; color:var(--ink-4); }
.cf-input-wrap { position:relative; display:flex; align-items:center; }
.cf-input-wrap input { width:100%; padding:10px 40px 10px 38px; border:1.5px solid var(--border); border-radius:10px; font-family:'Poppins',sans-serif; font-size:13.5px; color:var(--navy); background:#FAFBFC; outline:none; transition:all .15s; }
.cf-input-wrap input:focus { border-color:var(--blue); background:#fff; box-shadow:0 0 0 3px rgba(37,99,235,.1); }
.cf-input-wrap input::placeholder { color:#C1C9D8; }
.cf-input-icon { position:absolute; left:12px; color:var(--ink-4); display:flex; align-items:center; pointer-events:none; z-index:1; }
.eye-btn { position:absolute; right:12px; background:none; border:none; color:var(--ink-4); display:flex; align-items:center; padding:0; transition:color .15s; z-index:1; }
.eye-btn:hover { color:var(--navy); }
.field-row-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.forgot-row { display:flex; justify-content:flex-end; margin-top:-4px; }
.recap-box { display:flex; flex-direction:column; gap:2px; background:#F0FDF4; border:1px solid #BBF7D0; border-radius:10px; padding:12px 14px; }
.recap-name { font-size:13.5px; font-weight:600; color:var(--navy); }
.recap-email { font-size:12px; color:var(--ink-3); }
.strength-wrap { display:flex; align-items:center; gap:8px; }
.strength-bars { display:flex; gap:4px; flex:1; }
.strength-bar { flex:1; height:4px; border-radius:4px; transition:background .3s; }
.strength-lbl { font-size:11.5px; font-weight:600; min-width:36px; }
.pass-rules { display:flex; flex-direction:column; gap:4px; padding:10px 12px; background:#F8FAFC; border:1px solid var(--border); border-radius:8px; }
.pass-rule { font-size:11.5px; color:var(--ink-4); display:flex; gap:7px; align-items:center; }
.pass-rule--ok { color:#10B981; }
.inline-warn { font-size:11.5px; color:#ef4444; }
.inline-ok { font-size:11.5px; color:#10B981; }
.msg-error,.msg-success { display:flex; align-items:flex-start; gap:10px; border-radius:10px; padding:11px 14px; font-size:12.5px; line-height:1.5; }
.msg-error { background:#FEF2F2; border:1px solid #FCA5A5; color:#B91C1C; }
.msg-success { background:#ECFDF5; border:1px solid #86EFAC; color:#065F46; }
.msg-icon { width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
.msg-icon--red { background:#EF4444; color:white; }
.msg-icon--green { background:#10B981; color:white; }
.cf-submit { display:flex; align-items:center; justify-content:center; gap:9px; padding:13px 20px; background:var(--blue); color:white; border:none; border-radius:10px; font-family:'Poppins',sans-serif; font-size:14px; font-weight:600; transition:all .15s; box-shadow:0 3px 12px rgba(37,99,235,.32); margin-top:4px; }
.cf-submit:hover:not(:disabled) { background:var(--blue-h); box-shadow:0 5px 18px rgba(37,99,235,.42); transform:translateY(-1px); }
.cf-submit:disabled { opacity:.6; cursor:not-allowed; transform:none; }
.cf-back { background:none; border:1.5px solid var(--border); border-radius:8px; padding:8px 14px; font-size:12.5px; color:var(--ink-3); transition:all .15s; text-align:center; }
.cf-back:hover { border-color:var(--blue); color:var(--blue); }
.spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:white; border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.card-divider { display:flex; align-items:center; gap:12px; margin:18px 0 14px; color:var(--ink-4); font-size:11.5px; }
.card-divider::before,.card-divider::after { content:''; flex:1; height:1px; background:var(--border); }
.card-switch { text-align:center; font-size:13px; color:var(--ink-3); }
.link-primary { background:none; border:none; color:var(--blue); font-weight:600; font-size:inherit; }
.link-primary:hover { color:var(--blue-h); text-decoration:underline; }
.link-sm { background:none; border:none; color:var(--blue); font-size:12px; font-weight:500; }
.link-sm:hover { color:var(--blue-h); text-decoration:underline; }
.sso-hint { display:flex; align-items:center; gap:6px; justify-content:center; margin-top:12px; font-size:11.5px; color:var(--ink-4); }
.trust-row { display:flex; gap:10px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
.trust-badge { display:flex; align-items:center; gap:5px; font-size:10.5px; color:var(--ink-4); background:white; border:1px solid var(--border); border-radius:20px; padding:5px 11px; }

.cf-footer { background:var(--navy); margin-top:auto; }
.cf-footer-top { max-width:1200px; margin:0 auto; padding:52px 32px 40px; display:grid; grid-template-columns:300px 1fr; gap:60px; }
.footer-logo { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
.footer-logo-name { font-size:20px; font-weight:800; letter-spacing:-.3px; }
.footer-brand-desc { font-size:12.5px; color:rgba(255,255,255,.45); line-height:1.7; }
.footer-links-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:24px; }
.footer-col { display:flex; flex-direction:column; gap:8px; }
.footer-col-title { font-size:10.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:rgba(255,255,255,.35); margin-bottom:4px; }
.footer-link { font-size:12.5px; color:rgba(255,255,255,.55); transition:color .15s; }
.footer-link:hover { color:white; }
.cf-footer-bar { border-top:1px solid rgba(255,255,255,.08); background:rgba(0,0,0,.2); }
.cf-footer-bar-inner { max-width:1200px; margin:0 auto; padding:14px 32px; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
.footer-features { display:flex; gap:22px; flex-wrap:wrap; }
.ff-item { display:flex; align-items:center; gap:6px; font-size:11.5px; color:rgba(255,255,255,.45); }
.footer-copy { font-size:11.5px; color:rgba(255,255,255,.3); }
.footer-copy-link { color:rgba(255,255,255,.45); }
.footer-copy-link:hover { color:white; }

@media(max-width:960px) {
  .cf-layout { grid-template-columns:1fr; }
  .cf-sidebar { display:none; }
  .cf-footer-top { grid-template-columns:1fr; gap:32px; }
  .footer-links-grid { grid-template-columns:repeat(2,1fr); }
  .cf-hero-h1 { font-size:26px; }
  .cf-header-inner { padding:0 20px; }
  .cf-main { padding:28px 20px 48px; }
}
@media(max-width:520px) {
  .field-row-2 { grid-template-columns:1fr; }
  .footer-links-grid { grid-template-columns:1fr 1fr; }
  .cf-footer-bar-inner { flex-direction:column; align-items:flex-start; gap:12px; }
  .cf-hero-band { padding:32px 20px 38px; }
  .cf-card { padding:24px 18px 20px; }
  .cf-hero-h1 { font-size:22px; }
}
`
