import { StageBadge } from '../../components/ui/Badge.jsx'
import { STAGES, KANBAN_COLUMNS } from '../../constants/stages.js'
import { useState } from 'react'

export function KanbanPipeline({ db, openEnrollModal }) {
  const [filterProv, setFilterProv] = useState('')
  const filtered = db.enrollments.filter(e => !filterProv || e.provId === filterProv)
  return (
    <div className="page">
      <div className="toolbar" style={{ marginBottom:18 }}>
        <select className="filter-select" value={filterProv} onChange={e=>setFilterProv(e.target.value)}>
          <option value="">All Providers</option>
          {db.providers.map(p=><option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
        </select>
        <div className="toolbar-right">
          <button className="btn btn-primary btn-sm" onClick={()=>openEnrollModal()}>＋ New Enrollment</button>
        </div>
      </div>
      <EnrollmentKanban
        enrollments={db.enrollments}
        providers={db.providers}
        payers={db.payers}
        onStageChange={async (enrollmentId, newStage) => {
          const enr = db.enrollments.find(e => e.id === enrollmentId)
          if (!enr) return
          const updated = { ...enr, stage: newStage }
          const prov  = db.providers.find(p => p.id === enr.provId)
          const payer = db.payers.find(p => p.id === enr.payId)
          const saved = await upsertEnrollment(updated, prov ? `${prov.fname} ${prov.lname}` : '', payer?.name || '')
          setDb(prev => ({ ...prev, enrollments: prev.enrollments.map(e => e.id === saved.id ? saved : e) }))
          toast(`Moved to ${newStage}`, 'success')
        }}
        onOpen={(enr) => openEnrollModal(enr.id)}
      />
    </div>
  )
}

export { KanbanPipeline }
