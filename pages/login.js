import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'reset'
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError('Check your email to confirm your account, then log in.')
        setMode('login')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setResetSent(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/'
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>CredFlow — Sign In</title>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={styles.bg}>
        <div style={styles.card}>
          <div style={styles.logoWrap}>
            <div style={styles.logoIcon}>✦</div>
            <div>
              <div style={styles.logoTitle}>CredFlow</div>
            </div>
          </div>

          <h2 style={styles.heading}>
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
          </h2>
          <p style={styles.subheading}>
            {mode === 'login' ? 'Sign in to your credentialing dashboard' :
             mode === 'signup' ? 'Set up your CredFlow account' :
             'Enter your email and we\'ll send a reset link'}
          </p>

          {resetSent ? (
            <div style={styles.successBox}>
              ✓ Password reset email sent! Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={styles.form}>
              <div style={styles.fg}>
                <label style={styles.label}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@yourpractice.com"
                  required
                  style={styles.input}
                />
              </div>
              {mode !== 'reset' && (
                <div style={styles.fg}>
                  <label style={styles.label}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    style={styles.input}
                  />
                </div>
              )}
              {error && <div style={styles.errorBox}>{error}</div>}
              <button type="submit" disabled={loading} style={styles.btn}>
                {loading ? '...' : mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div style={styles.links}>
            {mode === 'login' && <>
              <button style={styles.link} onClick={() => { setMode('signup'); setError('') }}>Create account</button>
              <span style={{ color: '#8fa08f' }}>·</span>
              <button style={styles.link} onClick={() => { setMode('reset'); setError('') }}>Forgot password?</button>
            </>}
            {mode !== 'login' && (
              <button style={styles.link} onClick={() => { setMode('login'); setError(''); setResetSent(false) }}>← Back to sign in</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

const styles = {
  bg: {
    minHeight: '100vh',
    background: '#f8fbf8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Geist', system-ui, sans-serif",
    padding: '24px',
  },
  card: {
    background: '#fff',
    border: '1px solid #e4ece4',
    borderRadius: '20px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 4px 24px rgba(15,26,15,.08)',
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px',
  },
  logoIcon: {
    width: '36px', height: '36px', background: '#1e6b3f', borderRadius: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', fontSize: '16px', flexShrink: 0,
  },
  logoTitle: {
    fontFamily: "'Instrument Serif', serif", fontSize: '18px', color: '#0f1a0f', lineHeight: 1.2,
  },
  heading: {
    fontFamily: "'Instrument Serif', serif", fontSize: '24px', color: '#0f1a0f',
    marginBottom: '6px', letterSpacing: '-0.3px',
  },
  subheading: { fontSize: '13px', color: '#5a6e5a', marginBottom: '24px' },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  fg: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontSize: '12px', fontWeight: '500', color: '#5a6e5a' },
  input: {
    padding: '9px 12px', border: '1px solid #e4ece4', borderRadius: '8px',
    fontFamily: "'Geist', sans-serif", fontSize: '13px', color: '#0f1a0f',
    background: '#fff', outline: 'none', transition: 'border-color 0.18s',
  },
  btn: {
    padding: '10px 16px', background: '#1e6b3f', color: 'white',
    border: 'none', borderRadius: '8px', fontFamily: "'Geist', sans-serif",
    fontSize: '13.5px', fontWeight: '500', cursor: 'pointer', marginTop: '4px',
    transition: 'background 0.18s',
  },
  errorBox: {
    background: '#fdf0f0', border: '1px solid #f0c8c8', borderRadius: '8px',
    padding: '10px 12px', fontSize: '12.5px', color: '#c5383a',
  },
  successBox: {
    background: '#e8f4ed', border: '1px solid #b8dfc7', borderRadius: '8px',
    padding: '12px 14px', fontSize: '13px', color: '#1e6b3f', marginTop: '8px',
  },
  links: {
    display: 'flex', gap: '12px', justifyContent: 'center',
    marginTop: '18px', flexWrap: 'wrap',
  },
  link: {
    background: 'none', border: 'none', color: '#1e6b3f', fontSize: '12.5px',
    cursor: 'pointer', fontFamily: "'Geist', sans-serif",
  },
}
