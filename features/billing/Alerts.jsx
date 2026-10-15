/**
 * Alerts.jsx — Lacentra
 * Credential expiration alerts with categorized urgency levels and action buttons.
 */

import { useState } from 'react'
import { fmtDate, getProviderAlerts, pNameShort, payName } from '../../lib/helpers.js'
import { buildAlertFeed } from '../../lib/alerts.js'

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

const TABS = ['All Alerts', 'Critical', 'Warnings', 'Information', 'Enrollments']
const ACTIVE_STAGES = ['Active', 'Contracted', 'Approved']

const AlertIcon = ({ type }) => {
  const map = {
    expired:  { bg: 'rgba(239,68,68,.08)',   color: 'var(--danger)',  icon: '!' },
    critical: { bg: 'rgba(239,68,68,.08)',   color: 'var(--danger)',  icon: '!' },
    warning:  { bg: 'rgba(245,158,11,.08)', color: 'var(--warning)', icon: '~' },
    info:     { bg: 'rgba(21,101,192,.08)',  color: 'var(--pr)',       icon: 'i' },
  }
  const s = map[type] || map.info
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
      {s.icon}
    </div>
  )
}

export function Alerts({ db, onOpenProvider, onDraftEmail, onMarkDone, onOpenEnrollment }) {
  const [activeTab, setActiveTab] = useState('All Alerts')
  const alertDays = db.settings.alertDays || 90
  const caqhDays = db.settings.caqhDays || 30
  const items = []

  // MED-015: use shared getProviderAlerts so badge + alerts + missing docs all agree
  db.providers.forEach(p => {
    getProviderAlerts(p, { alertDays, caqhDays }).forEach(a => {
      items.push({ p: a.p, label: a.label, days: a.days, date: a.p[a.field], field: a.field })
    })
  })
  items.sort((a, b) => a.days - b.days)

  const expired  = items.filter(a => a.days < 0)
  const critical = items.filter(a => a.days >= 0 && a.days <= 30)
  const warning  = items.filter(a => a.days > 30 && a.days <= 60)
  const info     = items.filter(a => a.days > 60)

  // Enrollment deadlines (follow-ups, payer recredentialing, terminations) and data gaps.
  const enrItems = buildAlertFeed(db).filter(i => ['followup', 'enr-recred', 'enr-term'].includes(i.type))
  const gaps = []
  db.enrollments.forEach(e => {
    const stage = e.stage || ''
    const prov = db.providers.find(p => p.id === e.provId)
    const who = `${pNameShort(db.providers, e.provId)} · ${payName(db.payers, e.payId)}`
    if (ACTIVE_STAGES.some(s => stage.startsWith(s)) && !e.billableFrom) gaps.push({ enrId: e.id, who, msg: 'Active but no Billable From date set' })
    if (prov?.supervisor && !['Denied', 'Not Started'].includes(stage) && (!e.associateMode || e.associateMode === 'Unverified')) gaps.push({ enrId: e.id, who, msg: 'Supervised provider: associate billing mode not verified with this payer' })
  })

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
    const bgColor     = isExpired || isCritical ? 'rgba(239,68,68,.035)' : isWarning ? 'rgba(245,158,11,.035)' : 'rgba(21,101,192,.035)'

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
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                // Mark all alerts resolved by dismissing via onMarkDone for each provider
                items.forEach(a => onMarkDone?.(a.p?.id, a.field))
              }}
            >
              Mark all resolved
            </button>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Expired', count: expired.length, color: 'var(--danger)', bg: 'rgba(239,68,68,.08)', tab: 'Critical' },
            { label: 'Critical (≤30d)', count: critical.length, color: 'var(--danger)', bg: 'rgba(239,68,68,.08)', tab: 'Critical' },
            { label: 'Warnings (31–60d)', count: warning.length, color: 'var(--warning)', bg: 'rgba(245,158,11,.08)', tab: 'Warnings' },
            { label: 'Notices (61–90d)', count: info.length, color: 'var(--pr)', bg: 'rgba(21,101,192,.08)', tab: 'Information' },
          ].map((kpi, i) => (
            <div
              key={i}
              onClick={() => setActiveTab(kpi.tab)}
              style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = kpi.color}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
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

      {activeTab === 'Enrollments' ? (
        <div>
          {enrItems.length === 0 && gaps.length === 0 && (
            <div className="empty-state"><div className="empty-state-title">Nothing due</div><div className="empty-state-desc">No enrollment follow-ups, recredentialing dates or data gaps.</div></div>
          )}
          {enrItems.map((a, i) => (
            <div key={`e${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{a.title}</div>
                <div style={{ fontSize: 12, color: a.sev === 'expired' || a.sev === 'critical' ? 'var(--red)' : 'var(--text-3)' }}>{a.sub}</div>
              </div>
              <button className="btn btn-sm btn-secondary" onClick={() => onOpenEnrollment?.(a.enrId)}>Open enrollment</button>
            </div>
          ))}
          {gaps.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: 'var(--text-4)', margin: '18px 0 8px' }}>Data gaps ({gaps.length})</div>
              {gaps.map((g, i) => (
                <div key={`g${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 6, background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 'var(--r)' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-2)' }}><strong style={{ color: 'var(--text-1)' }}>{g.who}</strong> — {g.msg}</div>
                  <button className="btn btn-sm btn-secondary" onClick={() => onOpenEnrollment?.(g.enrId)}>Fix</button>
                </div>
              ))}
            </>
          )}
        </div>
      ) : filtered.length > 0 ? (
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
