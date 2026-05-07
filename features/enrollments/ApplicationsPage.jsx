// ApplicationsPage — wraps existing EnrollmentsTab + KanbanPipeline as sub-tabs
import { useState } from 'react'
import { EnrollmentsTab } from './EnrollmentsTab.jsx'
import { KanbanPipeline } from './KanbanPipeline.jsx'
import { daysUntil } from '../../lib/helpers.js'

const TABS = [
  { id: 'list',     label: 'All Applications' },
  { id: 'pipeline', label: 'Pipeline Kanban' },
]

export function ApplicationsPage({ db, openEnrollModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment }) {
  const [tab, setTab] = useState('list')

  const total     = db.enrollments.length
  const active    = db.enrollments.filter(e => e.stage === 'Active').length
  const pending   = db.enrollments.filter(e => ['Application Submitted','Awaiting CAQH','Pending Verification','Under Review'].includes(e.stage)).length
  const needsAttn = db.enrollments.filter(e => e.stage === 'Additional Info Requested').length

  return (
    <div className="page">
      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="kpi kpi-blue">
          <div className="kpi-label">Total Enrollments</div>
          <div className="kpi-value">{total}</div>
          <div className="kpi-sub">across all payers</div>
        </div>
        <div className="kpi kpi-green">
          <div className="kpi-label">Active Panels</div>
          <div className="kpi-value">{active}</div>
          <div className="kpi-sub">credentialed &amp; active</div>
        </div>
        <div className="kpi kpi-amber">
          <div className="kpi-label">In Progress</div>
          <div className="kpi-value">{pending}</div>
          <div className="kpi-sub">submitted or under review</div>
        </div>
        <div className="kpi kpi-red">
          <div className="kpi-label">Needs Attention</div>
          <div className="kpi-value">{needsAttn}</div>
          <div className="kpi-sub">additional info requested</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <div key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingBottom: 4 }}>
          <button className="btn btn-primary btn-sm" onClick={() => openEnrollModal()}>+ New Enrollment</button>
        </div>
      </div>

      {tab === 'list'     && <EnrollmentsTab db={db} search={search} setSearch={setSearch} fStage={fStage} setFStage={setFStage} fProv={fProv} setFProv={setFProv} openEnrollModal={openEnrollModal} handleDeleteEnrollment={handleDeleteEnrollment} />}
      {tab === 'pipeline' && <KanbanPipeline db={db} openEnrollModal={openEnrollModal} />}
    </div>
  )
}

export default ApplicationsPage
