/**
 * Alerts.jsx — PrimeCredential
 * Credential expiration alerts with categorized urgency levels and action buttons.
 */

import { useState } from 'react'
import { daysUntil, fmtDate } from '../../lib/helpers.js'

const NEXT_STEPS = {
  'License':                'Contact provider for renewal documentation; verify with state board.',
  'Malpractice Insurance':  'Request updated COI from provider; upload to Documents.',
  'DEA Certificate':        'Notify provider to renew via DEA.gov; collect new certificate.',
  'CAQH Attestation':       'Send CAQH re-attestation reminder; verify all sections current.',
  'Recredentialing':        'Initiate recredentialing packet; check payer-specific requirements.',
  'Supervision Agreement':  'Request updated supervision agreement signed by both parties.',
}

const LABEL_TO_FIELD = {
  'License':                'licenseExp',
  'Malpractice Insurance':  'malExp',
  'DEA Certificate':        'deaExp',
  'CAQH Attestation':       'caqhDue',
  'Recredentialing':        'recred',
  'Supervision Agreement':  'supExp',
}

const TABS = ['All Alerts', 'Critical', 'Warnings', 'Information']

const AlertIcon = ({ type }) => {
  const map = {
    expired:  { bg: 'rgba(239,68,68,.08)',   color: 'var(--danger)',  icon: '!' },
    critical: { bg: 'rgba(239,68,68,.08)',   color: 'var(--danger)',  icon: '!' },
    warning:  { bg: 'rgba(245,158,11,.08)', color: 'var(--warning)', icon: '~' },
    info:     { bg: 'rgba(30,86,240,.08)',  color: 'var(--pr)',       icon: 'i' },
  }
  const s = map[type] || map.info
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
      {s.icon}
    </div>
  )
}

export function Alerts({ db, onOpenProvider, onDraftEmail, onMarkDone }) {
  const [activeTab, setActiveTab] = useState('All Alerts')
  const alertDays = db.settings.alertDays || 90
  const caqhDays = db.settings.caqhDays || 30
  const items = []

  db.providers.forEach(p => {
    [
      { f: 'licenseExp', l: 'License',                th: alertDays },
      { f: 'malExp',     l: 'Malpractice Insurance',  th: alertDays },
      { f: 'deaExp',     l: 'DEA Certificate',        th: alertDays },
      { f: 'caqhDue',    l: 'CAQH Attestation',       th: caqhDays  },
      { f: 'recred',     l: 'Recredentialing',        th: alertDays },
      { f: 'supExp',     l: 'Supervision Agreement',  th: alertDays },
    ].forEach(c => {
      if (!p[c.f]) return
      const d = daysUntil(p[c.f])
      if (d !== null && d <= c.th) items.push({ p, label: c.label, days: d, date: p[c.f] })
    })
  })
  items.sort((a, b) => a.days - b.days)

  const expired  = items.filter(a => a.days < 0)
  const critical = items.filter(a => a.days >= 0 && a.days <= 30)
  const warning  = items.filter(a => a.days > 30 && a.days <= 60)
  const info     = items.filter(a => a.days > 60)

  const filtered = activeTab === 'All Alerts' ? items
    : activeTab === 'Critical' ? [...expired, ...critical]
    : activeTab === 'Warnings' ? warning
    : info

  function Row({ a }) {
    const isExpired  = a.days < 0
    const isCritical = a.days >= 0 && a.days <= 30
    const isWarning  = a.days > 30 && a.days <= 60
    const iconType   = isExpired ? 'expired' : isCritical ? 'critical' : isWarning ? 'warning' : 'info'
    const borderColor = isExpired || isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--pr)'
    const bgColor     = isExpired || isCritical ? 'rgba(239,68,68,.035)' : isWarning ? 'rgba(245,158,11,.035)' : 'rgba(30,86,240,.035)'

    return (
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '14px 18px',
        borderLeft: `3px solid ${borderColor}`,
        background: bgColor,
        borderRadius: '0 var(--r) var(--r) 0',
        marginBottom: 8,
      }}>
        <AlertIcon type={iconType} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>
              {a.p.fname} {a.p.lname}{a.p.cred ? `, ${a.p.cred}` : ''} — {a.label}
            </span>
            {isExpired && <span className="badge b-red">Expired</span>}
            {!isExpired && isCritical && <span className="badge b-red">Critical</span>}
            {isWarning && <span className="badge b-amber">Warning</span>}
            {!isExpired && !isCritical && !isWarning && <span className="badge b-blue">Notice</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>
            {fmtDate(a.date)} ·{' '}
            <span style={{ color: borderColor, fontWeight: 600 }}>
              {isExpired ? `Expired ${Math.abs(a.days)} days ago` : `${a.days} days remaining`}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Next step: </span>
            {NEXT_STEPS[a.label] || 'Review with provider and update record.'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-secondary" onClick={() => onOpenProvider?.(a.p.id)}>Open Provider</button>
            <button className="btn btn-sm btn-secondary" onClick={() => onDraftEmail?.({ provId: a.p.id, payId: null, alertLabel: a.label, alertDays: a.days, alertDate: a.date })}>Draft Email</button>
            <button className="btn btn-sm btn-green" onClick={() => onMarkDone?.(a.p.id, LABEL_TO_FIELD[a.label])}>Mark Resolved</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Alerts</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Important alerts and notifications requiring your attention.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {items.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--pr)', fontWeight: 600, cursor: 'pointer' }}>Mark all as read ✓</span>
          )}
          <button className="btn btn-secondary btn-sm">Filter by type ▾</button>
        </div>
      </div>

      {/* Summary KPIs */}
      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Expired', count: expired.length, color: 'var(--danger)', bg: 'rgba(239,68,68,.08)' },
            { label: 'Critical (≤30d)', count: critical.length, color: 'var(--danger)', bg: 'rgba(239,68,68,.08)' },
            { label: 'Warnings (31–60d)', count: warning.length, color: 'var(--warning)', bg: 'rgba(245,158,11,.08)' },
            { label: 'Notices (61–90d)', count: info.length, color: 'var(--pr)', bg: 'rgba(30,86,240,.08)' },
          ].map((kpi, i) => (
            <div key={i} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color, marginBottom: 4 }}>{kpi.count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="tabs">
        {TABS.map(t => (
          <div key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
            {t}
            {t === 'Critical' && (expired.length + critical.length) > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--danger)', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{expired.length + critical.length}</span>
            )}
          </div>
        ))}
      </div>

      {filtered.length > 0 ? (
        filtered.map((a, i) => <Row key={i} a={a} />)
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div className="empty-state-title">No Active Alerts</div>
          <div className="empty-state-desc">All credentials are within acceptable thresholds for this category.</div>
        </div>
      )}
    </div>
  )
}

export default Alerts
