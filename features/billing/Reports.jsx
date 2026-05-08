import { daysUntil, payName } from '../../lib/helpers.js'
import { Badge, StageBadge } from '../../components/ui/Badge.jsx'
import { STATUS_COLOR } from '../../constants/stages.js'

const Icon = {
  chart:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  shield:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  check:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  payers:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  users:    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  file:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  calendar: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  bolt:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  archive:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
}

function SectionHeader({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--pr)', display: 'flex' }}>{icon}</span>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
    </div>
  )
}

function BigStat({ value, color = 'var(--pr)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 6 }}>
      <span style={{ fontSize: 44, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-2px' }}>{value}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color }}>&nbsp;%</span>
    </div>
  )
}

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 6, background: 'var(--elevated)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-l)' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .5s ease' }} />
    </div>
  )
}

const EXPORT_CARDS = [
  { icon: Icon.users,    title: 'Provider Roster',    desc: 'All providers with license & expiry details' },
  { icon: Icon.file,     title: 'Enrollment Status',  desc: 'All payer enrollments by current stage' },
  { icon: Icon.calendar, title: 'Expiration Report',  desc: 'Credentials expiring within 90 days' },
  { icon: Icon.bolt,     title: 'Open Tasks',         desc: 'All pending and in-progress tasks' },
  { icon: Icon.archive,  title: 'Full Data Backup',   desc: 'Export all data as a JSON backup file' },
]

export function Reports({ db, exportJSON }) {
  const stages = {}
  db.enrollments.forEach(e => { stages[e.stage] = (stages[e.stage] || 0) + 1 })

  const total = db.providers.length || 1
  const compliant = db.providers.filter(p => {
    const l = daysUntil(p.licenseExp)
    const m = daysUntil(p.malExp)
    const c = daysUntil(p.caqhDue)
    return (l === null || l > 0) && (m === null || m > 0) && (c === null || c > 0)
  }).length
  const compliancePct = Math.round((compliant / total) * 100)
  const complianceColor = compliancePct >= 80 ? 'var(--success)' : compliancePct >= 60 ? 'var(--warning)' : 'var(--danger)'

  const done = db.tasks.filter(t => t.status === 'Done').length
  const tTotal = db.tasks.length || 1
  const taskPct = Math.round((done / tTotal) * 100)
  const taskColor = taskPct >= 80 ? 'var(--success)' : taskPct >= 50 ? 'var(--warning)' : 'var(--danger)'

  const panels = {}
  db.enrollments.filter(e => e.stage === 'Active').forEach(e => {
    panels[e.payId] = (panels[e.payId] || 0) + 1
  })

  return (
    <div className="page">

      <div className="grid-2 mb-16">
        <div className="card">
          <div className="card-header"><SectionHeader icon={Icon.chart} title="Enrollment Pipeline Summary" /></div>
          <div className="card-body">
            {Object.entries(stages).length === 0 ? (
              <div className="empty-state" style={{ padding: '16px 0' }}>
                <div className="ei">📊</div><p style={{ fontSize: 12, color: 'var(--text-4)' }}>No enrollment data yet.</p>
              </div>
            ) : Object.entries(stages).sort((a, b) => b[1] - a[1]).map(([stage, count]) => (
              <div key={stage} className="stat-row">
                <span className="stat-row-label"><StageBadge stage={stage} /></span>
                <span className="stat-row-value">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><SectionHeader icon={Icon.shield} title="Provider Compliance Rate" /></div>
          <div className="card-body">
            <BigStat value={compliancePct} color={complianceColor} />
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
              {compliant} of {total} providers fully compliant
            </div>
            <ProgressBar pct={compliancePct} color={complianceColor} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-4)', marginTop: 5 }}>
              <span>0%</span><span style={{ fontWeight: 600 }}>Target: 80%</span><span>100%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2 mb-16">
        <div className="card">
          <div className="card-header"><SectionHeader icon={Icon.check} title="Task Completion" /></div>
          <div className="card-body">
            <BigStat value={taskPct} color={taskColor} />
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{done} of {tTotal} tasks completed</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Open', 'In Progress', 'Waiting', 'Done'].map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Badge cls={STATUS_COLOR[s] || 'b-gray'}>{s}</Badge>
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-1)' }}>{db.tasks.filter(t => t.status === s).length}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><SectionHeader icon={Icon.payers} title="Active Panels by Payer" /></div>
          <div className="card-body">
            {Object.entries(panels).length === 0 ? (
              <div className="empty-state" style={{ padding: '16px 0' }}>
                <p style={{ fontSize: 12, color: 'var(--text-4)' }}>No active panels yet.</p>
              </div>
            ) : Object.entries(panels).sort((a, b) => b[1] - a[1]).map(([payId, count]) => (
              <div key={payId} className="stat-row">
                <span className="stat-row-label">{payName(db.payers, payId)}</span>
                <span className="stat-row-value">{count} provider{count > 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><SectionHeader icon={Icon.download} title="Export Reports" /></div>
        <div className="card-body">
          <div className="grid-3">
            {EXPORT_CARDS.map(({ icon, title, desc }) => (
              <div key={title} className="report-card" onClick={exportJSON}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <span style={{ color: 'var(--pr)', display: 'flex' }}>{icon}</span>
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
