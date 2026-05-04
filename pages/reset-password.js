import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message) } else { setDone(true) }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>CredFlow — Reset Password</title>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight:'100vh', background:'#f8fbf8', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Geist', sans-serif", padding:'24px' }}>
        <div style={{ background:'#fff', border:'1px solid #e4ece4', borderRadius:'20px', padding:'40px', width:'100%', maxWidth:'380px', boxShadow:'0 4px 24px rgba(15,26,15,.08)' }}>
          <div style={{ fontFamily:"'Instrument Serif', serif", fontSize:'22px', marginBottom:'20px' }}>Set new password</div>
          {done ? (
            <div>
              <div style={{ background:'#e8f4ed', borderRadius:'8px', padding:'12px', color:'#1e6b3f', marginBottom:'16px' }}>Password updated successfully!</div>
              <a href="/login" style={{ color:'#1e6b3f', fontSize:'13px' }}>← Back to sign in</a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                <label style={{ fontSize:'12px', color:'#5a6e5a', fontWeight:'500' }}>New password</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required style={{ padding:'9px 12px', border:'1px solid #e4ece4', borderRadius:'8px', fontSize:'13px' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                <label style={{ fontSize:'12px', color:'#5a6e5a', fontWeight:'500' }}>Confirm password</label>
                <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={6} required style={{ padding:'9px 12px', border:'1px solid #e4ece4', borderRadius:'8px', fontSize:'13px' }} />
              </div>
              {error && <div style={{ background:'#fdf0f0', borderRadius:'8px', padding:'10px', color:'#c5383a', fontSize:'12.5px' }}>{error}</div>}
              <button type="submit" disabled={loading} style={{ padding:'10px', background:'#1e6b3f', color:'white', border:'none', borderRadius:'8px', fontSize:'13.5px', fontWeight:'500', cursor:'pointer' }}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
