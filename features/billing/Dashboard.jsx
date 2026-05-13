/**
 * Dashboard.jsx — PrimeCredential
 * Premium enterprise dashboard with KPI cards, pipeline donut,
 * upcoming expirations, recent applications, quick actions.
 */

import { useState } from 'react'
import { daysUntil, fmtDate, fmtFull, pName, pNameShort, payName } from '../../lib/helpers.js'
import { StageBadge } from '../../components/ui/Badge.jsx'

const Icon = {
  alert:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  calendar: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  chart:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  users:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  check:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  mail:     <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  spark:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  arrowUp:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
  arrowDn:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  task:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  doc:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  plus:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
}

// ─── ONBOARDING EMPTY STATE ───────────────────────────────────────────────────
function OnboardingChecklist({ db, setPage, openEnrollModal, openPayerModal }) {
  const hasProviders  = db.providers.length > 0
  const hasPayers     = db.payers.length > 0
  const hasEnrollment = db.enrollments.length > 0

  const steps = [
    {
      done: hasProviders,
      title: 'Add your first provider',
      desc: 'Enter provider details, NPI, license, and credentialing info.',
      action: () => setPage('add-provider'),
      label: 'Add Provider',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>,
    },
    {
      done: hasPayers,
      title: 'Add insurance payers',
      desc: 'Set up the payers you\'ll be credentialing with (Aetna, BCBS, etc.).',
      action: () => openPayerModal?.(),
      label: 'Add Payer',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    },
    {
      done: hasEnrollment,
      title: 'Create your first application',
      desc: 'Track a provider\'s credentialing application with a specific payer.',
      action: () => openEnrollModal?.(),
      label: 'New Application',
      disabled: !hasProviders || !hasPayers,
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
    },
  ]

  const doneCount = steps.filter(s => s.done).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 420, padding: '40px 20px' }}>
      {/* Logo/welcome */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#1E56F0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(30,86,240,.25)' }}>
          <svg width="28" height="28" viewBox="0 0 48 48" fill="none"><text x="8" y="36" fontFamily="Inter,sans-serif" fontWeight="800" fontSize="30" fill="#fff">P</text></svg>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.04em', margin: '0 0 8px' }}>Welcome to PrimeCredential</h2>
        <p style={{ fontSize: 14, color: 'var(--text-4)', maxWidth: 380, margin: '0 auto' }}>
          Get started by completing these setup steps. Your dashboard will populate as you add data.
        </p>
      </div>

      {/* Progress bar */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Setup Progress</span>
          <span style={{ fontSize: 12, color: 'var(--pr)', fontWeight: 700 }}>{doneCount}/{steps.length} complete</span>
        </div>
        <div style={{ height: 6, background: 'var(--elevated)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--border-l)' }}>
          <div style={{ height: '100%', width: `${(doneCount / steps.length) * 100}%`, background: 'var(--pr)', borderRadius: 999, transition: 'width .4s ease' }} />
        </div>
      </div>

      {/* Steps */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {steps.map((step, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
            background: 'var(--card)', border: `1.5px solid ${step.done ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: 'var(--r-lg)', opacity: step.disabled ? 0.5 : 1,
            transition: 'border-color .2s',
          }}>
            {/* Step icon/check */}
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: step.done ? 'rgba(16,185,129,.12)' : 'var(--elevated)',
              border: `2px solid ${step.done ? 'var(--success)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: step.done ? 'var(--success)' : 'var(--text-3)',
            }}>
              {step.done
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : step.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: step.done ? 'var(--text-3)' : 'var(--text-1)', marginBottom: 2, textDecoration: step.done ? 'line-through' : 'none' }}>{step.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-4)' }}>{step.desc}</div>
            </div>
            {!step.done && (
              <button className="btn btn-primary btn-sm" onClick={step.action} disabled={step.disabled}
                style={{ fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {step.label}
              </button>
            )}
            {step.done && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ Done</span>}
          </div>
        ))}
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-4)' }}>
        Need help? <span style={{ color: 'var(--pr)', cursor: 'pointer', fontWeight: 500 }} onClick={() => window.open('mailto:support@primecredential.com')}>Contact support →</span>
      </p>
    </div>
  )
}

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent = 'kpi-blue', icon, trend, trendUp, insight, onClick }) {
  return (
    <div className={`kpi ${accent}`} style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="kpi-label">{label}</div>
        {icon && <div className="kpi-icon-wrap">{icon}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <div className="kpi-value">{value}</div>
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: trendUp ? 'var(--success)' : 'var(--danger)' }}>
            {trendUp ? Icon.arrowUp : Icon.arrowDn} {trend}
          </div>
        )}
      </div>
      <div className="kpi-sub">{sub}</div>
      {insight && (
        <div style={{ marginTop: 8, padding: '5px 8px', background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 10.5, color: 'var(--text-3)', display: 'flex', gap: 5, alignItems: 'flex-start', lineHeight: 1.5 }}>
          <span style={{ color: 'var(--pr)', flexShrink: 0, marginTop: 1 }}>{Icon.spark}</span>
          {insight}
        </div>
      )}
    </div>
  )
}

