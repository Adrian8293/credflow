/**
 * WorkflowOverhaul.jsx — CredFlow Workflow-Driven UI Components
 *
 * Implements the "what do I do next?" philosophy from CredentialIQ_WorkflowOverhaul.jsx:
 *  - NextActionBanner: surfaces the single most urgent task at the top of Dashboard
 *  - ReadinessRing: circular score indicator for Provider Command Center header
 *  - ProviderReadinessBar: inline readiness bar on every provider list card
 *  - EnrollmentStageBar: progress bar + SLA badge on every enrollment card
 *  - SLABadge: on-track / at-risk / over indicator
 *  - WorkflowDashboard: replaces the old Dashboard with action-led layout
 *  - WorkflowProviderCard: enhanced provider card with inline readiness bar
 *  - WorkflowProviderDetail: Command Center replacing old provider detail tabs
 *  - WorkflowTasks: priority-filtered task view with animated completion
 *  - WorkflowDocuments: action-grouped document view (expired/critical/notice)
 *  - WorkflowKanban: drag-drop kanban (uses existing EnrollmentKanban underneath)
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/router'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const TODAY = new Date()

export function daysUntilWF(d) {
  if (!d) return null
  return Math.ceil((new Date(d) - TODAY) / 86400000)
}

export function fmtDateWF(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

export function providerReadiness(prov) {
  let score = 100
  if (!prov.npi) score -= 20
  const licD = daysUntilWF(prov.licenseExp)
  if (licD === null || licD < 0) score -= 25
  else if (licD <= 30) score -= 10
  const malD = daysUntilWF(prov.malExp)
  if (malD === null || malD < 0) score -= 25
  else if (malD <= 30) score -= 10
  const caqhD = daysUntilWF(prov.caqhDue)
  if (caqhD === null || caqhD < 0) score -= 15
  return Math.max(0, score)
}

// ─── STAGE CONFIG ──────────────────────────────────────────────────────────────

const STAGES_WF = [
  { id: 'Not Started', progress: 0, color: '#6b7280' },
  { id: 'Application Submitted', progress: 20, color: '#3b82f6' },
  { id: 'Awaiting CAQH', progress: 35, color: '#8b5cf6' },
  { id: 'Pending Verification', progress: 50, color: '#f59e0b' },
  { id: 'Additional Info Requested', progress: 55, color: '#ef4444' },
  { id: 'Under Review', progress: 70, color: '#06b6d4' },
  { id: 'Approved – Awaiting Contract', progress: 85, color: '#10b981' },
  { id: 'Contracted – Pending Effective Date', progress: 92, color: '#22c55e' },
  { id: 'Active', progress: 100, color: '#16a34a' },
  { id: 'Denied', progress: 0, color: '#9ca3af' },
]

export function stageProgress(s) {
  return STAGES_WF.find(x => x.id === s)?.progress ?? 0
}
export function stageColor(s) {
  return STAGES_WF.find(x => x.id === s)?.color ?? '#6b7280'
}

// ─── READINESS RING ────────────────────────────────────────────────────────────

export function ReadinessRing({ score, size = 72 }) {
  const r = (size / 2) - 6
  const circ = 2 * Math.PI * r
  const fill = circ * (score / 100)
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  const cx = size / 2
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)', textAlign: 'center', lineHeight: 1
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{score}%</div>
        <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 2 }}>Ready</div>
      </div>
    </div>
  )
}

// ─── SLA BADGE ────────────────────────────────────────────────────────────────

export function SLABadge({ submitted, slaTarget = 90 }) {
  if (!submitted) return null
  const elapsed = Math.floor((TODAY - new Date(submitted)) / 86400000)
  const pct = (elapsed / slaTarget) * 100
  if (pct >= 100) return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
      🔴 {elapsed - slaTarget}d over SLA
    </span>
  )
  if (pct >= 75) return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' }}>
      🟡 At risk · {slaTarget - elapsed}d left
    </span>
  )
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7' }}>
      ✓ On track · {slaTarget - elapsed}d left
    </span>
  )
}

// ─── ENROLLMENT STAGE BAR ─────────────────────────────────────────────────────

export function EnrollmentStageBar({ stage, submitted, slaTarget, notes, onAction }) {
  const progress = stageProgress(stage)
  const color = stageColor(stage)
  const needsAction = stage === 'Additional Info Requested'
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 }}>
        <span style={{ color: '#94a3b8' }}>Submitted {fmtDateWF(submitted)}</span>
        <SLABadge submitted={submitted} slaTarget={slaTarget} />
      </div>
      {needsAction && (
        <div style={{
          marginTop: 8, background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
          borderRadius: 8, padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 10, color: 'white'
        }}>
          <span style={{ fontSize: 13 }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 11.5, marginBottom: 1 }}>
              Action: {notes || 'Submit requested information'}
            </div>
          </div>
          <button onClick={onAction} style={{
            background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
          }}>
            Upload doc →
          </button>
        </div>
      )}
    </div>
  )
}

// ─── NEXT ACTION BANNER ───────────────────────────────────────────────────────

export function NextActionBanner({ task, provName, onViewAll }) {
  if (!task) return null
  const d = daysUntilWF(task.due)
  const dueText = d < 0
    ? `${Math.abs(d)} days overdue`
    : d === 0 ? 'due today'
    : `due in ${d} days`

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
      borderRadius: 12, padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      marginBottom: 20, color: 'white'
    }}>
      <div style={{ fontSize: 20, flexShrink: 0 }}>🎯</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Your next action: {task.task}</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {provName ? `${provName} · ` : ''}{dueText}
        </div>
      </div>
      <button onClick={onViewAll} style={{
        background: 'rgba(255,255,255,0.15)', color: 'white',
        border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8,
        padding: '7px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'inherit', transition: 'background .14s', whiteSpace: 'nowrap'
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
      >
        View all tasks →
      </button>
    </div>
  )
}

// ─── PROVIDER READINESS BAR ───────────────────────────────────────────────────

export function ProviderReadinessBar({ prov }) {
  const score = providerReadiness(prov)
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Credentialing Readiness
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{score}%</span>
      </div>
      <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', width: 260 }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

// ─── WORKFLOW DASHBOARD ────────────────────────────────────────────────────────
// Replaces the old Dashboard with action-led layout

export function WorkflowDashboard({ db, setPage, openEnrollModal }) {
  const alertDays = db.settings?.alertDays || 90

  // Priority tasks: overdue or urgent
  const urgentTasks = db.tasks.filter(t =>
    t.status !== 'Done' && (t.priority === 'Urgent' || daysUntilWF(t.due) <= 0)
  ).sort((a, b) => (daysUntilWF(a.due) ?? 99) - (daysUntilWF(b.due) ?? 99))

  const overdueTasks = db.tasks.filter(t => t.status !== 'Done' && daysUntilWF(t.due) < 0)
  const pendingEnr = db.enrollments.filter(e => !['Active', 'Denied'].includes(e.stage))
  const overdueEnr = pendingEnr.filter(e =>
    e.submitted && (TODAY - new Date(e.submitted)) / 86400000 > (e.slaTarget || 90)
  )

  // Top task
  const topTask = urgentTasks[0]
  const topProv = topTask ? db.providers.find(p => p.id === topTask.provId) : null
  const topProvName = topProv ? `${topProv.fname} ${topProv.lname}` : ''

  // Expiring credentials
  const expiringProvs = db.providers.filter(p => {
    const l = daysUntilWF(p.licenseExp), m = daysUntilWF(p.malExp), c = daysUntilWF(p.caqhDue)
    return (l !== null && l <= 60) || (m !== null && m <= 60) || (c !== null && c <= 14)
  })

  // KPI values
  const activeEnr = db.enrollments.filter(e => e.stage === 'Active').length

  function pNameShort(id) {
    const p = db.providers.find(x => x.id === id)
    return p ? `${p.fname} ${p.lname}` : '—'
  }
  function payName(id) {
    const p = db.payers.find(x => x.id === id)
    return p ? p.name : '—'
  }

  return (
    <div style={{ animation: 'pageIn .2s ease' }}>
      {/* NEXT ACTION BANNER */}
      <NextActionBanner
        task={topTask}
        provName={topProvName}
        onViewAll={() => setPage('workflows')}
      />

      {/* CLICKABLE KPI GRID */}
      <div className="kpi-grid">
        <div className="kpi kpi-red" style={{ cursor: 'pointer' }} onClick={() => setPage('workflows')}>
          <div className="kpi-label">Urgent Tasks</div>
          <div className="kpi-value">{urgentTasks.length}</div>
          <div className="kpi-sub">{overdueTasks.length} overdue</div>
        </div>
        <div className="kpi kpi-amber" style={{ cursor: 'pointer' }} onClick={() => setPage('providers')}>
          <div className="kpi-label">Expiring Credentials</div>
          <div className="kpi-value">{expiringProvs.length}</div>
          <div className="kpi-sub">Providers need attention</div>
        </div>
        <div className="kpi" style={{ cursor: 'pointer' }} onClick={() => setPage('pipeline')}>
          <div className="kpi-label">Pending Enrollments</div>
          <div className="kpi-value">{pendingEnr.length}</div>
          <div className="kpi-sub">{overdueEnr.length} over SLA</div>
        </div>
        <div className="kpi kpi-teal" style={{ cursor: 'pointer' }} onClick={() => setPage('enrollments')}>
          <div className="kpi-label">Active Panels</div>
          <div className="kpi-value">{activeEnr}</div>
          <div className="kpi-sub">across {db.providers.length} providers</div>
        </div>
      </div>

      <div className="grid-2">
        {/* NEEDS ACTION TODAY */}
        <div>
          <div className="card">
            <div className="card-header">
              <h3>🔥 Needs Action Today</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage('workflows')}>All tasks →</button>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              {urgentTasks.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <p>All clear — no urgent tasks!</p>
                </div>
              ) : urgentTasks.slice(0, 5).map(t => {
                const d = daysUntilWF(t.due)
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 8,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${t.priority === 'Urgent' ? 'var(--red)' : 'var(--amber-d)'}`,
                    marginBottom: 7
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{t.cat} · {pNameShort(t.provId)}</div>
                    </div>
                    <span className={`badge ${d < 0 ? 'b-red' : d <= 2 ? 'b-red' : 'b-amber'}`}>
                      {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? 'Today' : `${d}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div>
          {/* STALLED ENROLLMENTS */}
          <div className="card mb-16">
            <div className="card-header">
              <h3>⏱ Stalled Enrollments</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage('pipeline')}>Kanban →</button>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              {overdueEnr.length === 0 ? (
                <div style={{ color: 'var(--ink-4)', fontSize: 13, padding: '8px 0' }}>All enrollments within SLA.</div>
              ) : overdueEnr.slice(0, 4).map(e => {
                const elapsed = Math.floor((TODAY - new Date(e.submitted)) / 86400000)
                return (
                  <div key={e.id} className="alert-item al-red mb-16">
                    <div className="al-body">
                      <div className="al-title">{pNameShort(e.provId)} × {payName(e.payId)}</div>
                      <div className="al-sub">{e.stage} · {elapsed}d elapsed (SLA: {e.slaTarget || 90}d)</div>
                    </div>
                    <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                      <button className="btn btn-xs btn-danger btn-sm" onClick={() => openEnrollModal(e.id)}>
                        Follow up
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* EXPIRING CREDENTIALS */}
          <div className="card">
            <div className="card-header">
              <h3>⚠ Expiring Soon</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage('alerts')}>View all →</button>
            </div>
            <div className="card-body" style={{ paddingTop: 12 }}>
              {expiringProvs.slice(0, 4).map(p => {
                const licD = daysUntilWF(p.licenseExp)
                const malD = daysUntilWF(p.malExp)
                const caqhD = daysUntilWF(p.caqhDue)
                return (
                  <div key={p.id} className="alert-item al-amber mb-16" style={{ cursor: 'pointer' }}>
                    <div className="al-body">
                      <div className="al-title">{p.fname} {p.lname}, {p.cred}</div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                        {licD !== null && licD <= 60 && (
                          <span className={`badge ${licD < 0 ? 'b-red' : licD <= 14 ? 'b-red' : 'b-amber'}`}>
                            License {licD < 0 ? `exp ${Math.abs(licD)}d ago` : `${licD}d`}
                          </span>
                        )}
                        {malD !== null && malD <= 60 && (
                          <span className={`badge ${malD < 0 ? 'b-red' : malD <= 14 ? 'b-red' : 'b-amber'}`}>
                            Malpractice {malD < 0 ? `exp ${Math.abs(malD)}d ago` : `${malD}d`}
                          </span>
                        )}
                        {caqhD !== null && caqhD <= 14 && (
                          <span className={`badge ${caqhD < 0 ? 'b-red' : 'b-amber'}`}>
                            CAQH {caqhD < 0 ? `overdue ${Math.abs(caqhD)}d` : `${caqhD}d`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WORKFLOW PROVIDER CARD ───────────────────────────────────────────────────
// Enhanced provider card with inline readiness bar, used in ProvidersPage

export function WorkflowProviderCard({ prov, db, onOpen, onEdit, onEnroll, onTask, onSync }) {
  const score = providerReadiness(prov)
  const licD = daysUntilWF(prov.licenseExp)
  const malD = daysUntilWF(prov.malExp)
  const caqhD = daysUntilWF(prov.caqhDue)
  const urgent = (licD !== null && licD <= 30) || (malD !== null && malD <= 30) || (caqhD !== null && caqhD <= 0)
  const activeP = db.enrollments.filter(e => e.provId === prov.id && e.stage === 'Active').length
  const totalP = db.enrollments.filter(e => e.provId === prov.id).length
  const router = useRouter()

  const SPEC_COLORS = {
    'Mental Health': '#3563c9', 'Massage Therapy': '#1a8a7a',
    'Naturopathic': '#6d3fb5', 'Chiropractic': '#c97d1e', 'Acupuncture': '#b8292e'
  }

  function initials(p) { return ((p.fname || '')[0] || '') + ((p.lname || '')[0] || '') }

  return (
    <div className="prov-card" onClick={() => onOpen(prov.id)}>
      <div className="prov-avatar" style={{ background: SPEC_COLORS[prov.spec] || '#4f7ef8' }}>
        {prov.avatarUrl
          ? <img src={prov.avatarUrl} alt={prov.fname} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
            onError={e => { e.target.style.display = 'none' }} />
          : initials(prov)
        }
      </div>
      <div>
        <div className="prov-name">{prov.fname} {prov.lname}</div>
        <div className="prov-title">{prov.cred}{prov.focus ? ' · ' + prov.focus : ''}</div>
        <div className="prov-chips">
          <span className={`badge ${prov.status === 'Active' ? 'b-green' : prov.status === 'Pending' ? 'b-amber' : 'b-gray'} badge-dot`}>
            {prov.status}
          </span>
          <span className="badge b-gray">{prov.spec}</span>
          {prov.npi && <span className="info-chip">NPI: {prov.npi}</span>}
          {activeP > 0 && <span className="badge b-teal">{activeP}/{totalP} panels</span>}
          {urgent && <span className="badge b-red">⚠ Action needed</span>}
        </div>
        <ProviderReadinessBar prov={prov} />
      </div>
      <div className="prov-actions" onClick={e => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" onClick={() => onOpen(prov.id)}>View Profile</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(prov.id)}>Edit</button>
        <button
          className="btn btn-ghost btn-sm"
          title="Open OPCA Review — validate and prepare credentialing application"
          onClick={() => router.push(`/review/${prov.id}`)}
          style={{ color: '#4f7cff', fontWeight: 500 }}
        >
          📋 OPCA
        </button>
        {onEnroll && (
          <button className="btn btn-ghost btn-sm" onClick={() => onEnroll(null, prov.id)}>+ Enroll</button>
        )}
        {onSync && prov.npi && (
          <button
            className="btn btn-ghost btn-sm"
            title="Sync latest data from NPPES NPI Registry"
            onClick={() => onSync(prov.id)}
            style={{ color: 'var(--primary)', fontWeight: 500 }}
          >
            ↻ Sync NPPES
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PROVIDER COMMAND CENTER ─────────────────────────────────────────────────
// Shown inside the ProvDetailModal — replaces the old profile tabs layout
// with: alerts strip at top → readiness ring → inline enrollment actions

export function ProviderCommandCenter({ prov, db, onClose, onEdit, openEnrollModal, toast, onSync }) {
  const [tab, setTab] = useState('overview')

  const enrollments = db.enrollments.filter(e => e.provId === prov.id)
  const tasks = db.tasks.filter(t => t.provId === prov.id && t.status !== 'Done')

  function payName(id) {
    const p = db.payers.find(x => x.id === id)
    return p ? p.name : '—'
  }

  const score = providerReadiness(prov)

  // Build alerts
  const alerts = []
  if (daysUntilWF(prov.licenseExp) !== null && daysUntilWF(prov.licenseExp) < 0)
    alerts.push({ label: 'State License EXPIRED', sev: 'error' })
  else if (daysUntilWF(prov.licenseExp) !== null && daysUntilWF(prov.licenseExp) <= 30)
    alerts.push({ label: `License expires in ${daysUntilWF(prov.licenseExp)}d`, sev: 'warn' })

  if (daysUntilWF(prov.malExp) !== null && daysUntilWF(prov.malExp) < 0)
    alerts.push({ label: 'Malpractice Insurance EXPIRED', sev: 'error' })
  else if (daysUntilWF(prov.malExp) !== null && daysUntilWF(prov.malExp) <= 30)
    alerts.push({ label: `Malpractice expires in ${daysUntilWF(prov.malExp)}d`, sev: 'warn' })

  if (daysUntilWF(prov.caqhDue) !== null && daysUntilWF(prov.caqhDue) < 0)
    alerts.push({ label: `CAQH attestation overdue (${Math.abs(daysUntilWF(prov.caqhDue))}d)`, sev: 'error' })

  const STAGE_BADGE = {
    'Not Started': 'b-gray', 'Application Submitted': 'b-blue',
    'Awaiting CAQH': 'b-purple', 'Pending Verification': 'b-amber',
    'Additional Info Requested': 'b-red', 'Under Review': 'b-teal',
    'Approved – Awaiting Contract': 'b-green',
    'Contracted – Pending Effective Date': 'b-green',
    'Active': 'b-green', 'Denied': 'b-gray',
  }

  function initials(p) { return ((p.fname || '')[0] || '') + ((p.lname || '')[0] || '') }
  const SPEC_COLORS = {
    'Mental Health': '#3563c9', 'Massage Therapy': '#1a8a7a',
    'Naturopathic': '#6d3fb5', 'Chiropractic': '#c97d1e', 'Acupuncture': '#b8292e'
  }

  return (
    <>
      {/* COMMAND CENTER HEADER */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '20px 22px', marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{
          width: 58, height: 58, borderRadius: 14, flexShrink: 0,
          background: SPEC_COLORS[prov.spec] || '#4f7ef8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, color: 'white', overflow: 'hidden'
        }}>
          {prov.avatarUrl
            ? <img src={prov.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials(prov)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.3px', marginBottom: 3 }}>
            {prov.fname} {prov.lname}, {prov.cred}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 4 }}>
            {prov.spec}{prov.taxonomyDesc ? ' · ' + prov.taxonomyDesc : prov.focus ? ' · ' + prov.focus : ''}
          </div>
          {prov.taxonomyCode && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 7 }}>
              <span style={{ fontFamily: 'monospace' }}>{prov.taxonomyCode}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={`badge ${prov.status === 'Active' ? 'b-green' : 'b-gray'}`}>{prov.status}</span>
            {prov.npi && <span className="info-chip">NPI {prov.npi}</span>}
            {prov.caqh && <span className="info-chip">CAQH {prov.caqh}</span>}
            {prov.ptan && <span className="info-chip">PTAN {prov.ptan}</span>}
            <span className="badge b-teal">{enrollments.filter(e => e.stage === 'Active').length} active panels</span>
            {tasks.length > 0 && <span className="badge b-red">{tasks.length} open tasks</span>}
          </div>
        </div>
        <ReadinessRing score={score} size={72} />
        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal(null, prov.id)}>+ Enrollment</button>
          <button className="btn btn-secondary btn-sm" onClick={() => onEdit(prov.id)}>Edit Provider</button>
          {onSync && prov.npi && (
            <button
              className="btn btn-ghost btn-sm"
              title={`Sync latest NPPES data for NPI ${prov.npi}`}
              onClick={() => onSync(prov.id)}
              style={{ color: 'var(--primary)', fontWeight: 500 }}
            >
              ↻ Sync NPPES
            </button>
          )}
        </div>
      </div>

      {/* ALERTS STRIP */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          {alerts.map((a, i) => (
            <div key={i} className={`alert-item ${a.sev === 'error' ? 'al-red' : 'al-amber'} mb-16`}>
              <div className="al-icon">{a.sev === 'error' ? '⛔' : '⚠️'}</div>
              <div className="al-body"><div className="al-title">{a.label}</div></div>
              <div style={{ flexShrink: 0, alignSelf: 'center' }}>
                <button
                  className="btn btn-xs"
                  style={{
                    background: a.sev === 'error' ? '#fee2e2' : '#fef3c7',
                    color: a.sev === 'error' ? '#dc2626' : '#d97706',
                    border: `1px solid ${a.sev === 'error' ? '#fca5a5' : '#fcd34d'}`,
                    cursor: 'pointer'
                  }}
                  onClick={() => toast && toast('Upload document modal would open', 'success')}
                >
                  Upload new →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TABS */}
      <div className="tabs">
        {[
          ['overview', 'Overview'],
          ['enrollments', `Enrollments (${enrollments.length})`],
          ['tasks', `Tasks (${tasks.length})`],
          ['credentials', 'Credentials'],
        ].map(([k, l]) => (
          <div key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</div>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="grid-2">
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
              Active Enrollments
            </div>
            {enrollments.filter(e => e.stage === 'Active').map(e => (
              <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{payName(e.payId)}</div>
                  <span className={`badge ${STAGE_BADGE[e.stage]}`}>{e.stage}</span>
                </div>
                <EnrollmentStageBar stage={e.stage} submitted={e.submitted} slaTarget={e.slaTarget} />
              </div>
            ))}

            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-4)', margin: '14px 0 10px' }}>
              In Progress
            </div>
            {enrollments.filter(e => !['Active', 'Denied'].includes(e.stage)).map(e => (
              <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '13px 15px', marginBottom: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{payName(e.payId)}</div>
                  <span className={`badge ${STAGE_BADGE[e.stage]}`}>{e.stage}</span>
                </div>
                <EnrollmentStageBar
                  stage={e.stage}
                  submitted={e.submitted}
                  slaTarget={e.slaTarget}
                  notes={e.notes}
                  onAction={() => toast && toast('Document upload modal would open', 'success')}
                />
                {/* Inline action row */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-2)' }}>
                  <button className="btn btn-xs btn-secondary" onClick={() => openEnrollModal(e.id)}>Change stage</button>
                  <button className="btn btn-xs btn-ghost" onClick={() => toast && toast('Task modal would open', 'success')}>+ Task</button>
                  <button className="btn btn-xs btn-ghost" onClick={() => toast && toast('Notes modal would open', 'success')}>Edit notes</button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
              Open Tasks
            </div>
            {tasks.length === 0 ? (
              <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>No open tasks for this provider.</div>
            ) : tasks.map(t => {
              const d = daysUntilWF(t.due)
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 13px', borderRadius: 8, background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${t.priority === 'Urgent' ? 'var(--red)' : t.priority === 'High' ? 'var(--amber-d)' : 'var(--primary)'}`,
                  marginBottom: 7
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.task}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{t.cat} · {t.priority}</div>
                  </div>
                  <span className={`badge ${d < 0 ? 'b-red' : d <= 3 ? 'b-red' : d <= 7 ? 'b-amber' : 'b-gray'}`}>
                    {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? 'Today' : `${d}d`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ENROLLMENTS TAB */}
      {tab === 'enrollments' && (
        <div>
          {enrollments.map(e => (
            <div key={e.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, flex: 1 }}>{payName(e.payId)}</div>
                <span className={`badge ${STAGE_BADGE[e.stage]}`}>{e.stage}</span>
                <SLABadge submitted={e.submitted} slaTarget={e.slaTarget} />
              </div>
              <EnrollmentStageBar
                stage={e.stage}
                submitted={e.submitted}
                slaTarget={e.slaTarget}
                notes={e.notes}
                onAction={() => toast && toast('Document upload modal would open', 'success')}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-2)' }}>
                <button className="btn btn-xs btn-secondary" onClick={() => openEnrollModal(e.id)}>Change stage</button>
                <button className="btn btn-xs btn-ghost" onClick={() => toast && toast('Task modal would open', 'success')}>+ Task</button>
                <button className="btn btn-xs btn-ghost" onClick={() => toast && toast('Notes modal would open', 'success')}>Edit notes</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREDENTIALS TAB */}
      {tab === 'credentials' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── SECTION 1: Licenses & Expiry Dates ── */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-4)', marginBottom: 10 }}>
              Licenses &amp; Expiry Dates
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              {[
                ['NPI Number',           prov.npi,        null],
                ['State License #',      prov.license,    null],
                ['License Expiry',       prov.licenseExp ? fmtDateWF(prov.licenseExp) : null, prov.licenseExp],
                ['Malpractice Carrier',  prov.malCarrier, null],
                ['Malpractice Policy #', prov.malPolicy,  null],
                ['Malpractice Expiry',   prov.malExp ? fmtDateWF(prov.malExp) : null, prov.malExp],
                ['DEA #',                prov.dea,        null],
                ['DEA Expiry',           prov.deaExp ? fmtDateWF(prov.deaExp) : null, prov.deaExp],
                ['Recredentialing Due',  prov.recred ? fmtDateWF(prov.recred) : null, prov.recred],
              ].filter(([, val]) => val).map(([label, val, expDate]) => {
                const d = expDate ? daysUntilWF(expDate) : null
                const badgeCls = d === null ? null : d < 0 ? 'b-red' : d <= 30 ? 'b-red' : d <= 90 ? 'b-amber' : 'b-green'
                return (
                  <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 13px' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', marginBottom: badgeCls ? 5 : 0, fontFamily: label.includes('#') || label === 'NPI Number' ? 'monospace' : 'inherit' }}>{val || '—'}</div>
                    {badgeCls && d !== null && (
                      <span className={`badge ${badgeCls}`}>{d < 0 ? `Expired ${Math.abs(d)}d ago` : `${d}d left`}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── SECTION 2: IDs & Identifiers ── */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-4)', marginBottom: 10 }}>
              IDs &amp; Identifiers
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              {[
                ['CAQH ID',         prov.caqh],
                ['CAQH Attestation Due', prov.caqhDue ? fmtDateWF(prov.caqhDue) : null],
                ['Medicaid / DMAP ID',   prov.medicaid],
                ['Medicare PTAN',        prov.ptan],
                ['Supervisor',           prov.supervisor],
              ].filter(([, val]) => val).map(([label, val]) => (
                <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 13px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', fontFamily: ['CAQH ID','Medicaid / DMAP ID','Medicare PTAN'].includes(label) ? 'monospace' : 'inherit' }}>{val}</div>
                </div>
              ))}
            </div>
            {!prov.caqh && !prov.medicaid && !prov.ptan && (
              <div style={{ fontSize: 12.5, color: 'var(--ink-4)', padding: '10px 0' }}>
                No IDs on file — add CAQH, Medicaid, or PTAN via Edit Provider or sync from NPPES.
              </div>
            )}
          </div>

          {/* ── SECTION 3: NPPES Taxonomy ── */}
          {(prov.taxonomyDesc || prov.taxonomyCode || prov.focus) && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--ink-4)', marginBottom: 10 }}>
                NPPES Taxonomy
              </div>
              <div className="grid-2" style={{ gap: 10 }}>
                {[
                  ['Taxonomy Code', prov.taxonomyCode],
                  ['Taxonomy Description', prov.taxonomyDesc || prov.focus],
                  ['Taxonomy License State', prov.licenseState],
                ].filter(([, val]) => val).map(([label, val]) => (
                  <div key={label} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 13px' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', fontFamily: label === 'Taxonomy Code' ? 'monospace' : 'inherit' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8, fontStyle: 'italic' }}>
                Taxonomy data from NPPES. Specialty Category (<strong>{prov.spec}</strong>) is managed separately in CredFlow.
              </div>
            </div>
          )}

        </div>
      )}

      {/* TASKS TAB */}
      {tab === 'tasks' && (
        <div>
          {tasks.length === 0 ? (
            <div className="empty-state"><div style={{ fontSize: 36 }}>✅</div><p>No open tasks for this provider.</p></div>
          ) : tasks.map(t => {
            const d = daysUntilWF(t.due)
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8, background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${t.priority === 'Urgent' ? 'var(--red)' : t.priority === 'High' ? 'var(--amber-d)' : 'var(--primary)'}`,
                marginBottom: 7
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.task}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{t.cat} · Due {fmtDateWF(t.due)}</div>
                </div>
                <span className={`badge ${d < 0 ? 'b-red' : d <= 3 ? 'b-red' : d <= 7 ? 'b-amber' : 'b-gray'}`}>
                  {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? 'Today' : `${d}d`}
                </span>
              </div>
            )
          })}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>
            + Add task for {prov.fname}
          </button>
        </div>
      )}
    </>
  )
}

// ─── WORKFLOW TASKS PAGE ──────────────────────────────────────────────────────
// Priority filter pills, sorted by due date, animated completion

export function WorkflowTasks({ db, openTaskModal, handleMarkDone, handleDeleteTask }) {
  const [filter, setFilter] = useState('open')
  const [tasks, setTasks] = useState(db.tasks)
  const [completing, setCompleting] = useState(new Set())

  // Sync when db.tasks changes
  if (tasks !== db.tasks && tasks.length !== db.tasks.length) {
    setTasks(db.tasks)
  }

  function pName(id) {
    const p = db.providers.find(x => x.id === id)
    return p ? `${p.fname} ${p.lname}` : null
  }

  const shown = tasks.filter(t => {
    if (filter === 'open') return t.status !== 'Done'
    if (filter === 'urgent') return t.status !== 'Done' && t.priority === 'Urgent'
    if (filter === 'done') return t.status === 'Done'
    return true
  }).sort((a, b) => {
    const da = daysUntilWF(a.due) ?? 99
    const db2 = daysUntilWF(b.due) ?? 99
    return da - db2
  })

  async function markDoneWithAnimation(id, taskName) {
    setCompleting(prev => new Set([...prev, id]))
    await new Promise(r => setTimeout(r, 300))
    await handleMarkDone(id, taskName)
    setCompleting(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const FILTERS = [['open', 'Open'], ['urgent', '🔴 Urgent'], ['done', 'Done'], ['all', 'All']]

  return (
    <div className="page">
      <div className="toolbar">
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: 4 }}>
          {FILTERS.map(([k, l]) => (
            <button
              key={k}
              className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '5px 14px', fontSize: 12, borderRadius: 999 }}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => openTaskModal()}>+ New Task</button>
        </div>
      </div>

      {shown.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <p>{filter === 'open' ? 'No open tasks — all clear!' : 'Nothing here.'}</p>
        </div>
      )}

      {shown.map(t => {
        const d = daysUntilWF(t.due)
        const done = t.status === 'Done'
        const isCompleting = completing.has(t.id)
        const pn = pName(t.provId)

        return (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: done ? '3px solid var(--border)' : `3px solid ${t.priority === 'Urgent' ? 'var(--red)' : t.priority === 'High' ? 'var(--amber-d)' : 'var(--primary)'}`,
              marginBottom: 7, opacity: isCompleting ? 0.3 : done ? 0.55 : 1,
              transition: 'opacity .3s, transform .3s',
              transform: isCompleting ? 'translateX(20px)' : 'none',
            }}
          >
            {/* Check circle */}
            <div
              onClick={() => !done && markDoneWithAnimation(t.id, t.task)}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                border: done ? 'none' : '1.5px solid var(--border)',
                background: done ? 'var(--green-l)' : 'transparent',
                color: done ? 'var(--green-d)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: done ? 'default' : 'pointer', flexShrink: 0, fontSize: 10,
                fontWeight: 700, transition: 'all .14s',
              }}
              onMouseEnter={e => { if (!done) { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.background = 'var(--green-l)' } }}
              onMouseLeave={e => { if (!done) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' } }}
            >
              {done ? '✓' : ''}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, textDecoration: done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.task}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                {pn && <span style={{ color: 'var(--primary)' }}>{pn}</span>}
                {pn && ' · '}{t.cat} ·{' '}
                <span className={`badge ${t.priority === 'Urgent' ? 'b-red' : t.priority === 'High' ? 'b-amber' : 'b-gray'}`} style={{ fontSize: 10 }}>
                  {t.priority}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {!done && d !== null && (
                <span className={`badge ${d < 0 ? 'b-red' : d === 0 ? 'b-red' : d <= 3 ? 'b-amber' : 'b-gray'}`}>
                  {d < 0 ? `${Math.abs(d)}d late` : d === 0 ? 'Today' : `${d}d`}
                </span>
              )}
              <button className="btn btn-xs btn-ghost" onClick={() => openTaskModal(t.id)}>Edit</button>
              <button className="btn btn-xs btn-danger" onClick={() => handleDeleteTask(t.id)}>✕</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── WORKFLOW DOCUMENTS ───────────────────────────────────────────────────────
// Grouped by expired / critical / notice with inline actions

export function WorkflowDocuments({ db, openDocModal, handleDeleteDocument }) {
  function pName(id) {
    const p = db.providers.find(x => x.id === id)
    return p ? `${p.fname} ${p.lname}` : '—'
  }

  const allDocs = db.documents.map(d => ({
    ...d,
    days: daysUntilWF(d.exp),
    provName: pName(d.provId),
  }))

  const expired = allDocs.filter(d => d.days !== null && d.days < 0).sort((a, b) => a.days - b.days)
  const critical = allDocs.filter(d => d.days !== null && d.days >= 0 && d.days <= 30).sort((a, b) => a.days - b.days)
  const notice = allDocs.filter(d => d.days !== null && d.days > 30 && d.days <= 90).sort((a, b) => a.days - b.days)
  const ok = allDocs.filter(d => d.days === null || d.days > 90)

  function DocGroup({ title, docs, cls }) {
    if (!docs.length) return null
    return (
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
          {title} ({docs.length})
        </div>
        {docs.map(d => (
          <div key={d.id} className={`alert-item ${cls} mb-16`}>
            <div className="al-body">
              <div className="al-title">{d.type} — {d.provName}</div>
              <div className="al-sub">
                {d.issuer && `${d.issuer} · `}
                Exp: {fmtDateWF(d.exp)}
                {d.days !== null && d.days < 0 && ` · Expired ${Math.abs(d.days)}d ago`}
                {d.days !== null && d.days >= 0 && ` · ${d.days}d remaining`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'center' }}>
              <button className="btn btn-xs btn-secondary" onClick={() => openDocModal(d.id)}>Edit</button>
              <button className="btn btn-xs btn-ghost" onClick={() => openDocModal()}>Upload new</button>
              <button className="btn btn-xs btn-danger" onClick={() => handleDeleteDocument(d.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const hasAny = expired.length + critical.length + notice.length + ok.length > 0

  return (
    <div className="page">
      <div className="toolbar">
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => openDocModal()}>+ Add Document</button>
        </div>
      </div>

      {!hasAny && (
        <div className="empty-state"><div className="ei">📎</div><h4>No documents on file</h4></div>
      )}

      <DocGroup title="⛔ Expired / Action Required" docs={expired} cls="al-red" />
      <DocGroup title="🟠 Critical — Expiring Within 30 Days" docs={critical} cls="al-red" />
      <DocGroup title="🟡 Notice — Expiring Within 90 Days" docs={notice} cls="al-amber" />

      {ok.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
            ✅ All Good ({ok.length})
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th className="no-sort">Provider</th>
                <th className="no-sort">Type</th>
                <th className="no-sort">Issuer</th>
                <th className="no-sort">Expiration</th>
                <th className="no-sort">Actions</th>
              </tr></thead>
              <tbody>
                {ok.map(d => (
                  <tr key={d.id}>
                    <td><strong>{d.provName}</strong></td>
                    <td>{d.type}</td>
                    <td>{d.issuer || '—'}</td>
                    <td>{d.exp ? fmtDateWF(d.exp) : 'No expiry'}</td>
                    <td><div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openDocModal(d.id)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDocument(d.id)}>✕</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
