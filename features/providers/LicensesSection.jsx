/**
 * LicensesSection — every state license a provider holds, with its own expiry.
 * The primary license lives on the provider record (edited with Edit Provider);
 * additional states are rows in provider_licenses (added/edited here).
 */
import { useState } from 'react'
import { daysUntil, fmtDate } from '../../lib/helpers.js'
import { allLicenses, licenseGaps } from '../../lib/licenses.js'
import { US_STATES, LICENSE_TYPES, LICENSE_STATUSES } from '../../constants/usStates.js'
import { DateInput } from '../../components/ui/DateInput.jsx'

const blank = (provId, state = '') => ({ id: null, provId, state, licenseType: '', number: '', expires: '', status: 'Active', notes: '' })

function expiryBadge(date) {
  const d = daysUntil(date)
  if (d === null) return null
  if (d < 0)   return <span className="badge b-red"   style={{ fontSize: 10 }}>Expired {Math.abs(d)}d ago</span>
  if (d <= 30) return <span className="badge b-red"   style={{ fontSize: 10 }}>{d}d left</span>
  if (d <= 90) return <span className="badge b-amber" style={{ fontSize: 10 }}>{d}d left</span>
  return <span className="badge b-green" style={{ fontSize: 10 }}>{d}d left</span>
}

export function LicensesSection({ prov, db, onEditPrimary, onSave, onDelete, canEdit = true }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const rows = allLicenses(db, prov)
  const gaps = licenseGaps(db).filter(g => g.prov.id === prov.id)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    const saved = await onSave?.(form)
    setSaving(false)
    if (saved) setForm(null)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-4)', flex: 1 }}>
          State Licenses
        </div>
        {canEdit && !form && (
          <button className="btn btn-sm btn-secondary" onClick={() => setForm(blank(prov.id))}>+ Add state license</button>
        )}
      </div>

      {gaps.map(g => (
        <div key={g.state} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--warning-bg, #fff8e6)', border: '1px solid var(--warning, #f5a524)', borderRadius: 'var(--r-md, 8px)', padding: '9px 12px', marginBottom: 10, fontSize: 12.5 }}>
          <span style={{ flex: 1 }}>
            Enrolled in <strong>{g.state}</strong> ({g.enrollments.length} enrollment{g.enrollments.length === 1 ? '' : 's'}) but no current {g.state} license is on file.
          </span>
          {canEdit && <button className="btn btn-sm btn-secondary" onClick={() => setForm(blank(prov.id, g.state))}>Add {g.state} license</button>}
        </div>
      ))}

      {rows.length === 0 && !form && (
        <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>No licenses on file yet.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((l, i) => (
          <div key={l.id || 'primary'} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--elevated)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '10px 14px', flexWrap: 'wrap' }}>
            <span className="badge b-blue" style={{ fontSize: 11, minWidth: 34, textAlign: 'center' }}>{l.state || '—'}</span>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                {[l.licenseType, l.number].filter(Boolean).join(' · ') || 'License'}
                {l.primary && <span className="badge b-gray" style={{ fontSize: 10, marginLeft: 8 }}>Primary</span>}
                {!l.primary && l.status !== 'Active' && <span className="badge b-gray" style={{ fontSize: 10, marginLeft: 8 }}>{l.status}</span>}
              </div>
              {!l.state && l.primary && <div style={{ fontSize: 11.5, color: 'var(--warning)' }}>Set the state for this license in Edit Provider</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-4)' }}>{l.expires ? `Exp ${fmtDate(l.expires)}` : 'No expiry'}</div>
            {l.status !== 'Inactive' && expiryBadge(l.expires)}
            {canEdit && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => l.primary ? onEditPrimary?.() : setForm({ ...l, provId: prov.id })}>Edit</button>
                {!l.primary && <button className="btn btn-sm btn-ghost" onClick={() => onDelete?.(l)}>Remove</button>}
              </div>
            )}
          </div>
        ))}
      </div>

      {form && (
        <form onSubmit={submit} style={{ marginTop: 12, background: 'var(--elevated)', border: '1.5px solid var(--pr)', borderRadius: 'var(--r-lg)', padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>{form.id ? 'Edit license' : 'Add state license'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div className="fg"><label>State</label>
              <select value={form.state} onChange={e => set('state', e.target.value)} required>
                <option value="">Select…</option>
                {US_STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="fg"><label>License type</label>
              <select value={form.licenseType} onChange={e => set('licenseType', e.target.value)}>
                <option value="">—</option>
                {LICENSE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg"><label>License number</label>
              <input value={form.number} onChange={e => set('number', e.target.value)} placeholder="e.g. C12345" />
            </div>
            <div className="fg"><label>Expiration date</label>
              <DateInput  value={form.expires} onChange={e => set('expires', e.target.value)} />
            </div>
            <div className="fg"><label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                {LICENSE_STATUSES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !form.state}>{saving ? 'Saving…' : 'Save license'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
