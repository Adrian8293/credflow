/**
 * Dashboard.jsx — LACentra v5.0
 * Command center: urgency-first layout, real data, no fake metrics.
 * Layout: KPI strip → (main: pipeline + tasks) | (aside: alerts + queue)
 */

import { useState } from 'react'
import { daysUntil, fmtDate, pNameShort, payName } from '../../lib/helpers.js'
import { TodayInbox } from '../dashboard/TodayInbox.jsx'
import { SetupChecklist } from '../dashboard/SetupChecklist.jsx'

// ─── ICONS ────────────────────────────────────────────────────────────────────
const I = {
  alert:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  check:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  clock:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  doc:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  users:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  task:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  mail:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  arrow:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  chart:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  cal:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>,
  prov:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  enroll: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  plus:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  ext:    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function urgencyLabel(days) {
  if (days < 0)  return { text: `${Math.abs(days)}d overdue`, cls: 'b-red',   dot: 'critical' }
  if (days === 0) return { text: 'Due today',                   cls: 'b-red',   dot: 'critical' }
  if (days <= 7)  return { text: `${days}d left`,               cls: 'b-red',   dot: 'critical' }
  if (days <= 30) return { text: `${days}d left`,               cls: 'b-amber', dot: 'warning'  }
  return               { text: `${days}d left`,               cls: 'b-gray',  dot: 'info'     }
}

// ─── STAGE CONFIG ─────────────────────────────────────────────────────────────
const STAGES = [
  { id: 'Submitted',   color: '#3b82f6', label: 'Submitted'   },
  { id: 'Pending',     color: '#f59e0b', label: 'Pending'     },
  { id: 'In Review',   color: '#a855f7', label: 'In Review'   },
  { id: 'Active',      color: '#10b981', label: 'Active'      },
  { id: 'Approved',    color: '#10b981', label: 'Approved'    },
  { id: 'Denied',      color: '#ef4444', label: 'Denied'      },
  { id: 'On Hold',     color: '#64748b', label: 'On Hold'     },
]

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingChecklist({ db, setPage, openEnrollModal, openPayerModal }) {
  const hasProviders  = db.providers.length > 0
  const hasPayers     = db.payers.length > 0
  const hasEnrollment = db.enrollments.length > 0
  const steps = [
    { done: hasProviders,  title: 'Add your first provider',       desc: 'Enter NPI, license, and credentialing details.', action: () => setPage('providers?add=1'), label: 'Add Provider' },
    { done: hasPayers,     title: 'Add insurance payers',          desc: 'Set up the payers you\'ll be credentialing with.', action: () => openPayerModal?.(), label: 'Add Payer' },
    { done: hasEnrollment, title: 'Create your first application', desc: 'Track a provider\'s enrollment with a specific payer.', action: () => openEnrollModal?.(), label: 'New Application', disabled: !hasProviders || !hasPayers },
  ]
  const doneCount = steps.filter(s => s.done).length

  return (
    <div style={{ maxWidth: 520, margin: '60px auto', padding: '0 20px' }}>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--pr)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 8px 24px rgba(79,70,229,.2)', color: '#fff' }}>
          {I.prov}
        </div>
        <h2 style={{ fontFamily: 'var(--fn-display)', fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.04em', margin: '0 0 6px' }}>Welcome to LACentra</h2>
        <p style={{ fontSize: 13, color: 'var(--text-4)', margin: 0 }}>Complete these steps to start tracking credentialing.</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)' }}>Setup progress</span>
          <span style={{ fontSize: 11, color: 'var(--pr)', fontWeight: 700 }}>{doneCount}/{steps.length} complete</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px',
            background: 'var(--card)', border: `1.5px solid ${step.done ? 'rgba(16,185,129,.25)' : 'var(--border)'}`,
            borderRadius: 'var(--r-lg)', opacity: step.disabled ? 0.5 : 1,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: step.done ? 'rgba(16,185,129,.1)' : 'var(--elevated)',
              border: `2px solid ${step.done ? 'var(--green)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: step.done ? 'var(--green)' : 'var(--text-4)', fontSize: 11, fontWeight: 700,
            }}>
              {step.done ? I.check : i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: step.done ? 'var(--text-4)' : 'var(--text-1)', marginBottom: 1, textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{step.desc}</div>
            </div>
            {!step.done && <button className="btn btn-primary btn-sm" onClick={step.action} disabled={step.disabled} style={{ flexShrink: 0 }}>{step.label}</button>}
            {step.done  && <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700, whiteSpace: 'nowrap' }}>✓ Done</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SH({ icon, title, count, action, actionLabel = 'View all' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '13px 16px 11px', borderBottom: '1px solid var(--border-l)' }}>
      <span style={{ color: 'var(--text-3)', display: 'flex' }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', flex: 1 }}>{title}</span>
      {count > 0 && <span className="badge b-red" style={{ fontSize: 10 }}>{count}</span>}
      {action && (
        <button onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--pr)', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }}>
          {actionLabel} {I.ext}
        </button>
      )}
    </div>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, type = 'blue', icon, onClick, urgent }) {
  return (
    <div className={`kpi kpi-${type}`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="kpi-icon-wrap">{icon}</div>
        {urgent && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', boxShadow: '0 0 0 3px rgba(239,68,68,.2)', display: 'inline-block' }} />}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

// ─── EXPIRY ROW ───────────────────────────────────────────────────────────────
function ExpiryRow({ item, last }) {
  const u = urgencyLabel(item.days)
  return (
    <div className="alert-feed-item" style={{ borderBottom: last ? 'none' : undefined }}>
      <span className={`alert-severity ${u.dot}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.p.fname} {item.p.lname}
          {item.p.cred ? <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>, {item.p.cred}</span> : ''}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>{item.label} · {fmtDate(item.date)}</div>
      </div>
      <span className={`badge ${u.cls}`} style={{ fontSize: 10, flexShrink: 0 }}>{u.text}</span>
    </div>
  )
}

