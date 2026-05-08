import { useState } from 'react'

export function NpiSyncModal({ data, onApply, onClose, saving }) {
  const { prov, diffs, card } = data
  const [selected, setSelected] = useState(() => new Set(diffs.map(d => d.field)))

  function toggle(field) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(field) ? next.delete(field) : next.add(field)
      return next
    })
  }

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <h3>↻ Sync from NPPES</h3>
            <div className="mh-sub">{prov.fname} {prov.lname} · NPI {prov.npi}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div style={{ background: 'var(--blue-l)', border: '1px solid var(--blue-b)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 12.5, color: 'var(--blue)', marginBottom: 12 }}>
            NPPES has newer data for <strong>{diffs.length} field{diffs.length !== 1 ? 's' : ''}</strong>. Check the ones you want to update, then click Apply.
          </div>


          <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(diffs.map(d => d.field)))}>Select all</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Deselect all</button>
          </div>

          {diffs.map(d => (
            <div
              key={d.field}
              onClick={() => toggle(d.field)}
              style={{
                display: 'grid', gridTemplateColumns: '20px 1fr', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer',
                background: selected.has(d.field) ? 'var(--primary-ll)' : 'var(--surface)',
                border: `1px solid ${selected.has(d.field) ? 'var(--primary)' : 'var(--border)'}`,
                transition: 'all .12s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 4, marginTop: 2, flexShrink: 0,
                background: selected.has(d.field) ? 'var(--primary)' : 'transparent',
                border: `1.5px solid ${selected.has(d.field) ? 'var(--primary)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontSize: 11, fontWeight: 700,
              }}>
                {selected.has(d.field) ? '✓' : ''}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 5 }}>
                  {d.label}
                  {d.isNew && <span className="badge b-green" style={{ fontSize: 10, marginLeft: 6 }}>New</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--red)', marginBottom: 2 }}>Current in CredFlow</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 4 }}>
                      {d.storedValue || <em style={{ opacity: 0.5 }}>empty</em>}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--green-d)', marginBottom: 2 }}>From NPPES</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', background: 'var(--green-ll, #f0fdf4)', padding: '4px 8px', borderRadius: 4, fontWeight: 500 }}>
                      {d.npiValue}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 12 }}>
            Fields not checked will be left unchanged. This action is logged in the audit trail.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={selected.size === 0 || saving}
            onClick={() => onApply([...selected])}
          >
            {saving ? 'Saving…' : `Apply ${selected.size} update${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
