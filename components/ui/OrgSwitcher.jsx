/**
 * OrgSwitcher — shows the active organization and lets a user who belongs to several
 * (or who is an owner/admin) switch between them or add a new client group.
 * Hidden entirely when the login has one organization and cannot create more.
 */
import { useState, useRef, useEffect } from 'react'
import { useGlobalContext } from '../../context/AppContext'

export default function OrgSwitcher({ collapsed }) {
  const { orgs, activeOrg, switchOrg, createOrg } = useGlobalContext()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setAdding(false) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (collapsed || !activeOrg) return null
  const canCreate = orgs.some(o => o.role === 'owner' || o.role === 'admin')
  if (orgs.length < 2 && !canCreate) return null

  async function submitNew(e) {
    e.preventDefault()
    if (!name.trim()) return
    await createOrg(name.trim())
  }

  return (
    <div ref={ref} style={{ padding: '2px 10px 6px', position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch organization"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: 'var(--surface-2, #F4F5F9)', border: '1px solid var(--border, #E5E7EF)',
          borderRadius: 'var(--r)', padding: '7px 10px', cursor: 'pointer',
          fontFamily: 'var(--fn)', fontSize: 12.5, color: 'var(--text-1, #111827)',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{activeOrg.name}</span>
        <span aria-hidden style={{ fontSize: 10, opacity: .6 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', left: 10, right: 10, top: 'calc(100% - 2px)', zIndex: 50,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #E5E7EF)',
            borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(17,24,39,.12)', padding: 6,
          }}
        >
          {orgs.map(o => (
            <button
              key={o.org_id}
              role="option"
              aria-selected={o.is_active}
              type="button"
              onClick={() => (o.is_active ? setOpen(false) : switchOrg(o.org_id))}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8,
                background: o.is_active ? 'var(--pr-l, #EEF0FF)' : 'transparent', border: 'none',
                borderRadius: 6, padding: '7px 8px', cursor: 'pointer',
                fontFamily: 'var(--fn)', fontSize: 12.5, color: 'var(--text-1, #111827)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
              <span style={{ fontSize: 10.5, opacity: .6, textTransform: 'capitalize' }}>{o.role}</span>
            </button>
          ))}

          {canCreate && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{
                width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                borderTop: '1px solid var(--border, #E5E7EF)', marginTop: 4, padding: '8px 8px 4px',
                cursor: 'pointer', fontFamily: 'var(--fn)', fontSize: 12.5, color: 'var(--pr, #0B6B7A)', fontWeight: 600,
              }}
            >
              + New organization
            </button>
          )}

          {adding && (
            <form onSubmit={submitNew} style={{ borderTop: '1px solid var(--border, #E5E7EF)', marginTop: 4, paddingTop: 8 }}>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Group / owner name"
                aria-label="New organization name"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 8px', fontSize: 12.5,
                  border: '1px solid var(--border, #E5E7EF)', borderRadius: 6, fontFamily: 'var(--fn)',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="submit" disabled={!name.trim()} style={{
                  flex: 1, background: 'var(--pr, #0B6B7A)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '6px 8px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: name.trim() ? 1 : .5,
                }}>Create</button>
                <button type="button" onClick={() => { setAdding(false); setName('') }} style={{
                  background: 'transparent', border: '1px solid var(--border, #E5E7EF)', borderRadius: 6,
                  padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
