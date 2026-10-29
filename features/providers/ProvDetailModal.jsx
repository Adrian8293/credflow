/**
 * ProvDetailModal.jsx — LACentra v5.0
 *
 * Self-contained provider command center.
 * Eliminates WorkflowOverhaul.jsx dependency for the main content — that file
 * uses stale CSS tokens (--ink, --surface, --primary) incompatible with v5.
 *
 * Tabs: Overview · Credentials · Enrollments · Tasks · Documents
 * Header: Avatar · Name · Status · Readiness ring · Action buttons
 */

import { safeUrl } from '../../lib/safeUrl.js'
import { useState } from 'react'
import { DocViewerModal } from '../documents/DocViewerModal.jsx'
import { daysUntil, fmtDate, fmtTS } from '../../lib/helpers.js'
import OpcaUploadPanel from '../../components/OpcaUploadPanel'
import { LicensesSection } from './LicensesSection.jsx'
import { RenewCredentialModal } from './RenewCredentialModal.jsx'
import { openPacketWindow } from '../../lib/packet.js'
import { AvatarImg } from '../../components/ui/AvatarImg'
import { lifecycleOf } from '../../lib/lifecycle.js'

// ─── SPECIALTY COLOR MAP ───────────────────────────────────────────────────────
const SPEC_COLORS = {
  'Mental Health':        '#3563c9',
  'Massage Therapy':      '#1a8a7a',
  'Naturopathic':         '#6d3fb5',
  'Chiropractic':         '#c97d1e',
  'Acupuncture':          '#b8292e',
  'Licensed Psychologist':'#0891b2',
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
const I = {
  close:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  edit:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  plus:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  sync:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>,
  alert:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  check:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  doc:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  ext:    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  opca:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
}

// ─── READINESS RING ───────────────────────────────────────────────────────────
function ReadinessRing({ score, size = 68 }) {
  const r    = (size / 2) - 5
  const circ = 2 * Math.PI * r
  const fill = circ * (score / 100)
  const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)'
  const cx   = size / 2
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--elevated)" strokeWidth="5" />
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 8, color: 'var(--text-4)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>Ready</span>
      </div>
    </div>
  )
}

// ─── READINESS SCORE ──────────────────────────────────────────────────────────
function readinessScore(prov) {
  let score = 100
  if (!prov.npi)                                                     score -= 20
  const licD = daysUntil(prov.licenseExp)
  if (licD === null || licD < 0)                                     score -= 25
  else if (licD <= 30)                                               score -= 10
  const malD = daysUntil(prov.malExp)
  if (malD === null || malD < 0)                                     score -= 25
  else if (malD <= 30)                                               score -= 10
  const caqhD = daysUntil(prov.caqhDue)
  if (caqhD === null || caqhD < 0)                                   score -= 15
  return Math.max(0, score)
}

