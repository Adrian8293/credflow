// pages/review/[id].js
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../../lib/supabase'
import { providerFromDb } from '../../lib/mappers'
import OpcaReviewPanel from '../../components/OpcaReviewPanel'
import { addAudit } from '../../lib/db'

export default function ReviewPage() {
  const router = useRouter()
  const { id } = router.query
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('providers')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) { setError(error.message); setLoading(false); return }
        setProvider(providerFromDb(data))
        setLoading(false)
      })
  }, [id])

  async function handleSave(updated) {
    const { error } = await supabase
      .from('providers')
      .update({ opca_data: updated.opcaData })
      .eq('id', id)
    if (error) throw error
    setProvider(updated)
    await addAudit('OPCA', 'Updated', `${updated.fname} ${updated.lname} — OPCA data saved`, id)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0f14', color: '#8b90a8', fontFamily: 'system-ui', fontSize: 13 }}>
      Loading provider…
    </div>
  )

  if (error || !provider) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0f14', color: '#ff4f4f', fontFamily: 'system-ui', gap: 12 }}>
      <div style={{ fontSize: 13 }}>Provider not found or error loading.</div>
      <button onClick={() => router.push('/')} style={{ padding: '6px 14px', background: '#1a1e28', border: '1px solid #2a2f3d', borderRadius: 5, color: '#8b90a8', cursor: 'pointer', fontSize: 12 }}>
        ← Back to Dashboard
      </button>
    </div>
  )

  return (
    <>
      <Head>
        <title>{provider.fname} {provider.lname} — OPCA Review | CredFlow</title>
      </Head>
      <OpcaReviewPanel
        provider={provider}
        onSave={handleSave}
        onBack={() => router.push('/')}
      />
    </>
  )
}