// ─── PIPELINE DONUT ───────────────────────────────────────────────────────────
const DONUT_COLORS = ['#2563EB','#10B981','#F59E0B','#EF4444','#7C3AED','#0891B2']

function PipelineDonut({ enrollments }) {
  const [hovered, setHovered] = useState(null)
  const stages = {}
  enrollments.forEach(e => { stages[e.stage] = (stages[e.stage] || 0) + 1 })
  const total = enrollments.length || 1
  const r = 38; const circ = 2 * Math.PI * r; let offset = 0
  const slices = Object.entries(stages).map(([stage, count], i) => {
    const pct = (count / total) * circ
    const slice = { stage, count, color: DONUT_COLORS[i % DONUT_COLORS.length], pct, offset }
    offset += pct; return slice
  })
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width="96" height="96" viewBox="0 0 96 96">
          {slices.length === 0 && (
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border)" strokeWidth="11" />
          )}
          {slices.map(s => (
            <circle key={s.stage} cx="48" cy="48" r={r} fill="none"
              stroke={hovered === s.stage ? s.color : s.color + 'cc'}
              strokeWidth={hovered === s.stage ? 15 : 11}
              strokeDasharray={`${s.pct} ${circ - s.pct}`}
              strokeDashoffset={-s.offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', cursor: 'pointer', transition: 'all .15s' }}
              onMouseEnter={() => setHovered(s.stage)} onMouseLeave={() => setHovered(null)}
            />
          ))}
          {/* POL-009: count only inside SVG — label moved outside at readable size */}
          <text x="48" y="55" textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--text-1)">
            {hovered ? slices.find(s => s.stage === hovered)?.count : total}
          </text>
        </svg>
        {/* Stage label rendered as HTML below the SVG — accessible, styleable, not truncated */}
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 2, minHeight: 16, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hovered || 'Total'}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        {slices.map(s => (
          <div key={s.stage} onMouseEnter={() => setHovered(s.stage)} onMouseLeave={() => setHovered(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', opacity: hovered && hovered !== s.stage ? .4 : 1, cursor: 'default', transition: 'opacity .15s' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.stage}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flexShrink: 0 }}>{s.count}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-4)', minWidth: 32, textAlign: 'right' }}>{Math.round(s.count/total*100)}%</span>
          </div>
        ))}
        {slices.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-4)' }}>No enrollments yet</div>}
      </div>
    </div>
  )
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SH({ icon, title, count, onViewAll }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: 'var(--text-3)' }}>{icon}</span>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-.02em' }}>{title}</h3>
        {count > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--r-pill)' }}>{count}</span>}
      </div>
      {onViewAll && <button onClick={onViewAll} style={{ fontSize: 11.5, color: 'var(--pr)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>}
    </div>
  )
}

// ─── ALERT ROW ────────────────────────────────────────────────────────────────
function AlertRow({ a }) {
  const expired = a.days < 0; const urgent = a.days <= 30
  const color = expired ? 'var(--danger)' : urgent ? 'var(--warning)' : 'var(--success)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-l)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 0 3px ${color}22` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.p.fname} {a.p.lname} — {a.label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
          {fmtDate(a.date)} · <span style={{ color, fontWeight: 600 }}>{expired ? `Expired ${Math.abs(a.days)}d ago` : `${a.days}d remaining`}</span>
        </div>
      </div>
    </div>
  )
}