// ─── CREDENTIAL CARD ──────────────────────────────────────────────────────────
function CredCard({ label, value, expDate, mono, editAction, actionLabel = 'Update' }) {
  if (!value && !expDate) return null
  const days = daysUntil(expDate)
  const isExpired  = days !== null && days < 0
  const isCritical = days !== null && days >= 0 && days <= 14
  const isWarning  = days !== null && days >= 15 && days <= 60
  const accentColor = isExpired || isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : expDate ? 'var(--success)' : 'var(--border-mid)'
  const badgeCls    = isExpired ? 'b-red' : isCritical ? 'b-red' : isWarning ? 'b-amber' : expDate ? 'b-green' : 'b-gray'
  const badgeText   = days === null ? null
    : days < 0  ? `Expired ${Math.abs(days)}d ago`
    : days === 0 ? 'Expires today'
    : `${days}d remaining`

  return (
    <div style={{
      background: 'var(--elevated)', border: `1.5px solid var(--border)`,
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: 'var(--r-lg)', padding: '12px 14px',
      transition: 'border-color var(--t)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 5 }}>
        {label}
      </div>
      {value && (
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
          fontFamily: mono ? 'var(--fn-mono)' : 'var(--fn)',
          marginBottom: badgeText ? 7 : 0,
          wordBreak: 'break-all',
        }}>
          {value}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {expDate && <div style={{ fontSize: 11, color: 'var(--text-4)' }}>Exp: {fmtDate(expDate)}</div>}
        {badgeText && <span className={`badge ${badgeCls}`} style={{ fontSize: 10 }}>{badgeText}</span>}
        {editAction && (
          <button onClick={editAction} style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--pr)', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
            {actionLabel} {I.ext}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── ENROLLMENT CARD ──────────────────────────────────────────────────────────
function EnrollmentCard({ e, payers, openEnrollModal }) {
  const payer   = payers.find(p => p.id === e.payId || p.id === e.payerId)
  const payerName = payer?.name || '—'
  const stageMap = {
    'Active': 'b-green', 'Approved': 'b-green',
    'Denied': 'b-red', 'Rejected': 'b-red',
    'Additional Info Requested': 'b-red',
    'Pending Verification': 'b-amber', 'Awaiting CAQH': 'b-amber', 'On Hold': 'b-amber',
    'Under Review': 'b-blue', 'In Credentialing': 'b-blue',
    'Application Submitted': 'b-blue', 'Submitted': 'b-blue',
  }
  const isActive   = ['Active', 'Approved'].includes(e.stage)
  const fuDays     = daysUntil(e.followup || e.followUp)
  const fuUrgent   = fuDays !== null && fuDays <= 3
  const submittedDays = e.submitted ? Math.abs(daysUntil(e.submitted)) : null

  return (
    <div style={{
      background: 'var(--elevated)', border: '1.5px solid var(--border)',
      borderRadius: 'var(--r-lg)', padding: '13px 15px', marginBottom: 8,
      borderLeft: `3px solid ${isActive ? 'var(--success)' : 'var(--border-mid)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{payerName}</div>
          {e.appId && <div style={{ fontSize: 11, fontFamily: 'var(--fn-mono)', color: 'var(--text-4)' }}>{e.appId}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <span className={`badge ${stageMap[e.stage] || 'b-gray'}`} style={{ fontSize: 10.5 }}>{e.stage}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--text-4)', flexWrap: 'wrap', marginBottom: 8 }}>
        {e.submitted && <span>Submitted: {fmtDate(e.submitted)}{submittedDays ? ` (${submittedDays}d ago)` : ''}</span>}
        {e.effectiveDate && <span style={{ color: 'var(--success)' }}>Effective: {fmtDate(e.effectiveDate)}</span>}
        {(e.followup || e.followUp) && (
          <span style={{ color: fuUrgent ? 'var(--danger)' : 'var(--text-4)', fontWeight: fuUrgent ? 700 : 400 }}>
            Follow-up: {fmtDate(e.followup || e.followUp)}
            {fuDays !== null && fuDays <= 7 && ` (${fuDays <= 0 ? 'overdue' : `${fuDays}d`})`}
          </span>
        )}
      </div>

      {e.notes && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--card)', borderRadius: 'var(--r)', padding: '7px 10px', marginBottom: 8, borderLeft: '2px solid var(--border-mid)', lineHeight: 1.5 }}>
          {e.notes}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => openEnrollModal(e.id)}>
          Edit application
        </button>
      </div>
    </div>
  )
}

// ─── TASK ROW ─────────────────────────────────────────────────────────────────
function TaskRow({ t }) {
  const days = daysUntil(t.due)
  const overdue  = days !== null && days < 0
  const urgent   = days !== null && days >= 0 && days <= 3
  const accentColor = overdue || t.priority === 'Urgent' ? 'var(--danger)'
    : urgent || t.priority === 'High' ? 'var(--warning)' : 'var(--pr)'

  const dueLabel = days === null ? 'No due date'
    : days < 0  ? `${Math.abs(days)}d overdue`
    : days === 0 ? 'Due today'
    : `Due in ${days}d`

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', background: 'var(--elevated)',
      border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)',
      borderLeft: `3px solid ${accentColor}`, marginBottom: 7,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.task || t.title || t.text}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-4)', display: 'flex', gap: 8 }}>
          {t.cat && <span>{t.cat}</span>}
          {t.priority && <span>· {t.priority}</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: overdue ? 'var(--danger)' : urgent ? 'var(--warning)' : 'var(--text-4)' }}>
          {dueLabel}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {t.status || 'Open'}
        </div>
      </div>
    </div>
  )
}

// ─── SECTION EYEBROW ─────────────────────────────────────────────────────────
function SectionEyebrow({ label }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10, marginTop: 4 }}>
      {label}
    </div>
  )
}

// ─── OVERVIEW TAB ────────────────────────────────────────────────────────────
function OverviewTab({ prov, db, openEnrollModal }) {
  const payers      = db.payers || []
  const enrollments = (db.enrollments || []).filter(e => e.provId === prov.id)
  const tasks       = (db.tasks || []).filter(t => t.provId === prov.id && t.status !== 'Done')
  const activePanels = enrollments.filter(e => ['Active', 'Approved'].includes(e.stage))
  const inProgress   = enrollments.filter(e => !['Active', 'Approved', 'Denied', 'Rejected'].includes(e.stage))

  const expiryItems = [
    { label: 'State License',     date: prov.licenseExp, value: prov.license },
    { label: 'Malpractice',       date: prov.malExp,     value: prov.malCarrier },
    { label: 'DEA Registration',  date: prov.deaExp,     value: prov.dea },
    { label: 'CAQH Attestation',  date: prov.caqhDue,    value: prov.caqh },
    { label: 'Re-credentialing',  date: prov.recred,     value: 'Due' },
  ].filter(x => x.date).map(x => ({ ...x, days: daysUntil(x.date) })).sort((a, b) => a.days - b.days)

  const overdueCount    = expiryItems.filter(x => x.days < 0).length
  const criticalCount   = expiryItems.filter(x => x.days >= 0 && x.days <= 30).length
  const overdueTaskCount = tasks.filter(t => t.due && daysUntil(t.due) < 0).length

  return (
    <div className="grid-2" style={{ gap: 18, alignItems: 'start' }}>
      {/* Left column */}
      <div>
        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          {[
            { label: 'Active Panels', val: activePanels.length, color: 'var(--success)' },
            { label: 'In Progress',   val: inProgress.length,   color: 'var(--pr)'      },
            { label: 'Open Tasks',    val: tasks.length,         color: overdueTaskCount > 0 ? 'var(--danger)' : 'var(--text-4)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--elevated)', border: '1.5px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-.04em', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Active panels */}
        {activePanels.length > 0 && <>
          <SectionEyebrow label="Active Panels" />
          {activePanels.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--elevated)', border: '1.5px solid rgba(16,185,129,.2)', borderRadius: 'var(--r)', marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                {payers.find(p => p.id === (e.payId || e.payerId))?.name || '—'}
              </div>
              {e.effectiveDate && <div style={{ fontSize: 11, color: 'var(--text-4)' }}>Eff: {fmtDate(e.effectiveDate)}</div>}
              <span className="badge b-green" style={{ fontSize: 10 }}>Active</span>
            </div>
          ))}
        </>}

        {/* In progress */}
        {inProgress.length > 0 && <>
          <SectionEyebrow label={`In Progress (${inProgress.length})`} />
          {inProgress.slice(0, 4).map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--elevated)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pr-solid)', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {payers.find(p => p.id === (e.payId || e.payerId))?.name || '—'}
              </div>
              <span className="badge b-blue" style={{ fontSize: 10 }}>{e.stage}</span>
            </div>
          ))}
          {inProgress.length > 4 && <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '4px 0' }}>+{inProgress.length - 4} more…</div>}
        </>}

        {activePanels.length === 0 && inProgress.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-4)', background: 'var(--elevated)', borderRadius: 'var(--r-lg)', border: '1.5px dashed var(--border)' }}>
            No enrollments yet.
            <button onClick={() => openEnrollModal(null, prov.id)} style={{ display: 'block', margin: '8px auto 0', fontSize: 12, color: 'var(--pr)', fontWeight: 600, cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'inherit' }}>
              + Create first enrollment
            </button>
          </div>
        )}
      </div>

      {/* Right column */}
      <div>
        {/* Credential summary */}
        <SectionEyebrow label={`Credential Status${overdueCount > 0 ? ` — ${overdueCount} expired` : criticalCount > 0 ? ` — ${criticalCount} expiring soon` : ''}`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {expiryItems.length === 0
            ? <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>No expiry dates recorded.</div>
            : expiryItems.map((x, i) => {
              const expired  = x.days < 0
              const critical = x.days >= 0 && x.days <= 14
              const warning  = x.days >= 15 && x.days <= 60
              const color    = expired || critical ? 'var(--danger)' : warning ? 'var(--warning)' : 'var(--success)'
              const bg       = expired || critical ? 'rgba(239,68,68,.06)' : warning ? 'rgba(245,158,11,.06)' : 'rgba(16,185,129,.06)'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: bg, border: `1.5px solid ${expired || critical ? 'rgba(239,68,68,.2)' : warning ? 'rgba(245,158,11,.2)' : 'rgba(16,185,129,.15)'}`, borderRadius: 'var(--r)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)' }}>{x.label}</div>
                  <div style={{ fontSize: 11.5, color, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {expired ? `${Math.abs(x.days)}d expired` : x.days === 0 ? 'Today' : `${x.days}d`}
                  </div>
                </div>
              )
            })
          }
        </div>

        {/* Open tasks */}
        <SectionEyebrow label={`Open Tasks (${tasks.length})`} />
        {tasks.length === 0
          ? <div style={{ fontSize: 12.5, color: 'var(--text-4)' }}>No open tasks.</div>
          : tasks.slice(0, 4).map(t => <TaskRow key={t.id} t={t} />)
        }
        {tasks.length > 4 && <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 4 }}>+{tasks.length - 4} more tasks…</div>}

        {/* Provider info */}
        <div style={{ marginTop: 18 }}>
          <SectionEyebrow label="Contact" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { l: 'Email',    v: prov.email },
              { l: 'Phone',    v: prov.phone },
              { l: 'Address',  v: prov.address },
              { l: 'Supervisor', v: prov.supervisor },
            ].filter(x => x.v).map(x => (
              <div key={x.l} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                <span style={{ color: 'var(--text-4)', minWidth: 72 }}>{x.l}</span>
                <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{x.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CREDENTIALS TAB ─────────────────────────────────────────────────────────
function CredentialsTab({ prov, db, onEdit, onRenew, onSaveLicense, onDeleteLicense }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* State licenses: primary + every additional state */}
      <LicensesSection prov={prov} db={db} onEditPrimary={onEdit} onSave={onSaveLicense} onDelete={onDeleteLicense} />

      {/* Other credentials & expiry */}
      <div>
        <SectionEyebrow label="Other Credentials & Expiry Dates" />
        <div className="grid-2" style={{ gap: 10 }}>
          <CredCard label="NPI Number"          value={prov.npi}        mono editAction={onEdit} />
          <CredCard label="Malpractice Carrier" value={prov.malCarrier} />
          <CredCard label="Malpractice Policy"  value={prov.malPolicy}  expDate={prov.malExp} editAction={() => onRenew({ kind: 'malpractice' })} actionLabel="Renew" />
          <CredCard label="DEA Registration #"  value={prov.dea}        expDate={prov.deaExp} mono editAction={() => onRenew({ kind: 'dea' })} actionLabel="Renew" />
          <CredCard label="Re-credentialing Due" value={prov.recred ? 'Scheduled' : null} expDate={prov.recred} editAction={() => onRenew({ kind: 'recred' })} actionLabel="Renew" />
        </div>
      </div>

      {/* IDs & identifiers */}
      <div>
        <SectionEyebrow label="IDs & Identifiers" />
        <div className="grid-2" style={{ gap: 10 }}>
          <CredCard label="CAQH ID"            value={prov.caqh}     expDate={prov.caqhDue} mono editAction={() => onRenew({ kind: 'caqh' })} actionLabel="Attest" />
          <CredCard label="Medicare PTAN"      value={prov.ptan}     mono />
          <CredCard label="Medicaid / DMAP ID" value={prov.medicaid} mono />
          {prov.supervisor && <CredCard label="Supervising Provider" value={prov.supervisor} />}
        </div>
        {!prov.caqh && !prov.medicaid && !prov.ptan && (
          <div style={{ fontSize: 12.5, color: 'var(--text-4)', marginTop: 8 }}>
            No IDs on file — add CAQH, Medicaid, or PTAN via Edit Provider or sync from NPPES.
          </div>
        )}
      </div>

      {/* NPPES taxonomy */}
      {(prov.taxonomyDesc || prov.taxonomyCode || prov.focus) && (
        <div>
          <SectionEyebrow label="NPPES Taxonomy" />
          <div className="grid-2" style={{ gap: 10 }}>
            {prov.taxonomyCode && <CredCard label="Taxonomy Code"        value={prov.taxonomyCode} mono />}
            {(prov.taxonomyDesc || prov.focus) && <CredCard label="Taxonomy Description" value={prov.taxonomyDesc || prov.focus} />}
            {prov.licenseState && <CredCard label="License State"        value={prov.licenseState} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ENROLLMENTS TAB ─────────────────────────────────────────────────────────
function EnrollmentsTab({ prov, db, openEnrollModal }) {
  const all       = (db.enrollments || []).filter(e => e.provId === prov.id)
  const active    = all.filter(e => ['Active', 'Approved'].includes(e.stage))
  const progress  = all.filter(e => !['Active', 'Approved', 'Denied', 'Rejected'].includes(e.stage))
  const closed    = all.filter(e => ['Denied', 'Rejected'].includes(e.stage))

  if (all.length === 0) return (
    <div className="empty-state">
      <div className="ei">📋</div>
      <h4>No enrollments yet</h4>
      <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: '4px 0 14px' }}>Create the first enrollment for this provider.</p>
      <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal(null, prov.id)}>{I.plus} New Enrollment</button>
    </div>
  )

  return (
    <div>
      {active.length > 0 && <>
        <SectionEyebrow label={`Active Panels (${active.length})`} />
        {active.map(e => <EnrollmentCard key={e.id} e={e} payers={db.payers} openEnrollModal={openEnrollModal} />)}
      </>}
      {progress.length > 0 && <>
        <SectionEyebrow label={`In Progress (${progress.length})`} />
        {progress.map(e => <EnrollmentCard key={e.id} e={e} payers={db.payers} openEnrollModal={openEnrollModal} />)}
      </>}
      {closed.length > 0 && <>
        <SectionEyebrow label={`Closed / Denied (${closed.length})`} />
        {closed.map(e => <EnrollmentCard key={e.id} e={e} payers={db.payers} openEnrollModal={openEnrollModal} />)}
      </>}
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal(null, prov.id)}>
          {I.plus} Add enrollment
        </button>
      </div>
    </div>
  )
}

// ─── TASKS TAB ────────────────────────────────────────────────────────────────
function TasksTab({ prov, db }) {
  const tasks = (db.tasks || []).filter(t => t.provId === prov.id)
  const open  = tasks.filter(t => t.status !== 'Done')
  const done  = tasks.filter(t => t.status === 'Done')

  if (tasks.length === 0) return (
    <div className="empty-state">
      <div className="ei">✓</div>
      <h4>No tasks</h4>
      <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: 0 }}>All clear for this provider.</p>
    </div>
  )
  return (
    <div>
      {open.length > 0 && <>
        <SectionEyebrow label={`Open (${open.length})`} />
        {open.sort((a, b) => {
          const da = daysUntil(a.due) ?? 999
          const db_ = daysUntil(b.due) ?? 999
          return da - db_
        }).map(t => <TaskRow key={t.id} t={t} />)}
      </>}
      {done.length > 0 && <>
        <SectionEyebrow label={`Completed (${done.length})`} />
        {done.slice(0, 5).map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--elevated)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 6, opacity: .6 }}>
            <span style={{ color: 'var(--success)', display: 'flex' }}>{I.check}</span>
            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'line-through' }}>{t.task || t.title || t.text}</div>
          </div>
        ))}
      </>}
    </div>
  )
}

// ─── DOCUMENTS TAB ────────────────────────────────────────────────────────────
function DocumentsTab({ prov, db, onAddDocument }) {
  const docs = (db.documents || []).filter(d => d.provId === prov.id)
  const [viewing, setViewing] = useState(null)
  const addBtn = onAddDocument && (
    <div style={{ marginBottom: 14 }}>
      <button type="button" className="btn btn-secondary" onClick={() => onAddDocument(prov.id)}>+ Add document</button>
    </div>
  )

  if (docs.length === 0) return (
    <div className="empty-state">
      <div className="ei">📁</div>
      <h4>No documents on file</h4>
      <p style={{ fontSize: 12.5, color: 'var(--text-4)', margin: '4px 0 14px' }}>Add a license, malpractice policy, W-9 or any other file for this provider.</p>
      {onAddDocument && <button type="button" className="btn btn-primary" onClick={() => onAddDocument(prov.id)}>+ Add document</button>}
    </div>
  )

  const byType = docs.reduce((acc, d) => {
    const k = d.type || d.docType || 'Other'
    if (!acc[k]) acc[k] = []
    acc[k].push(d)
    return acc
  }, {})

  return (
    <div>
      {addBtn}
      {Object.entries(byType).map(([type, list]) => (
        <div key={type} style={{ marginBottom: 18 }}>
          <SectionEyebrow label={type} />
          {list.map(d => {
            const days = daysUntil(d.exp)
            const expired  = days !== null && days < 0
            const warning  = days !== null && days >= 0 && days <= 60
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', background: 'var(--elevated)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-4)', display: 'flex' }}>{I.doc}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{d.name || d.fileName || 'Document'}</div>
                  {d.exp && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>Expires {fmtDate(d.exp)}</div>}
                </div>
                {days !== null && (
                  <span className={`badge ${expired ? 'b-red' : warning ? 'b-amber' : 'b-green'}`} style={{ fontSize: 10 }}>
                    {expired ? `${Math.abs(days)}d ago` : `${days}d left`}
                  </span>
                )}
                {(d.filePath || d.fileUrl) && (
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setViewing(d)}>View file</button>
                )}
                {safeUrl(d.url) && (
                  <a href={safeUrl(d.url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--pr)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                    View {I.ext}
                  </a>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {viewing && <DocViewerModal doc={viewing} db={db} onClose={() => setViewing(null)} />}
    </div>
  )
}

// ─── JOURNEY: where the provider is, and the one thing to do next ──────────────
function JourneyPanel({ lc, onNext }) {
  const { steps, index, state, next, done } = lc
  return (
    <div style={{ width: '100%', paddingBottom: 12 }}>
      <div className="journey-head">
        <span className="journey-now">{state === 'Inactive' ? 'Inactive' : state}</span>
        {index >= 0 && <span className="journey-count">Step {index + 1} of {steps.length}</span>}
      </div>
      <ol className="journey-bar" aria-label="Credentialing journey" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((s, i) => {
          const here = s === state, past = index >= 0 && i < index
          return (
            <li key={s} aria-current={here ? 'step' : undefined} title={s}
              className={`journey-seg${here ? ' is-here' : past ? ' is-past' : ''}`}>
              <span className="sr-only">{s}{here ? ' (current)' : past ? ' (done)' : ''}</span>
            </li>
          )
        })}
      </ol>
      {state === 'Inactive' && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 6 }}>This provider is inactive, so the journey is paused.</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 8, padding: '9px 12px', borderRadius: 8, background: done ? 'var(--green-l)' : 'var(--elevated)', border: `1px solid ${done ? 'var(--green-b, var(--border))' : 'var(--border)'}` }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{done ? 'All caught up' : 'Next step'}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{next.label}</div>
          {next.detail && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{next.detail}</div>}
        </div>
        {next.kind !== 'none' && <button type="button" className="btn btn-primary btn-sm" onClick={onNext}>{NEXT_BUTTON[next.kind]}</button>}
      </div>
    </div>
  )
}
const NEXT_BUTTON = { edit: 'Edit provider', renew: 'Record renewal', enroll: 'New application', enrollment: 'Open application' }

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
export function ProvDetailModal({ prov, db, onClose, editProvider, openEnrollModal, toast, syncFromNPPES, onSaveLicense, onDeleteLicense, onRenewCredential, onSyncRenewalDocument, onAddDocument, staff, userId, onAssign }) {
  const [renew, setRenew] = useState(null)   // { kind, license? } — which credential is being renewed
  const [tab, setTab] = useState('overview')

  if (!prov) return null

  const sc        = SPEC_COLORS[prov.spec] || '#4f7ef8'
  const ini       = ((prov.fname || '')[0] || '') + ((prov.lname || '')[0] || '')
  const score     = readinessScore(prov)
  const payers    = db.payers || []

  const enrollments = (db.enrollments || []).filter(e => e.provId === prov.id)
  const tasks       = (db.tasks      || []).filter(t => t.provId === prov.id && t.status !== 'Done')
  const documents   = (db.documents  || []).filter(d => d.provId === prov.id)

  // ── Build credential alerts ─────────────────────────────────────────────────
  const lifecycle = lifecycleOf(prov, db)
  function doNext() {
    const n = lifecycle.next
    if (n.kind === 'edit') editProvider?.(prov.id)
    else if (n.kind === 'renew') setRenew({ kind: n.target })
    else if (n.kind === 'enroll') openEnrollModal(null, prov.id)
    else if (n.kind === 'enrollment') openEnrollModal(n.enrId)
  }
  const credAlerts = []
  const CRED_FIELDS = [
    { field: prov.licenseExp, label: `State License${prov.licenseState ? ` (${prov.licenseState})` : ''}`, target: { kind: 'license' } },
    ...(db.licenses || []).filter(l => l.provId === prov.id && l.status !== 'Inactive').map(l => ({ field: l.expires, label: `${l.state} License`, target: { kind: 'extraLicense', license: l } })),
    { field: prov.malExp,     label: 'Malpractice Insurance', target: { kind: 'malpractice' } },
    { field: prov.deaExp,     label: 'DEA Registration', target: { kind: 'dea' } },
    { field: prov.caqhDue,   label: 'CAQH Attestation', target: { kind: 'caqh' } },
  ]
  CRED_FIELDS.forEach(({ field, label, target }) => {
    const d = daysUntil(field)
    if (d === null) return
    if (d < 0) credAlerts.push({ label: `${label} EXPIRED ${Math.abs(d)}d ago`, sev: 'error', target })
    else if (d <= 30) credAlerts.push({ label: `${label} expires in ${d} day${d !== 1 ? 's' : ''}`, sev: 'warn', target })
  })

  const TABS = [
    { id: 'overview',     label: 'Overview'     },
    { id: 'credentials',  label: 'Credentials'  },
    { id: 'enrollments',  label: `Enrollments${enrollments.length ? ` (${enrollments.length})` : ''}` },
    { id: 'tasks',        label: `Tasks${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'documents',    label: `Documents${documents.length ? ` (${documents.length})` : ''}` },
    { id: 'opca',         label: 'OPCA Form'    },
  ]

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} aria-hidden="true" />
      <div className="drawer-xl" role="dialog" aria-modal="true" aria-label={`Provider profile: ${prov.fname} ${prov.lname}`}>

        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div className="drawer-header" style={{ paddingBottom: 0, borderBottom: 'none', flexDirection: 'column', gap: 0 }}>

          {/* Top row: identity + actions + close */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: '100%', paddingBottom: 14 }}>
            {/* Avatar */}
            <div style={{ width: 54, height: 54, borderRadius: 14, background: sc, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', overflow: 'hidden' }}>
              {prov.avatarUrl
                ? <AvatarImg src={prov.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                : ini}
            </div>

            {/* Name + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--fn-display)', fontSize: 17, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>
                {prov.fname} {prov.lname}{prov.cred ? `, ${prov.cred}` : ''}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-4)', marginBottom: 7 }}>
                {prov.spec}{prov.focus || prov.taxonomyDesc ? ` · ${prov.focus || prov.taxonomyDesc}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`badge ${prov.status === 'Active' ? 'b-green' : prov.status === 'Inactive' ? 'b-gray' : 'b-amber'}`}>
                  {prov.status || 'Unknown'}
                </span>
                {prov.npi      && <span className="info-chip">NPI {prov.npi}</span>}
                {prov.caqh     && <span className="info-chip">CAQH {prov.caqh}</span>}
                {prov.ptan     && <span className="info-chip">PTAN {prov.ptan}</span>}
                {staff?.length > 0 && 'assigneeId' in prov && onAssign && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}>
                    Owner
                    <select className="filter-select" style={{ height: 28, fontSize: 12.5 }} value={prov.assigneeId} onChange={e => onAssign(prov.id, e.target.value)}>
                      <option value="">Unassigned</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.id === userId ? 'Me' : (s.email || '').split('@')[0]}</option>)}
                      {prov.assigneeId && !staff.some(s => s.id === prov.assigneeId) && <option value={prov.assigneeId}>Former team member</option>}
                    </select>
                  </label>
                )}
                {tasks.length > 0 && <span className="badge b-red">{tasks.length} open task{tasks.length !== 1 ? 's' : ''}</span>}
                {credAlerts.filter(a => a.sev === 'error').length > 0 && (
                  <span className="badge b-red">{credAlerts.filter(a => a.sev === 'error').length} expired</span>
                )}
              </div>
            </div>

            <span className="prof-ring"><ReadinessRing score={score} size={64} /></span>

            {/* Actions */}
            <div className="prof-actions" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal(null, prov.id)} style={{ gap: 5 }}>
                {I.plus} Enrollment
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => editProvider?.(prov.id)} style={{ gap: 5 }}>
                {I.edit} Edit
              </button>
              <button className="btn btn-secondary btn-sm" style={{ gap: 5 }} title="Open a printable credentialing packet (print or save as PDF)"
                onClick={() => { if (!openPacketWindow(prov, db, db.settings?.practice)) toast?.('Your browser blocked the packet window — allow pop-ups for this site and try again.', 'error') }}>
                Packet
              </button>
              {syncFromNPPES && prov.npi && (
                <button className="btn btn-ghost btn-sm" onClick={() => syncFromNPPES(prov.id)} title="Sync latest NPPES data" style={{ gap: 5, color: 'var(--pr)' }}>
                  {I.sync} Sync NPPES
                </button>
              )}
              <button className="modal-close" onClick={onClose} aria-label="Close provider profile">{I.close}</button>
            </div>
          </div>

          <JourneyPanel lc={lifecycle} onNext={doNext} />

          {/* Alert strip */}
          {credAlerts.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 5, paddingBottom: 12 }}>
              {credAlerts.map((a, i) => (
                <div key={i} className={`alert-item ${a.sev === 'error' ? 'al-red' : 'al-amber'}`} style={{ margin: 0 }}>
                  <span className="al-icon" style={{ display: 'flex' }}>{I.alert}</span>
                  <div className="al-body">
                    <div className="al-title" style={{ fontSize: 12.5 }}>{a.label}</div>
                  </div>
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0, background: a.sev === 'error' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)', color: a.sev === 'error' ? 'var(--danger)' : 'var(--amber-d)', borderColor: a.sev === 'error' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)' }}
                    onClick={() => (a.target ? setRenew(a.target) : editProvider?.(prov.id))}
                  >
                    Renew →
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <div className="prof-tabs" role="tablist" style={{ display: 'flex', borderBottom: '1.5px solid var(--border)', width: '100%', overflowX: 'auto' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '9px 16px', cursor: 'pointer', fontSize: 12.5, fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? 'var(--pr)' : 'var(--text-4)',
                  borderBottom: `2.5px solid ${tab === t.id ? 'var(--pr)' : 'transparent'}`,
                  background: 'none', border: 'none', borderBottom: `2.5px solid ${tab === t.id ? 'var(--pr)' : 'transparent'}`,
                  marginBottom: -1.5, transition: 'all .14s', whiteSpace: 'nowrap', fontFamily: 'inherit', cursor: 'pointer',
                }}
                aria-selected={tab === t.id}
                role="tab"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable body ────────────────────────────────────────────── */}
        <div className="drawer-body" role="tabpanel">
          {tab === 'overview'    && <OverviewTab     prov={prov} db={db} openEnrollModal={openEnrollModal} />}
          {tab === 'credentials' && <CredentialsTab  prov={prov} db={db} onEdit={() => editProvider?.(prov.id)} onRenew={setRenew} onSaveLicense={onSaveLicense} onDeleteLicense={onDeleteLicense} />}
          {tab === 'enrollments' && <EnrollmentsTab  prov={prov} db={db} openEnrollModal={openEnrollModal} />}
          {tab === 'tasks'       && <TasksTab        prov={prov} db={db} />}
          {tab === 'documents'   && <DocumentsTab    prov={prov} db={db} onAddDocument={onAddDocument} />}
          {tab === 'opca'        && <OpcaUploadPanel provider={{ id: prov.id, fname: prov.fname, lname: prov.lname }} onComplete={() => toast?.('OPCA profile saved!', 'success')} />}
        </div>

      </div>
      {renew && (
        <RenewCredentialModal
          prov={prov}
          target={renew}
          onClose={() => setRenew(null)}
          onSave={(patch, label) => onRenewCredential?.(prov.id, patch, label)}
          onSaveLicense={onSaveLicense}
          onSyncDocument={(meta, file) => onSyncRenewalDocument?.(prov.id, meta, file)}
        />
      )}
    </>
  )
}

export default ProvDetailModal
