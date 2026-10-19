/**
 * Reports.jsx — Lacentra
 * Analytics overview with KPI metrics, charts, trend reporting,
 * application breakdowns, provider stats, payer analysis, turnaround time.
 */

import { downloadCsv as saveCsv } from '../../lib/csv.js'
import { useState } from 'react'
import { payName, getProviderAlerts } from '../../lib/helpers.js'
import { Badge, StageBadge } from '../../components/ui/Badge.jsx'
import { STATUS_COLOR } from '../../constants/stages.js'
import { DataQuality } from './DataQuality.jsx'
import { dataQualityIssues } from '../../lib/dataQuality.js'
import { PERIODS, inPeriod, inPreviousPeriod, turnaroundStats, monthlySubmissions, complianceStats, caqhOnTime, followupCoverage, toCsv } from '../../lib/reportStats.js'

const Icon = {
  chart:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  shield:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  check:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  payers:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  users:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  file:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  calendar: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  clock:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  bolt:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  archive:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  trend:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
}

const COLORS = ['#1565C0','#10B981','#F59E0B','#7C3AED','#EF4444','#0891B2','#E11D48','#0D9488']

function SH({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--pr)' }}>{icon}</span>
      <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
    </div>
  )
}

function BigStat({ value, suffix = '%', color = 'var(--pr)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 6 }}>
      <span style={{ fontSize: 40, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-2px' }}>{value}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color }}>{suffix}</span>
    </div>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 6, background: 'var(--elevated)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-l)' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 4, transition: 'width .5s ease' }} />
    </div>
  )
}

// Inline bar chart
function BarChart({ data, maxVal, colorFn }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, paddingBottom: 20, position: 'relative' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '80%', background: colorFn ? colorFn(i) : 'var(--pr)', borderRadius: '4px 4px 0 0', height: `${maxVal > 0 ? (d.val / maxVal) * 75 : 0}px`, minHeight: d.val > 0 ? 3 : 0, transition: 'height .4s' }} />
          <div style={{ fontSize: 8.5, color: 'var(--text-4)', marginTop: 4, whiteSpace: 'nowrap', position: 'absolute', bottom: 0 }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

// Donut ring
function MiniDonut({ data, total }) {
  const r = 34; const circ = 2 * Math.PI * r; let offset = 0
  const slices = data.map((d, i) => {
    const pct = total > 0 ? (d.val / total) * circ : 0
    const s = { ...d, color: COLORS[i % COLORS.length], pct, offset }
    offset += pct; return s
  })
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
      {total === 0 ? <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="10" /> :
        slices.map((s, i) => (
          <circle key={i} cx="40" cy="40" r={r} fill="none" stroke={s.color} strokeWidth="10"
            strokeDasharray={`${s.pct} ${circ - s.pct}`} strokeDashoffset={-s.offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
        ))}
      <text x="40" y="45" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text-1)">{total}</text>
    </svg>
  )
}

const TABS = ['Overview', 'Applications', 'Providers', 'Payers', 'Turnaround Time', 'Data Quality']
const EXPORT_CARDS = [
  { id: 'roster',   icon: Icon.users,    title: 'Provider Roster',    desc: 'All providers with license & expiry details (CSV)' },
  { id: 'enroll',   icon: Icon.file,     title: 'Enrollment Status',  desc: 'All payer enrollments by current stage (CSV)' },
  { id: 'expiring', icon: Icon.calendar, title: 'Expiration Report',  desc: 'Credentials expiring within 90 days (CSV)' },
  { id: 'tasks',    icon: Icon.bolt,     title: 'Open Tasks',         desc: 'All pending and in-progress tasks (CSV)' },
  { id: 'backup',   icon: Icon.archive,  title: 'Full Data Backup',   desc: 'Export all Lacentra data as JSON' },
]