// ─── FOLLOWUP ROW ─────────────────────────────────────────────────────────────
function FollowupRow({ e, db, onDraftEmail }) {
  const d = daysUntil(e.followup)
  const overdue = d <= 0; const urgent = d <= 3 && !overdue
  const color = overdue ? 'var(--danger)' : urgent ? 'var(--warning)' : 'var(--text-2)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-l)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pNameShort(db.providers, e.provId)} <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>×</span> {payName(db.payers, e.payId)}
        </div>
        <div style={{ fontSize: 11, color, marginTop: 1, fontWeight: overdue || urgent ? 600 : 400 }}>
          {overdue ? `Overdue by ${Math.abs(d)}d` : `Follow-up in ${d}d`}
          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> · {fmtDate(e.followup)}</span>
        </div>
      </div>
      {onDraftEmail && (
        <button className="btn btn-sm" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }} onClick={() => onDraftEmail(e)}>
          {Icon.mail} Draft
        </button>
      )}
    </div>
  )
}

// ─── RECENT APPS TABLE ────────────────────────────────────────────────────────
function RecentAppsTable({ db, openEnrollModal, setPage }) {
  const [tab, setTab] = useState('All')
  const tabs = ['All', 'In Progress', 'Submitted', 'Approved', 'Returned']
  const stageMap = { 'In Progress': ['Submitted','Pending','In Review','Waiting on Payer'], 'Submitted': ['Submitted'], 'Approved': ['Active','Approved'], 'Returned': ['Returned','Denied'] }
  const filtered = db.enrollments
    .filter(e => tab === 'All' ? true : (stageMap[tab] || [tab]).some(s => e.stage?.toLowerCase().includes(s.toLowerCase())))
    .slice(0, 6)

  const stageBadge = (stage) => {
    const s = stage?.toLowerCase() || ''
    if (s.includes('active') || s.includes('approved')) return <span className="badge b-green">{stage}</span>
    if (s.includes('return') || s.includes('denied')) return <span className="badge b-red">{stage}</span>
    if (s.includes('pending') || s.includes('waiting')) return <span className="badge b-amber">{stage}</span>
    if (s.includes('review')) return <span className="badge b-blue">{stage}</span>
    return <span className="badge b-blue">{stage}</span>
  }

  return (
    <div className="card">
      <div className="card-header">
        <SH icon={Icon.doc} title="Recent Applications" onViewAll={() => setPage('applications')} />
      </div>
      <div className="tabs" style={{ padding: '0 18px', marginBottom: 0 }}>
        {tabs.map(t => <div key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      {filtered.length === 0 ? (
        <div className="card-body">
          <div className="empty-state" style={{ padding: '28px 0' }}>
            <div className="empty-state-icon">{Icon.doc}</div>
            <div className="empty-state-title">No applications yet</div>
            <div className="empty-state-desc">Applications will appear here once created.</div>
            <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal?.()}>+ New Application</button>
          </div>
        </div>
      ) : (
        <table>
          <thead><tr>
            <th>Provider</th><th>Payer</th><th>Status</th><th>Date</th>
          </tr></thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={i} style={{ cursor: 'pointer' }} onClick={() => openEnrollModal?.(e.id)}>
                <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{pNameShort(db.providers, e.provId) || '—'}</td>
                <td style={{ color: 'var(--text-3)' }}>{payName(db.payers, e.payId) || '—'}</td>
                <td>{stageBadge(e.stage)}</td>
                <td style={{ color: 'var(--text-4)', fontSize: 11.5 }}>{fmtDate(e.updated || e.created) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// QuickActions removed per UX cleanup — shortcuts are now available via the sidebar nav

// ─── SPECIALTY BREAKDOWN ──────────────────────────────────────────────────────
function SpecialtyBreakdown({ db }) {
  const specs = {}
  db.providers.filter(p => p.status === 'Active').forEach(p => { specs[p.spec] = (specs[p.spec] || 0) + 1 })
  const total = Object.values(specs).reduce((a, b) => a + b, 0) || 1
  const COLORS = ['var(--pr)', 'var(--success)', 'var(--warning)', '#7C3AED', '#0891B2', 'var(--danger)']
  return (
    <div>
      {Object.entries(specs).sort((a, b) => b[1] - a[1]).map(([s, n], i) => (
        <div key={s} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-2)' }}>{s || 'General'}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{n}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(n/total*100)}%`, background: COLORS[i % COLORS.length] }} />
          </div>
        </div>
      ))}
      {Object.entries(specs).length === 0 && (
        <div className="empty-state" style={{ padding: '16px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Add providers to see specialty distribution.</div>
        </div>
      )}
    </div>
  )
}

// ─── UPCOMING EXPIRATIONS ─────────────────────────────────────────────────────
function UpcomingExpirations({ db, setPage }) {
  const items = []
  db.providers.forEach(p => {
    [
      { f: 'licenseExp', l: 'License' },
      { f: 'malExp',     l: 'Malpractice' },
      { f: 'deaExp',     l: 'DEA' },
      { f: 'caqhDue',   l: 'CAQH' },
    ].forEach(c => {
      const d = daysUntil(p[c.f])
      if (d !== null && d <= 90) items.push({ p, label: c.label, days: d, date: p[c.f] })
    })
  })
  items.sort((a, b) => a.days - b.days)

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <SH icon={Icon.calendar} title="Upcoming Expirations"
          count={items.filter(a => a.days <= 30).length}
          onViewAll={() => setPage('alerts')} />
      </div>
      <div className="card-body" style={{ maxHeight: 220, overflowY: 'auto', padding: '0 16px' }}>
        {items.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✓</div>
            All credentials within thresholds
          </div>
        ) : items.slice(0, 8).map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-l)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.p.fname} {a.p.lname}{a.p.cred ? `, ${a.p.cred}` : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>NPI: {a.p.npi || '—'}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: a.days < 0 ? 'var(--danger)' : a.days <= 30 ? 'var(--danger)' : 'var(--warning)' }}>
                {fmtDate(a.date)}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{a.label} · {a.days < 0 ? `${Math.abs(a.days)}d expired` : `${a.days}d left`}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function Dashboard({ db, setPage, openEnrollModal, onDraftEmail, openPayerModal }) {
  const alertDays = db.settings.alertDays || 90
  const meta = {}
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  // Show onboarding empty state when no providers AND no enrollments
  const isEmpty = db.providers.length === 0 && db.enrollments.length === 0
  if (isEmpty) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Dashboard</h2>
            <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Your credentialing command center.</p>
          </div>
        </div>
        <OnboardingChecklist db={db} setPage={setPage} openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} />
      </div>
    )
  }

  const activeProvs   = db.providers.filter(p => p.status === 'Active').length
  const activeEnr     = db.enrollments.filter(e => e.stage === 'Active').length
  const pendingEnr    = db.enrollments.filter(e => !['Active', 'Denied'].includes(e.stage)).length
  const openTasks     = db.tasks.filter(t => t.status !== 'Done').length
  const expDocs       = db.documents.filter(d => { const d2 = daysUntil(d.exp); return d2 !== null && d2 <= 90 }).length
  let expiring = 0; let caqhExpiring = 0
  db.providers.forEach(p => {
    ['licenseExp', 'malExp', 'caqhDue'].forEach(f => { const d = daysUntil(p[f]); if (d !== null && d <= alertDays) expiring++ })
    const caqh = daysUntil(p.caqhDue)
    if (caqh !== null && caqh <= 30) caqhExpiring++
  })

  const alerts = []
  db.providers.forEach(p => {
    [{ f:'licenseExp',l:'License'},{f:'malExp',l:'Malpractice'},{f:'deaExp',l:'DEA'},{f:'caqhDue',l:'CAQH'},{f:'recred',l:'Recredentialing'}].forEach(c => {
      const d = daysUntil(p[c.f])
      if (d !== null && d <= 90) alerts.push({ p, label: c.label, days: d, date: p[c.f] })
    })
  })
  alerts.sort((a, b) => a.days - b.days)

  const fu = db.enrollments
    .filter(e => e.followup && daysUntil(e.followup) !== null && daysUntil(e.followup) <= 14)
    .sort((a, b) => daysUntil(a.followup) - daysUntil(b.followup))

  return (
    <div className="page">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Dashboard</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Welcome back! Here's what's happening with your credentialing.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Date range selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--elevated)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '5px 10px' }}>
            <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 500 }}>From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-2)', outline: 'none', fontFamily: 'inherit' }} />
            <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 500 }}>To</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-2)', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => {
              const from = dateFrom || '1970-01-01'
              const to   = dateTo   || new Date().toISOString().split('T')[0]
              const rows = db.enrollments.filter(e => {
                const d = (e.updated || e.created || '').split('T')[0]
                return d >= from && d <= to
              })
              const csv = ['Provider,Payer,Stage,Date'].concat(
                rows.map(e => {
                  const prov = db.providers.find(p => p.id === e.provId)
                  const pay  = db.payers.find(p => p.id === e.payId)
                  return `"${prov ? prov.fname+' '+prov.lname : '—'}","${pay?.name||'—'}","${e.stage||'—'}","${(e.updated||e.created||'').split('T')[0]}"`
                })
              ).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `credentialing-report-${from}-to-${to}.csv`
              a.click()
            }}>
            {Icon.download} Download Report
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <KpiCard label="Applications" value={db.enrollments.length} sub="Total in pipeline" accent="kpi-blue" icon={Icon.doc}
          trend="+18%" trendUp onClick={() => setPage('applications')} />
        <KpiCard label="In Progress" value={pendingEnr} sub="Awaiting approval" accent="kpi-amber" icon={Icon.calendar}
          trend="+10%" trendUp onClick={() => setPage('applications')}
          insight={pendingEnr > 5 ? `${pendingEnr} apps in pipeline — review oldest` : null} />
        <KpiCard label="Approvals" value={activeEnr} sub="Active panels" accent="kpi-green" icon={Icon.check}
          trend="+12%" trendUp onClick={() => setPage('applications')} />
        <KpiCard label="Expirations" value={expiring} sub={`Within ${alertDays} days`} accent="kpi-red" icon={Icon.alert}
          trend="-5%" trendUp={false} onClick={() => setPage('alerts')}
          insight={expiring > 0 ? `${alerts.filter(a => a.days < 0).length} already expired` : null} />
        <KpiCard label="Open Tasks" value={openTasks} sub="Pending action" accent="kpi-purple" icon={Icon.task}
          onClick={() => setPage('tasks')} />
        <KpiCard label="Docs Expiring" value={expDocs} sub="Within 90 days" accent="kpi-cyan" icon={Icon.doc}
          onClick={() => setPage('documents')} />
      </div>

      {/* Main layout: responsive grid — 2-col base, expands to 3-col on wide screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>

        {/* COL 1: Alerts + Followups */}
        <div>
          <div className="card mb-16" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <SH icon={Icon.alert} title="Active Alerts" count={alerts.filter(a => a.days <= 30).length} onViewAll={() => setPage('alerts')} />
            </div>
            <div className="card-body" style={{ maxHeight: 220, overflowY: 'auto', padding: '0 16px' }}>
              {alerts.length > 0 ? alerts.slice(0, 6).map((a, i) => <AlertRow key={i} a={a} />) : (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div> No active alerts
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <SH icon={Icon.calendar} title="Upcoming Follow-ups" count={fu.filter(e => daysUntil(e.followup) <= 0).length} onViewAll={() => setPage('applications')} />
            </div>
            <div className="card-body" style={{ maxHeight: 180, overflowY: 'auto', padding: '0 16px' }}>
              {fu.length > 0 ? fu.slice(0, 5).map((e, i) => <FollowupRow key={i} e={e} db={db} onDraftEmail={onDraftEmail} />) : (
                <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-4)' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>📅</div> No follow-ups due in 14 days
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COL 2: Pipeline Donut + Docs Expiring */}
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-header">
              <SH icon={Icon.chart} title="Application Status" onViewAll={() => setPage('applications')} />
            </div>
            <div className="card-body">
              <PipelineDonut enrollments={db.enrollments} />
            </div>
          </div>
          <UpcomingExpirations db={db} setPage={setPage} />
        </div>

        {/* COL 3: Recent Applications + Specialty Breakdown */}
        <div>
          <RecentAppsTable db={db} openEnrollModal={openEnrollModal} setPage={setPage} />
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-header">
              <SH icon={Icon.users} title="Providers by Specialty" onViewAll={() => setPage('providers')} />
            </div>
            <div className="card-body">
              <SpecialtyBreakdown db={db} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
