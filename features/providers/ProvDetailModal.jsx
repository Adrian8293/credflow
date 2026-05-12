import { Badge, ExpiryBadge, StageBadge } from '../../components/ui/Badge.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { useState } from 'react'
import { ProviderCommandCenter } from '../../components/WorkflowOverhaul'
import OpcaUploadPanel from '../../components/OpcaUploadPanel'

export function ProvDetailModal({ prov, db, onClose, editProvider, openEnrollModal, toast, syncFromNPPES }) {
  const [tab, setTab] = useState('profile')

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <div className="drawer" style={{ width: 920 }}>

        {/* ── Fixed header: title + close ── */}
        <div className="drawer-header" style={{ paddingBottom: 0, borderBottom: 'none' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--fn)', fontSize: 17, fontWeight: 600 }}>
              {prov.fname} {prov.lname}{prov.cred ? `, ${prov.cred}` : ''}
            </h3>
            <div className="mh-sub">{prov.spec} · {prov.status}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Sticky tab bar (below header, above scrolling body) ── */}
        <div style={{
          display: 'flex',
          borderBottom: '2px solid var(--border)',
          background: 'var(--surface)',
          flexShrink: 0,
          padding: '0 24px',
        }}>
          {[
            { id: 'profile', label: '👤 Profile' },
            { id: 'opca',    label: '📄 OPCA Form' },
          ].map(t => (
            <div
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '11px 18px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? 'var(--primary)' : 'var(--ink-4)',
                borderBottom: tab === t.id ? '3px solid var(--primary)' : '3px solid transparent',
                marginBottom: -2,
                transition: 'all 0.14s ease',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* ── Scrollable body ── */}
        <div className="drawer-body">
          {tab === 'profile' && (
            <ProviderCommandCenter
              prov={prov}
              db={db}
              onClose={onClose}
              onEdit={editProvider}
              openEnrollModal={openEnrollModal}
              toast={toast}
              onSync={syncFromNPPES}
            />
          )}
          {tab === 'opca' && (
            <OpcaUploadPanel
              provider={{ id: prov.id, fname: prov.fname, lname: prov.lname }}
              onComplete={() => toast('OPCA profile saved!', 'success')}
            />
          )}
        </div>

      </div>
    </>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════════════


// ─── KANBAN PIPELINE ───────────────────────────────────────────────────────────
