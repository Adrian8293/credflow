import { useEffect, useState, useCallback } from 'react'
import { fetchContacts, addContact, deleteContact } from '../../lib/db'
import { DateInput } from '../../components/ui/DateInput.jsx'

const METHODS = ['Phone', 'Email', 'Portal', 'Fax', 'Mail', 'Other']

function today() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const blank = () => ({ contactedAt: today(), method: 'Phone', contactName: '', referenceNo: '', summary: '', nextFollowup: '' })

/** Contact history for one enrollment. onFollowupSet lets the parent form mirror the new follow-up date. */
export function ContactLog({ enrollmentId, onFollowupSet, onChanged }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(blank())
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRows(await fetchContacts(enrollmentId)) }
    catch { setError('Contact log unavailable. Run supabase-migration-009-contact-log.sql in Supabase.') }
    setLoading(false)
  }, [enrollmentId])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.summary.trim() || saving) return
    setSaving(true); setError('')
    try {
      await addContact(enrollmentId, { ...form, summary: form.summary.trim() })
      if (form.nextFollowup) onFollowupSet?.(form.nextFollowup)
      setForm(blank())
      await load()
      onChanged?.()
    } catch { setError('Could not save the entry. Please try again.') }
    setSaving(false)
  }

  async function remove(id) {
    if (!window.confirm('Delete this log entry?')) return
    try { await deleteContact(id); await load() } catch { setError('Could not delete the entry.') }
  }

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div className="text-xs text-muted mb-8" style={{ fontWeight: 600, letterSpacing: '.6px', textTransform: 'uppercase' }}>
        Contact Log
      </div>

      <div className="form-grid" style={{ marginBottom: 8 }}>
        <div className="fg"><label>Date</label><DateInput  value={form.contactedAt} onChange={e => set('contactedAt', e.target.value)} /></div>
        <div className="fg"><label>Method</label>
          <select value={form.method} onChange={e => set('method', e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</select>
        </div>
        <div className="fg"><label>Spoke with</label><input value={form.contactName} onChange={e => set('contactName', e.target.value)} placeholder="Rep name (optional)" /></div>
        <div className="fg"><label>Reference #</label><input value={form.referenceNo} onChange={e => set('referenceNo', e.target.value)} placeholder="Call / ticket #" /></div>
        <div className="fg full"><label>What happened</label>
          <textarea value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="e.g. Payer confirmed application received; needs updated W-9. No patient information." />
        </div>
        <div className="fg"><label>Next follow-up</label><DateInput  value={form.nextFollowup} onChange={e => set('nextFollowup', e.target.value)} /></div>
        <div className="fg" style={{ alignSelf: 'end' }}>
          <button className="btn btn-primary" type="button" onClick={save} disabled={saving || !form.summary.trim()}>
            {saving ? 'Saving…' : 'Log contact'}
          </button>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
      {loading ? <div className="text-xs text-muted">Loading…</div> : rows.length === 0 && !error ? (
        <div className="text-xs text-muted">No contacts logged yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => (
            <li key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 12px', background: 'var(--card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
                <span><strong style={{ color: 'var(--text-1)' }}>{r.method}</strong> · {r.contacted_at}{r.contact_name ? ` · ${r.contact_name}` : ''}{r.reference_no ? ` · Ref ${r.reference_no}` : ''}</span>
                <button type="button" onClick={() => remove(r.id)} aria-label="Delete entry" style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.summary}</div>
              {r.next_followup && <div style={{ fontSize: 11.5, color: 'var(--amber)', marginTop: 4 }}>Follow up: {r.next_followup}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
