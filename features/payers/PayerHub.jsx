import { useState } from 'react'
import { useSorted } from '../../hooks/useSorted.js'
import { Badge, StageBadge } from '../../components/ui/Badge.jsx'
import { PAYER_REQUIREMENTS } from '../../constants/stages.js'
import { PAYER_CATALOG } from '../../constants/payerRequirements.js'

function PayerHub({ db, initialTab, openEnrollModal, openPayerModal, search, setSearch, fStage, setFStage, fProv, setFProv, handleDeleteEnrollment, paySearch, setPaySearch, payFType, setPayFType, handleDeletePayer }) {
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
      <div style={{display:'flex',gap:4,marginBottom:22,background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--r-xl)',padding:5,position:'sticky',top:60,zIndex:50,backdropFilter:'blur(8px)'}}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex:1, padding:'9px 14px', border:'none', borderRadius:'var(--r-lg)', cursor:'pointer',
              fontSize:13, fontWeight: tab===t.id ? 600 : 400,
              background: tab===t.id ? 'var(--surface)' : 'transparent',
              color: tab===t.id ? 'var(--primary)' : 'var(--ink-3)',
              boxShadow: tab===t.id ? 'var(--shadow-sm)' : 'none',
              transition:'all var(--t)',
              borderTop: tab===t.id ? '2px solid var(--primary)' : '2px solid transparent',
            }}
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

export { PayerHub }
