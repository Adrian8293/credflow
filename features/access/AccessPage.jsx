/**
 * AccessPage — who can sign in to this organization, with which role, and invite links.
 * Owner/admin only. Invites are one-time links: the person sets their own password.
 */
import { useCallback, useEffect, useState } from 'react'
import { fetchMembers, fetchInvites, setMemberRole, removeMember, revokeInvite } from '../../lib/db'
import { fmtDate } from '../../lib/helpers.js'

const ROLE_LABEL = {
  owner: 'Owner', admin: 'Admin', credentialer: 'Credentialer', viewer: 'Viewer',
  clinic_staff: 'Clinic staff', provider: 'Provider',
}
const ROLE_HELP = {
  owner: 'Full control, including other owners.',
  admin: 'Everything except changing owners. Can invite people.',
  credentialer: 'Does the credentialing work. Cannot manage access.',
  viewer: 'Read-only access to everything in the organization.',
  clinic_staff: 'Portal only: sees every provider’s status and expirations, and uploads documents for them.',
  provider: 'Portal only: sees their own applications and expirations, and uploads their own documents.',
}
const INVITE_ROLES = ['clinic_staff', 'provider', 'credentialer', 'viewer', 'admin']
const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 16 }

export function AccessPage({ db, toast, activeOrg }) {
  const isAdmin = activeOrg?.role === 'owner' || activeOrg?.role === 'admin'
  const isOwner = activeOrg?.role === 'owner'
  const providers = db.providers || []
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', role: 'provider', providerId: '' })
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(null) // { email, url }

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([fetchMembers(), fetchInvites()])
      setMembers(m); setInvites(i); setError('')
    } catch (e) {
      setError(/function|relation|does not exist/i.test(e.message || '')
        ? 'Access management needs supabase-migration-015-portal.sql. Run it in the Supabase SQL editor, then refresh.'
        : (e.message || 'Could not load access'))
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (isAdmin) load(); else setLoading(false) }, [isAdmin, load])

  const provName = id => { const p = providers.find(x => x.id === id); return p ? `${p.fname} ${p.lname}` : '' }

  async function invite(e) {
    e.preventDefault()
    setBusy(true); setLink(null)
    try {
      const r = await fetch('/api/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, role: form.role, providerId: form.role === 'provider' ? form.providerId : undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not create the invite')
      setLink({ email: form.email.trim().toLowerCase(), url: j.link })
      setForm(f => ({ ...f, email: '' }))
      load()
    } catch (err) { toast(err.message, 'error') }
    setBusy(false)
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Link copied', 'success') }
    catch { toast('Select the link and copy it manually', 'warn') }
  }

  async function changeRole(m, role) {
    try { await setMemberRole(m.user_id, role, null); toast('Role updated', 'success'); load() }
    catch (err) { toast(err.message, 'error') }
  }

  async function linkProvider(m, providerId) {
    try { await setMemberRole(m.user_id, 'provider', providerId); toast('Provider linked', 'success'); load() }
    catch (err) { toast(err.message, 'error') }
  }

  async function remove(m) {
    if (!window.confirm(`Remove ${m.email} from ${activeOrg?.name}? They will lose access immediately.`)) return
    try { await removeMember(m.user_id); toast('Removed', 'success'); load() }
    catch (err) { toast(err.message, 'error') }
  }

  async function revoke(i) {
    try { await revokeInvite(i.id); toast('Invite revoked', 'success'); load() }
    catch (err) { toast(err.message, 'error') }
  }

  if (!isAdmin) {
    return (
      <div className="page"><div className="empty-state">
        <div className="empty-state-title">Access is managed by owners and admins</div>
        <div className="empty-state-desc">Ask an owner or admin of {activeOrg?.name || 'this organization'} to add or change people.</div>
      </div></div>
    )
  }

  // Someone becomes a provider login through an invite that names the provider record.
  const roleOptions = isOwner ? ['owner', 'admin', 'credentialer', 'viewer', 'clinic_staff']
                              : ['admin', 'credentialer', 'viewer', 'clinic_staff']

  return (
    <div className="page">
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Access</h2>
        <p style={{ fontSize: 13, color: 'var(--text-4)' }}>
          People who can sign in to <b>{activeOrg?.name}</b>. Invite providers and clinic staff so they can upload documents and check their status.
        </p>
      </div>

      {error && <div style={{ ...card, color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* ── Invite ── */}
      <form onSubmit={invite} style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Invite someone</div>
        <div className="form-grid">
          <div className="fg"><label>Email</label>
            <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></div>
          <div className="fg"><label>Role</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {INVITE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
          {form.role === 'provider' && (
            <div className="fg full"><label>Which provider is this?</label>
              <select required value={form.providerId} onChange={e => setForm({ ...form, providerId: e.target.value })}>
                <option value="">Choose a provider…</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}{p.cred ? `, ${p.cred}` : ''}</option>)}
              </select></div>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-4)', margin: '8px 0 12px' }}>{ROLE_HELP[form.role]}</div>
        <button className="btn btn-primary" type="submit" disabled={busy || !form.email || (form.role === 'provider' && !form.providerId)}>
          {busy ? 'Creating…' : 'Create invite link'}</button>

        {link && (
          <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--elevated)' }}>
            <div style={{ fontSize: 12.5, marginBottom: 6 }}>
              Send this link to <b>{link.email}</b>. It works once, for 14 days. They choose their own password. It will not be shown again.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={link.url} onFocus={e => e.target.select()} style={{ flex: 1, fontSize: 12 }} aria-label="Invite link" />
              <button type="button" className="btn btn-secondary" onClick={() => copy(link.url)}>Copy</button>
            </div>
          </div>
        )}
      </form>

      {/* ── Pending invites ── */}
      {invites.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Pending invites</div>
          <div className="tbl-wrap"><table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead>
            <tbody>{invites.map(i => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{ROLE_LABEL[i.role]}{i.provider_id ? ` · ${provName(i.provider_id)}` : ''}</td>
                <td>{fmtDate(i.expires_at?.slice(0, 10))}</td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-sm btn-secondary" onClick={() => revoke(i)}>Revoke</button></td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}

      {/* ── Members ── */}
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>People with access</div>
      {loading ? <div className="text-muted">Loading…</div> : (
        <div className="tbl-wrap"><table className="data-table" style={{ width: '100%' }}>
          <thead><tr><th>Email</th><th>Role</th><th>Provider</th><th>Added</th><th /></tr></thead>
          <tbody>{members.map(m => {
            const locked = m.role === 'owner' && !isOwner
            return (
              <tr key={m.user_id}>
                <td>{m.email}</td>
                <td>
                  <select className="filter-select" value={m.role} disabled={locked || m.role === 'provider'}
                    onChange={e => changeRole(m, e.target.value)}>
                    {(roleOptions.includes(m.role) ? roleOptions : [m.role, ...roleOptions]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </td>
                <td>
                  {m.role === 'provider'
                    ? <select className="filter-select" value={m.provider_id || ''} onChange={e => e.target.value && linkProvider(m, e.target.value)}>
                        <option value="">Choose…</option>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
                      </select>
                    : <span style={{ color: 'var(--text-4)' }}>—</span>}
                </td>
                <td>{fmtDate(m.created_at?.slice(0, 10))}</td>
                <td style={{ textAlign: 'right' }}>{!locked && <button className="btn btn-sm btn-secondary" onClick={() => remove(m)}>Remove</button>}</td>
              </tr>)
          })}</tbody>
        </table></div>
      )}
    </div>
  )
}
