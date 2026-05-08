import { useState } from 'react'
import { useSorted } from '../../hooks/useSorted.js'
import { Badge, StageBadge } from '../../components/ui/Badge.jsx'
import { PAYER_REQUIREMENTS } from '../../constants/stages.js'
import { PAYER_CATALOG } from '../../constants/payerRequirements.js'
import { PayersTab } from './PayersTab.jsx'
import { EnrollmentsTab } from '../enrollments/EnrollmentsTab.jsx'
import { KanbanPipeline } from '../enrollments/KanbanPipeline.jsx'
import { PayerRequirements } from './PayerRequirements.jsx'

export function PayerHub({ db, initialTab, openEnrollModal, openPayerModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment, paySearch, setPaySearch, payFType, setPayFType, handleDeletePayer }) {
  const [tab, setTab] = useState(initialTab || 'directory')

  const TABS = [
    { id:'directory',   label:'🗂 Directory',   hint:'Your practice\'s payers' },
    { id:'enrollments', label:'📋 Enrollments', hint:'Enrollment table' },
    { id:'pipeline',    label:'📊 Pipeline',    hint:'Kanban board' },
    { id:'library',     label:'🌐 Library',     hint:'National payer library' },
  ]

  return (
    <div className="page" style={{paddingTop:0}}>
      {/* Tab bar */}
      <div className="tab-pills">
        {TABS.map(t => (
          <button key={t.id}
            className={`tab-pill${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab: Directory (practice's enrolled payers) */}
      {tab === 'directory' && (
        <PayersTab db={db} search={paySearch} setSearch={setPaySearch} fType={payFType} setFType={setPayFType} openPayerModal={openPayerModal} handleDeletePayer={handleDeletePayer} />
      )}

      {/* Tab: Enrollments */}
      {tab === 'enrollments' && (
        <EnrollmentsTab db={db} search={search} setSearch={setSearch} fStage={fStage} setFStage={setFStage} fProv={fProv} setFProv={setFProv} openEnrollModal={openEnrollModal} handleDeleteEnrollment={handleDeleteEnrollment} />
      )}

      {/* Tab: Pipeline (Kanban) */}
      {tab === 'pipeline' && (
        <KanbanPipeline db={db} openEnrollModal={openEnrollModal} />
      )}

      {/* Tab: Library (national payer reference) */}
      {tab === 'library' && (
        <PayerRequirements db={db} />
      )}
    </div>
  )
}

// Extracted sub-tab components (so PayerHub can render them without the outer <div className="page">)
