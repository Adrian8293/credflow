import { useEffect, useState } from 'react'
import { getQueueStatus, subscribeQueue, flushQueue, retryFailed, discardFailed } from '../../lib/offlineQueue'

/**
 * One bar across the top for connection and saving problems, mounted once in _app.js:
 *  - offline: red, says changes are kept on this device and will send by themselves
 *  - waiting changes (online): amber "Sending N changes…"
 *  - changes the server refused: red, with Review (list, Try again, Discard)
 *  - back online: green for a few seconds
 */
export function OfflineBanner() {
  const [net, setNet] = useState('online')            // online | offline | back
  const [q, setQ] = useState({ pending: 0, failed: 0, failedItems: [] })
  const [review, setReview] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    let t
    const down = () => { clearTimeout(t); setNet('offline') }
    const up = () => { setNet('back'); clearTimeout(t); t = setTimeout(() => setNet('online'), 4000) }
    if (!navigator.onLine) down()
    window.addEventListener('offline', down); window.addEventListener('online', up)
    setQ(getQueueStatus())
    const unsub = subscribeQueue(setQ)
    return () => { window.removeEventListener('offline', down); window.removeEventListener('online', up); clearTimeout(t); unsub() }
  }, [])

  const base = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000, padding: '12px 16px',
    paddingTop: 'calc(12px + env(safe-area-inset-top))', textAlign: 'center', fontSize: 17, fontWeight: 700, lineHeight: 1.35,
    color: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.25)',
  }
  const btn = { background: '#fff', color: '#111827', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginLeft: 10, minHeight: 40 }

  if (net === 'offline') {
    return (
      <div role="alert" style={{ ...base, background: '#B91C1C' }}>
        No internet connection.{' '}
        {q.pending > 0
          ? `${q.pending} change${q.pending === 1 ? ' is' : 's are'} saved on this device and will send by themselves when you reconnect.`
          : 'Changes you make are kept on this device and will send by themselves when you reconnect. Deleting needs a connection.'}
      </div>
    )
  }
  if (q.failed > 0) {
    return (
      <>
        <div role="alert" style={{ ...base, background: '#B91C1C' }}>
          {q.failed} change{q.failed === 1 ? '' : 's'} could not be saved.
          <button style={btn} onClick={() => setReview(true)}>Review</button>
        </div>
        {review && (
          <div role="dialog" aria-modal="true" aria-label="Changes that could not be saved"
            style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(17,24,39,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto', color: '#111827' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>Not saved</h2>
              <p style={{ fontSize: 16, color: '#475569', margin: '0 0 14px' }}>The server did not accept these changes. Try again, or discard them and re-enter the information.</p>
              {q.failedItems.map(i => (
                <div key={i.qid} style={{ border: '2px solid #FCA5A5', background: '#FEF2F2', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{i.label}</div>
                  <div style={{ fontSize: 15, color: '#B91C1C' }}>{i.error}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <button className="btn btn-primary" style={{ minHeight: 48, fontSize: 17 }} onClick={() => { retryFailed(); setReview(false) }}>Try again</button>
                <button className="btn btn-danger" style={{ minHeight: 48, fontSize: 17 }} onClick={() => { if (window.confirm('Discard these changes? They will be lost.')) { discardFailed(); setReview(false) } }}>Discard</button>
                <button className="btn btn-ghost" style={{ minHeight: 48, fontSize: 17 }} onClick={() => setReview(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }
  if (q.pending > 0) {
    return (
      <div role="status" style={{ ...base, background: '#B45309' }}>
        Sending {q.pending} saved change{q.pending === 1 ? '' : 's'}…
        <button style={btn} onClick={() => flushQueue()}>Send now</button>
      </div>
    )
  }
  if (net === 'back') return <div role="status" style={{ ...base, background: '#047857' }}>You are back online.</div>
  return null
}