// ─── FOLLOW-UP ROW ────────────────────────────────────────────────────────────
function FollowupRow({ e, db, onDraftEmail, last }) {
  const days   = daysUntil(e.followup)
  const pName  = pNameShort(db.providers, e.providerId)
  const payer  = payName(db.payers, e.payerId)
  const u      = urgencyLabel(days)
  return (
    <div className="alert-feed-item" style={{ borderBottom: last ? 'none' : undefined }}>
      <span className={`alert-severity ${u.dot}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pName}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>{payer} · {e.stage}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span className={`badge ${u.cls}`} style={{ fontSize: 10 }}>{u.text}</span>
        {onDraftEmail && (
          <button onClick={() => onDraftEmail(e)} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--pr)', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }}>
            {I.mail} Draft
          </button>
        )}
      </div>
    </div>
  )
}

// ─── PIPELINE SNAPSHOT ────────────────────────────────────────────────────────
function PipelineSnapshot({ enrollments, setPage }) {
  const total = enrollments.length
  if (total === 0) return (
    <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>No applications yet</div>
  )

  const counts = {}
  enrollments.forEach(e => { counts[e.stage] = (counts[e.stage] || 0) + 1 })

  const stages = STAGES.map(s => ({ ...s, count: counts[s.id] || 0 })).filter(s => s.count > 0)

  return (
    <div style={{ padding: '14px 16px' }}>
      {/* Segmented bar */}
      <div className="pipeline-bar">
        {stages.map(s => (
          <div key={s.id} className="pipeline-seg" style={{ background: s.color, flex: s.count }} title={`${s.label}: ${s.count}`} />
        ))}
      </div>

      {/* Stage rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
        {stages.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-3)', flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: 12, fontFamily: 'var(--fn-mono)', color: 'var(--text-1)', fontWeight: 600 }}>{s.count}</span>
            <div style={{ width: 60, height: 4, background: 'var(--elevated)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(s.count / total) * 100}%`, background: s.color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--fn-mono)', width: 28, textAlign: 'right' }}>
              {Math.round((s.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-l)', display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
        <span style={{ color: 'var(--text-4)' }}>{total} total applications</span>
        <button onClick={() => setPage('applications')} style={{ color: 'var(--pr)', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
          Full pipeline {I.ext}
        </button>
      </div>
    </div>
  )
}

// ─── SPEC BREAKDOWN ───────────────────────────────────────────────────────────
function SpecBreakdown({ providers }) {
  const counts = {}
  providers.forEach(p => {
    const s = p.spec || 'Unspecified'
    counts[s] = (counts[s] || 0) + 1
  })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max = sorted[0]?.[1] || 1
  const COLORS = ['var(--pr)', 'var(--teal)', 'var(--purple)', 'var(--amber)', 'var(--green)', 'var(--cyan)']

  if (sorted.length === 0) return (
    <div style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>No providers yet</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {sorted.map(([spec, count], i) => (
        <div key={spec}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{spec}</span>
            <span style={{ fontSize: 12, fontFamily: 'var(--fn-mono)', color: 'var(--text-1)', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{count}</span>
          </div>
          <div className="progress-track" style={{ height: 4 }}>
            <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: COLORS[i % COLORS.length], borderRadius: 2, transition: 'width .4s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── TASK ROW ─────────────────────────────────────────────────────────────────
function TaskRow({ t, db, last }) {
  const prov = db.providers.find(p => p.id === t.provId)
  const overdue = t.due && daysUntil(t.due) < 0 && t.status !== 'Done'
  const dueText = t.due ? (daysUntil(t.due) === 0 ? 'Due today' : daysUntil(t.due) < 0 ? `${Math.abs(daysUntil(t.due))}d overdue` : `Due ${fmtDate(t.due)}`) : 'No due date'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderBottom: last ? 'none' : '1px solid var(--border-l)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: overdue ? 'var(--red)' : t.priority === 'High' ? 'var(--amber)' : 'var(--pr)', flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title || t.text}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1 }}>
          {prov ? `${prov.fname} ${prov.lname} · ` : ''}{dueText}
        </div>
      </div>
      {t.priority && <span className={`badge ${overdue ? 'b-red' : t.priority === 'High' ? 'b-amber' : 'b-gray'}`} style={{ fontSize: 10, flexShrink: 0 }}>{t.priority}</span>}
    </div>
  )
}

// ─── RECENT APPLICATIONS ──────────────────────────────────────────────────────
function RecentApps({ db, setPage }) {
  const recent = [...db.enrollments]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 5)

  const stageColor = stage => {
    if (['Active', 'Approved'].includes(stage)) return 'b-green'
    if (stage === 'Denied') return 'b-red'
    if (['Pending', 'On Hold'].includes(stage)) return 'b-amber'
    return 'b-blue'
  }

  if (recent.length === 0) return (
    <div style={{ padding: '18px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>No applications yet</div>
  )

  return (
    <div>
      {recent.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: i < recent.length - 1 ? '1px solid var(--border-l)' : 'none' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', flexShrink: 0 }}>
            {I.enroll}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pNameShort(db.providers, e.providerId)}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {payName(db.payers, e.payerId)}
            </div>
          </div>
          <span className={`badge ${stageColor(e.stage)}`} style={{ fontSize: 10, flexShrink: 0 }}>{e.stage}</span>
        </div>
      ))}
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export function Dashboard({ db, setPage, openEnrollModal, onDraftEmail, openPayerModal, openProvDetail, openTaskModal, role, orgId }) {
  const isEmpty = db.providers.length === 0 && db.enrollments.length === 0
  if (isEmpty) {
    return (
      <div className="page">
        <OnboardingChecklist db={db} setPage={setPage} openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} />
      </div>
    )
  }

  // ── Compute metrics ────────────────────────────────────────────────────────
  const activeProviders = db.providers.filter(p => p.status === 'Active').length
  const pendingApps     = db.enrollments.filter(e => !['Active', 'Approved', 'Denied'].includes(e.stage)).length
  const activeApps      = db.enrollments.filter(e => ['Active', 'Approved'].includes(e.stage)).length
  const openTasks       = db.tasks.filter(t => t.status !== 'Done').length

  const expiryItems = []
  db.providers.forEach(p => {
    [
      { f: 'licenseExp', l: 'License' },
      { f: 'malExp',     l: 'Malpractice' },
      { f: 'deaExp',     l: 'DEA' },
      { f: 'caqhDue',   l: 'CAQH' },
      { f: 'recred',    l: 'Re-credentialing' },
    ].forEach(c => {
      const d = daysUntil(p[c.f])
      if (d !== null && d <= 90) expiryItems.push({ p, label: c.label, days: d, date: p[c.f] })
    })
  })
  expiryItems.sort((a, b) => a.days - b.days)

  const expired  = expiryItems.filter(a => a.days < 0).length
  const critical = expiryItems.filter(a => a.days >= 0 && a.days <= 30).length
  const overdueTasks = db.tasks.filter(t => t.status !== 'Done' && t.due && daysUntil(t.due) < 0).length

  const followups = db.enrollments
    .filter(e => e.followup && daysUntil(e.followup) !== null && daysUntil(e.followup) <= 14)
    .sort((a, b) => daysUntil(a.followup) - daysUntil(b.followup))

  const upcomingTasks = db.tasks
    .filter(t => t.status !== 'Done')
    .sort((a, b) => {
      if (!a.due) return 1; if (!b.due) return -1
      return new Date(a.due) - new Date(b.due)
    })
    .slice(0, 6)

  const statusSummary = expired > 0
    ? `${expired} expired credential${expired !== 1 ? 's' : ''} require immediate action.`
    : critical > 0
    ? `${critical} credential${critical !== 1 ? 's' : ''} expiring within 30 days.`
    : overdueTasks > 0
    ? `${overdueTasks} overdue task${overdueTasks !== 1 ? 's' : ''} need attention.`
    : 'All credentials and tasks are within thresholds.'

  const urgentCount = expired + (overdueTasks > 0 ? 1 : 0)

  return (
    <div className="page">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="dash-header">
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 5 }}>
            {todayLabel()}
          </div>
          <h2 style={{ fontFamily: 'var(--fn-display)', fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.04em', margin: '0 0 5px', lineHeight: 1.1 }}>
            {greeting()}
          </h2>
          <p style={{ fontSize: 12.5, color: expired > 0 || overdueTasks > 0 ? 'var(--red)' : critical > 0 ? 'var(--amber)' : 'var(--text-4)', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            {(expired > 0 || overdueTasks > 0) && <span style={{ display: 'inline-flex' }}>{I.alert}</span>}
            {statusSummary}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()} style={{ gap: 5 }}>
            {I.enroll} New Enrollment
          </button>
        </div>
      </div>

      <SetupChecklist db={db} role={role} orgId={orgId} setPage={setPage} openEnrollModal={openEnrollModal} />

      {/* ── KPI Strip ───────────────────────────────────────────────────────── */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 22 }}>
        <KpiCard
          label="Active Providers"
          value={activeProviders}
          sub={`${db.providers.length} total registered`}
          type="blue"
          icon={I.prov}
          onClick={() => setPage('providers')}
        />
        <KpiCard
          label="In Pipeline"
          value={pendingApps}
          sub={`${activeApps} approved panels`}
          type="amber"
          icon={I.enroll}
          onClick={() => setPage('applications')}
        />
        <KpiCard
          label="Expiring ≤ 30 Days"
          value={critical + expired}
          sub={`${expired} already expired`}
          type={expired > 0 ? 'red' : critical > 0 ? 'amber' : 'green'}
          icon={I.alert}
          urgent={expired > 0}
          onClick={() => setPage('alerts')}
        />
        <KpiCard
          label="Open Tasks"
          value={openTasks}
          sub={overdueTasks > 0 ? `${overdueTasks} overdue` : 'All within schedule'}
          type={overdueTasks > 0 ? 'red' : 'teal'}
          icon={I.task}
          urgent={overdueTasks > 0}
          onClick={() => setPage('tasks')}
        />
      </div>

      {/* ── Body Layout ─────────────────────────────────────────────────────── */}
      <div className="dash-layout">

        {/* MAIN COLUMN */}
        <div className="dash-main">

          {/* One inbox for everything that needs a person */}
          <TodayInbox db={db} setPage={setPage} openEnrollModal={openEnrollModal}
            openProvDetail={openProvDetail} openTaskModal={openTaskModal} onDraftEmail={onDraftEmail} />

          {/* Application Pipeline */}
          <div className="card">
            <SH icon={I.chart} title="Application Pipeline" action={() => setPage('applications')} />
            <PipelineSnapshot enrollments={db.enrollments} setPage={setPage} />
          </div>

          {/* Recent Applications */}
          <div className="card">
            <SH icon={I.doc} title="Recent Applications" action={() => setPage('applications')} />
            <RecentApps db={db} setPage={setPage} />
          </div>

        </div>

        {/* ASIDE COLUMN */}
        <div className="dash-aside">

          {/* Provider Breakdown */}
          <div className="card">
            <SH icon={I.users} title="Providers by Specialty" action={() => setPage('providers')} />
            <div style={{ padding: '14px 16px' }}>
              <SpecBreakdown providers={db.providers} />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Dashboard