export function Reports({ db, exportJSON, onOpenProvider, onOpenEnrollment }) {
  const [activeTab, setActiveTab] = useState('Overview')
  const [periodId, setPeriodId] = useState('365')
  const period = PERIODS.find(x => x.id === periodId) || PERIODS[1]

  // Feature 9: Excel export
  async function exportXLSX() {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      // Sheet 1: Providers
      const provRows = db.providers.map(p => ({
        'First Name':    p.fname || '',
        'Last Name':     p.lname || '',
        'Credential':    p.cred || '',
        'Specialty':     p.spec || '',
        'Status':        p.status || '',
        'NPI':           p.npi || '',
        'CAQH':          p.caqh || '',
        'License #':     p.license || '',
        'License Exp':   p.licenseExp || '',
        'Mal Carrier':   p.malCarrier || '',
        'Mal Exp':       p.malExp || '',
        'DEA #':         p.dea || '',
        'DEA Exp':       p.deaExp || '',
        'CAQH Due':      p.caqhDue || '',
        'Recred Due':    p.recred || '',
        'Sup Exp':       p.supExp || '',
        'Phone':         p.phone || '',
        'Email':         p.email || '',
        'Notes':         p.notes || '',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(provRows), 'Providers')

      // Sheet 2: Enrollments
      const enrRows = db.enrollments.map(e => {
        const prov = db.providers.find(p => p.id === e.provId)
        const payer = db.payers.find(p => p.id === e.payId)
        return {
          'App ID':        e.appId || `APP-${String(e.id||'').slice(-8).toUpperCase()}`,
          'Provider':      prov ? `${prov.fname} ${prov.lname}` : '—',
          'Credential':    prov?.cred || '',
          'Payer':         payer?.name || '—',
          'Payer ID':      payer?.payerId || '',
          'Stage':         e.stage || '',
          'Submitted':     e.submitted || '',
          'Effective':     e.effective || '',
          'Follow-up':     e.followup || '',
          'EFT':           e.eft || '',
          'ERA':           e.era || '',
          'Contract':      e.contract || '',
          'Notes':         e.notes || '',
          'Last Updated':  e.updated || '',
        }
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(enrRows), 'Enrollments')

      // Sheet 3: Alerts
      const alertRows = []
      const ALERT_FIELDS = [
        { f: 'licenseExp', l: 'License' },
        { f: 'malExp',     l: 'Malpractice Insurance' },
        { f: 'deaExp',     l: 'DEA Certificate' },
        { f: 'caqhDue',   l: 'CAQH Attestation' },
        { f: 'recred',    l: 'Recredentialing' },
        { f: 'supExp',    l: 'Supervision Agreement' },
      ]
      db.providers.forEach(p => {
        ALERT_FIELDS.forEach(c => {
          if (!p[c.f]) return
          const d = (() => {
            const now = new Date(); now.setHours(0,0,0,0)
            return Math.round((new Date(p[c.f]+'T00:00:00') - now) / 86400000)
          })()
          alertRows.push({
            'Provider':    `${p.fname} ${p.lname}`,
            'Credential':  p.cred || '',
            'Alert Type':  c.l,
            'Expiry Date': p[c.f],
            'Days':        d,
            'Status':      d < 0 ? 'Expired' : d <= 30 ? 'Critical' : d <= 60 ? 'Warning' : 'Notice',
          })
        })
      })
      alertRows.sort((a, b) => a.Days - b.Days)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(alertRows), 'Alerts')

      // Sheet 4: Tasks
      const taskRows = db.tasks.map(t => {
        const prov = db.providers.find(p => p.id === t.provId)
        return {
          'Task':      t.title || '',
          'Provider':  prov ? `${prov.fname} ${prov.lname}` : '—',
          'Status':    t.status || '',
          'Priority':  t.priority || '',
          'Due Date':  t.due || '',
          'Notes':     t.notes || '',
        }
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Tasks')

      const date = new Date().toISOString().split('T')[0]
      XLSX.writeFile(wb, `lacentra-report-${date}.xlsx`)
    } catch (err) {
      console.error('XLSX export error:', err)
      // Fallback to JSON export
      exportJSON()
    }
  }

  // ── Computed metrics (all real; applications are filtered by their Submitted date) ──
  const { compliant, total: liveProviders, pct: compliancePct } = complianceStats(db.providers)
  const complianceColor = compliancePct === null ? 'var(--text-4)' : compliancePct >= 80 ? 'var(--success)' : compliancePct >= 60 ? 'var(--warning)' : 'var(--danger)'

  const done = db.tasks.filter(t => t.status === 'Done').length
  const taskPct = db.tasks.length ? Math.round((done / db.tasks.length) * 100) : null
  const taskColor = taskPct === null ? 'var(--text-4)' : taskPct >= 80 ? 'var(--success)' : taskPct >= 50 ? 'var(--warning)' : 'var(--danger)'

  const periodEnr = db.enrollments.filter(e => inPeriod(e, period.days))
  const prevCount = db.enrollments.filter(e => inPreviousPeriod(e, period.days)).length
  const stages = {}
  periodEnr.forEach(e => { stages[e.stage] = (stages[e.stage] || 0) + 1 })
  const totalEnr = periodEnr.length
  const approvedEnr = periodEnr.filter(e => e.stage === 'Active').length
  const deniedEnr = periodEnr.filter(e => e.stage === 'Denied').length
  const denialRate = totalEnr > 0 ? Math.round((deniedEnr / totalEnr) * 100) : null
  const tat = turnaroundStats(periodEnr, db.payers)
  const caqh = caqhOnTime(db.providers)
  const follow = followupCoverage(db.enrollments)
  const delta = period.days !== null && prevCount > 0 ? Math.round(((totalEnr - prevCount) / prevCount) * 100) : null

  // Active panels by payer (current state, not period-filtered)
  const panels = {}
  db.enrollments.filter(e => e.stage === 'Active').forEach(e => {
    const name = payName(db.payers, e.payId) || 'Unknown'
    panels[name] = (panels[name] || 0) + 1
  })
  const maxPanels = Math.max(...Object.values(panels), 1)
  const dqCount = dataQualityIssues(db).length

  const weekData = monthlySubmissions(db.enrollments, 6)   // applications submitted per month, last 6 months
  const maxWeek = Math.max(...weekData.map(d => d.val), 1)

  const payerData = Object.entries(panels).slice(0, 5).map(([name, val]) => ({ label: name, val }))
  const payerTotal = payerData.reduce((a, b) => a + b.val, 0)

  // ── Exports (each card exports what its title says) ──
  const stamp = new Date().toISOString().split('T')[0]
  function downloadCsv(name, rows) {
    if (!rows.length) { window.alert('Nothing to export yet.'); return }
    saveCsv(`${name}-${stamp}.csv`, toCsv(rows))
  }
  const provName = (id) => { const p = db.providers.find(x => x.id === id); return p ? `${p.fname} ${p.lname}`.trim() : '' }
  function runExport(id) {
    if (id === 'backup') return exportJSON()
    if (id === 'roster') return downloadCsv('provider-roster', db.providers.map(p => ({ 'First Name': p.fname, 'Last Name': p.lname, Credential: p.cred, Specialty: p.spec, Status: p.status, NPI: p.npi, CAQH: p.caqh, 'License #': p.license, 'License State': p.licenseState, 'License Exp': p.licenseExp, 'Malpractice Exp': p.malExp, 'DEA Exp': p.deaExp, 'CAQH Due': p.caqhDue })))
    if (id === 'enroll') return downloadCsv('enrollment-status', db.enrollments.map(e => ({ Provider: provName(e.provId), Payer: payName(db.payers, e.payId), Type: e.level, Stage: e.stage, Submitted: e.submitted, 'Credentialing Effective': e.credentialingEffective, Effective: e.effective, 'Follow-up': e.followup })))
    if (id === 'expiring') {
      const rows = []
      db.providers.filter(p => p.status !== 'Inactive').forEach(p => getProviderAlerts(p, { alertDays: 90, caqhDays: 90 }).forEach(a => rows.push({ Provider: `${p.fname} ${p.lname}`.trim(), Item: a.label, 'Expires': p[a.field], 'Days Left': a.days })))
      return downloadCsv('expiration-report', rows.sort((a, b) => a['Days Left'] - b['Days Left']))
    }
    if (id === 'tasks') return downloadCsv('open-tasks', db.tasks.filter(t => t.status !== 'Done').map(t => ({ Task: t.task || t.title, Provider: provName(t.provId), Category: t.cat, Status: t.status, Due: t.due })))
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.03em', marginBottom: 3 }}>Reports</h2>
          <p style={{ fontSize: 13, color: 'var(--text-4)' }}>Analyze performance and credentialing metrics across Lacentra.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportXLSX} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {Icon.download} Export Excel (.xlsx)
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportJSON} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Export JSON
          </button>
        </div>
      </div>

      {/* Period (applies to applications, by their Submitted date) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500 }}>Applications submitted:</div>
        <select className="filter-select" style={{ fontSize: 12 }} value={periodId} onChange={e => setPeriodId(e.target.value)}>
          {PERIODS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>Provider, compliance and active-panel numbers always show today’s state.</span>
      </div>

      <div className="tabs">
        {TABS.map(t => <div key={t} className={`tab${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>{t}{t === 'Data Quality' && dqCount > 0 && <span style={{ marginLeft: 6, background: 'var(--danger)', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 20 }}>{dqCount}</span>}</div>)}
      </div>

      {activeTab === 'Overview' && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'Total Applications', val: totalEnr, note: delta === null ? null : `${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs previous ${period.label.toLowerCase().replace('last ', '')}`, up: delta === null || delta >= 0, color: 'var(--pr)' },
              { label: 'Active', val: approvedEnr, note: totalEnr ? `${Math.round(approvedEnr / totalEnr * 100)}% of applications` : null, up: true, color: 'var(--success)' },
              { label: 'Avg Days to Effective', val: tat.avgDays === null ? '—' : `${tat.avgDays}d`, note: tat.n ? `from ${tat.n} application${tat.n === 1 ? '' : 's'} with both dates` : 'needs Submitted + Effective dates', up: true, color: 'var(--warning)' },
              { label: 'Denial Rate', val: denialRate === null ? '—' : `${denialRate}%`, note: totalEnr ? `${deniedEnr} of ${totalEnr}` : null, up: true, color: denialRate > 15 ? 'var(--danger)' : 'var(--success)' },
            ].map((k, i) => (
              <div key={i} className="kpi" style={{ [`--kpi-accent`]: k.color }}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value">{k.val}</div>
                {k.note && <div style={{ fontSize: 11, fontWeight: 600, color: k.up ? 'var(--text-4)' : 'var(--danger)', marginTop: 4 }}>{k.note}</div>}
              </div>
            ))}
          </div>

          <div className="grid-2">
            {/* Applications Over Time */}
            <div className="card">
              <div className="card-header"><SH icon={Icon.trend} title="Applications Submitted per Month" /></div>
              <div className="card-body">
                <BarChart data={weekData} maxVal={maxWeek} colorFn={i => COLORS[0]} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[0] }} />
                  <span style={{ fontSize: 11, color: 'var(--text-4)' }}>Applications submitted (last 6 months)</span>
                </div>
              </div>
            </div>

            {/* Applications by Payer */}
            <div className="card">
              <div className="card-header"><SH icon={Icon.payers} title="Applications by Payer" /></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <MiniDonut data={payerData} total={payerTotal} />
                  <div style={{ flex: 1 }}>
                    {payerData.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 11.5, color: 'var(--text-2)' }}>{d.label}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)' }}>{d.val}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{payerTotal > 0 ? Math.round(d.val/payerTotal*100) : 0}%</span>
                      </div>
                    ))}
                    {payerData.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-4)' }}>No active panels yet.</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* Compliance Rate */}
            <div className="card">
              <div className="card-header"><SH icon={Icon.shield} title="Provider Compliance Rate" /></div>
              <div className="card-body">
                <BigStat value={compliancePct ?? '—'} suffix={compliancePct === null ? '' : '%'} color={complianceColor} />
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>{compliant} of {liveProviders} active providers have a current license and malpractice policy (and CAQH not overdue)</div>
                <ProgressBar pct={compliancePct ?? 0} color={complianceColor} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-4)', marginTop: 5 }}>
                  <span>0%</span><span style={{ fontWeight: 600, color: complianceColor }}>Target: 80%</span><span>100%</span>
                </div>
              </div>
            </div>

            {/* Task Completion */}
            <div className="card">
              <div className="card-header"><SH icon={Icon.check} title="Task Completion" /></div>
              <div className="card-body">
                <BigStat value={taskPct ?? '—'} suffix={taskPct === null ? '' : '%'} color={taskColor} />
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{done} of {db.tasks.length} tasks completed</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Open', 'In Progress', 'Waiting', 'Done'].map(s => (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Badge cls={STATUS_COLOR?.[s] || 'b-gray'}>{s}</Badge>
                      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)' }}>{db.tasks.filter(t => t.status === s).length}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Applications' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
            {Object.entries(stages).map(([stage, count], i) => (
              <div key={stage} className="kpi" style={{ textAlign: 'center' }}>
                <div className="kpi-value" style={{ textAlign: 'center' }}>{count}</div>
                <div className="kpi-label">{stage}</div>
              </div>
            ))}
            {Object.entries(stages).length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: '32px 0', textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>No enrollment data yet.</div>
            )}
          </div>
          <div className="card">
            <div className="card-header"><SH icon={Icon.chart} title="Enrollment Pipeline Breakdown" /></div>
            <div className="card-body">
              {Object.entries(stages).sort((a, b) => b[1] - a[1]).map(([stage, count], i) => (
                <div key={stage} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <StageBadge stage={stage} />
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{count}</span>
                  </div>
                  <ProgressBar pct={totalEnr > 0 ? Math.round(count/totalEnr*100) : 0} color={COLORS[i % COLORS.length]} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Providers' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><SH icon={Icon.users} title="Providers by Specialty" /></div>
            <div className="card-body">
              {(() => {
                const specs = {}
                db.providers.forEach(p => { specs[p.spec || 'General'] = (specs[p.spec || 'General'] || 0) + 1 })
                const total = Object.values(specs).reduce((a,b) => a+b, 0) || 1
                return Object.entries(specs).sort((a,b) => b[1]-a[1]).map(([s, n], i) => (
                  <div key={s} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-2)' }}>{s}</span>
                      <span style={{ fontWeight: 600 }}>{n} ({Math.round(n/total*100)}%)</span>
                    </div>
                    <ProgressBar pct={Math.round(n/total*100)} color={COLORS[i % COLORS.length]} />
                  </div>
                ))
              })()}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><SH icon={Icon.shield} title="Provider Status Overview" /></div>
            <div className="card-body">
              {[
                { label: 'Active Providers', count: db.providers.filter(p=>p.status==='Active').length, color: 'var(--success)' },
                { label: 'Onboarding', count: db.providers.filter(p=>p.status==='Pending'||p.status==='Onboarding').length, color: 'var(--warning)' },
                { label: 'Inactive', count: db.providers.filter(p=>p.status==='Inactive').length, color: 'var(--text-4)' },
                { label: 'With CAQH', count: db.providers.filter(p=>p.caqh).length, color: 'var(--pr)' },
                { label: 'With NPI', count: db.providers.filter(p=>p.npi).length, color: 'var(--pr)' },
                { label: 'With DEA', count: db.providers.filter(p=>p.dea).length, color: 'var(--purple)' },
              ].map((s, i) => (
                <div key={s.label} className="stat-row">
                  <span className="stat-row-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                    {s.label}
                  </span>
                  <span className="stat-row-value">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Payers' && (
        <div>
          <div className="card">
            <div className="card-header"><SH icon={Icon.payers} title="Active Panels by Payer" /></div>
            <div className="card-body">
              {Object.keys(panels).length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">No active panels yet</div></div>
              ) : Object.entries(panels).sort((a, b) => b[1] - a[1]).map(([name, count], i) => (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{name}</span>
                    <span style={{ fontWeight: 600 }}>{count} provider{count > 1 ? 's' : ''}</span>
                  </div>
                  <ProgressBar pct={Math.round(count/maxPanels*100)} color={COLORS[i % COLORS.length]} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Turnaround Time' && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header"><SH icon={Icon.clock} title="Avg Days from Submitted to Effective, by Payer" /></div>
            <div className="card-body">
              {tat.byPayer.length === 0 ? (
                <div className="empty-state"><div className="empty-state-title">Not enough data yet</div>
                  <div className="empty-state-desc">Fill in Submitted and Credentialing Effective (or Effective) dates on applications and this fills in by itself.</div></div>
              ) : tat.byPayer.map(p => (
                <div key={p.name} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span>{p.name} <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>· {p.n} application{p.n === 1 ? '' : 's'}</span></span>
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.days}d avg</span>
                  </div>
                  <ProgressBar pct={Math.round(p.days / Math.max(tat.byPayer[0].days, 1) * 100)} color="var(--pr)" />
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><SH icon={Icon.trend} title="Processing Metrics" /></div>
            <div className="card-body">
              {[
                { label: 'Avg Days to Effective', val: tat.avgDays === null ? '—' : `${tat.avgDays}d`, sub: tat.n ? `${tat.n} application${tat.n === 1 ? '' : 's'} in this period` : 'no applications with both dates' },
                { label: 'Fastest', val: tat.fastest ? `${tat.fastest.days}d` : '—', sub: tat.fastest ? tat.fastest.payer : 'no data yet' },
                { label: 'CAQH Re-attestation On Time', val: caqh.pct === null ? '—' : `${caqh.pct}%`, sub: caqh.total ? `${caqh.good} of ${caqh.total} providers with a due date` : 'no CAQH due dates entered' },
                { label: 'Open Applications with a Follow-up Date', val: follow.pct === null ? '—' : `${follow.pct}%`, sub: follow.total ? `${follow.withDate} of ${follow.total} open applications` : 'no open applications' },
              ].map((m, i) => (
                <div key={i} className="stat-row">
                  <span className="stat-row-label">{m.label} <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>· {m.sub}</span></span>
                  <span className="stat-row-value" style={{ color: 'var(--pr)' }}>{m.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Data Quality' && <DataQuality db={db} onOpenProvider={onOpenProvider} onOpenEnrollment={onOpenEnrollment} />}

      {/* Export Cards */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-header"><SH icon={Icon.download} title="Export Reports" /></div>
        <div className="card-body">
          <div className="grid-3" style={{ gap: 10 }}>
            {EXPORT_CARDS.map(({ id, icon, title, desc }) => (
              <div key={title} className="report-card" role="button" tabIndex={0} onClick={() => runExport(id)} onKeyDown={e => { if (e.key === 'Enter') runExport(id) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{ color: 'var(--pr)' }}>{icon}</span>
                  <h4>{title}</h4>
                </div>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Reports
