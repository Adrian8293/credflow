import { useState, useEffect } from 'react'
import Head from 'next/head'
import { daysUntil } from '../lib/helpers.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { useAppData } from '../hooks/useAppData.js'
import { useConfirm } from '../hooks/useConfirm.js'
import { useProviderActions } from '../hooks/useProviderActions.js'
import { useEnrollmentActions } from '../hooks/useEnrollmentActions.js'
import { usePayerActions } from '../hooks/usePayerActions.js'
import { useDocumentActions } from '../hooks/useDocumentActions.js'
import { useTaskActions } from '../hooks/useTaskActions.js'

import { Modal } from '../components/ui/Modal.jsx'
import { Sidebar } from '../components/ui/Sidebar.jsx'
import { Topbar } from '../components/ui/Topbar.jsx'
import { GlobalSearch } from '../components/GlobalSearch.jsx'
import { AiFollowupModal } from '../components/AiFollowupModal.jsx'

import { EnrollModal } from '../features/enrollments/EnrollModal.jsx'
import { PayerModal } from '../features/payers/PayerModal.jsx'
import { DocModal } from '../features/documents/DocModal.jsx'
import { TaskModal } from '../features/documents/TaskModal.jsx'
import { ProvDetailModal } from '../features/providers/ProvDetailModal.jsx'
import { NpiSyncModal } from '../features/providers/NpiSyncModal.jsx'
import { AddProviderWizard } from '../features/providers/AddProviderWizard.jsx'

import { Dashboard } from '../features/billing/Dashboard.jsx'
import { Alerts } from '../features/billing/Alerts.jsx'
import { Reports } from '../features/billing/Reports.jsx'
import { Audit } from '../features/billing/Audit.jsx'
import { Settings } from '../features/billing/Settings.jsx'
import { EligibilityPage } from '../features/billing/EligibilityPage.jsx'
import { ClaimsPage } from '../features/billing/ClaimsPage.jsx'
import { DenialLog } from '../features/billing/DenialLog.jsx'
import { RevenueAnalytics } from '../features/billing/RevenueAnalytics.jsx'
import { PayerHub } from '../features/payers/PayerHub.jsx'
import { DocumentsPage } from '../features/documents/DocumentsPage.jsx'
import { ProvidersPage } from '../features/providers/ProvidersPage.jsx'
import { ApplicationsPage } from '../features/enrollments/ApplicationsPage.jsx'
import { MarketingPage } from '../features/marketing/MarketingPage.jsx'
import { WorkflowTasks } from '../components/WorkflowOverhaul'

import { clearAuditLog as clearAuditLogDB, saveSettings as saveSettingsDB, loadAll, upsertProvider, upsertPayer } from '../lib/db'

const CAN_LOAD_SAMPLE_DATA = process.env.NODE_ENV !== 'production'
const d = n => { const x=new Date(); x.setDate(x.getDate()+n); return x.toISOString().split('T')[0] }
const p = n => { const x=new Date(); x.setDate(x.getDate()-n); return x.toISOString().split('T')[0] }
const SAMPLE_PROVIDERS = [
  { fname:'Sarah', lname:'Chen', cred:'LCSW', spec:'Mental Health', status:'Active', email:'', phone:'(503)555-0101', focus:'Trauma, PTSD, EMDR, Anxiety', npi:'1234567890', caqh:'12345678', caqhAttest:p(120), caqhDue:d(45), medicaid:'OR1000001', ptan:'', license:'C12345', licenseExp:d(280), malCarrier:'HPSO', malPolicy:'HP-001', malExp:d(180), dea:'', deaExp:'', recred:d(310), supervisor:'', supExp:'', notes:'Bilingual Spanish/English.' },
  { fname:'Marcus', lname:'Rivera', cred:'LPC', spec:'Mental Health', status:'Active', email:'', phone:'(503)555-0102', focus:'Adolescents, Substance Use, CBT', npi:'2345678901', caqh:'23456789', caqhAttest:p(20), caqhDue:d(10), medicaid:'OR1000002', ptan:'', license:'C23456', licenseExp:d(60), malCarrier:'CPH&A', malPolicy:'CP-002', malExp:d(20), dea:'', deaExp:'', recred:d(370), supervisor:'', supExp:'', notes:'' },
  { fname:'Priya', lname:'Nair', cred:'Naturopathic Physician', spec:'Naturopathic', status:'Active', email:'', phone:'(503)555-0103', focus:'Integrative Medicine, Hormone Health, BioCharger', npi:'3456789012', caqh:'34567890', caqhAttest:p(90), caqhDue:d(90), medicaid:'', ptan:'', license:'ND45678', licenseExp:d(365), malCarrier:'HPSO', malPolicy:'HP-003', malExp:d(300), dea:'AB1234567', deaExp:d(400), recred:d(730), supervisor:'', supExp:'', notes:'BioCharger certified.' },
  { fname:'Elena', lname:'Vasquez', cred:'Licensed Psychologist', spec:'Mental Health', status:'Active', email:'', phone:'(503)555-0105', focus:'Neuropsychology, Assessment, Testing', npi:'5678901234', caqh:'56789012', caqhAttest:p(200), caqhDue:d(5), medicaid:'OR1000003', ptan:'PT12345', license:'PSY67890', licenseExp:d(18), malCarrier:'APA Insurance', malPolicy:'APA-005', malExp:d(-5), dea:'', deaExp:'', recred:d(30), supervisor:'', supExp:'', notes:'EPPP certified.' },
  { fname:'David', lname:'Park', cred:'Chiropractor', spec:'Chiropractic', status:'Active', email:'', phone:'(503)555-0106', focus:'Sports Injury, Spinal Manipulation, Rehab', npi:'6789012345', caqh:'67890123', caqhAttest:p(30), caqhDue:d(150), medicaid:'', ptan:'', license:'DC89012', licenseExp:d(410), malCarrier:'HPSO', malPolicy:'HP-006', malExp:d(390), dea:'', deaExp:'', recred:d(800), supervisor:'', supExp:'', notes:'' },
]
const SAMPLE_PAYERS = [
  { name:'Aetna', payerId:'60054', type:'Commercial', phone:'1-800-872-3862', email:'', portal:'https://www.aetna.com/health-care-professionals.html', timeline:'60–90 days', notes:'Submit via Availity. Requires CAQH.' },
  { name:'BCBS Oregon (Regence)', payerId:'00550', type:'Commercial', phone:'1-800-452-7278', email:'', portal:'https://www.regence.com/providers', timeline:'45–60 days', notes:'OHA participation typically required first.' },
  { name:'OHP / Medicaid (OHA)', payerId:'OROHP', type:'Medicaid', phone:'1-800-273-0557', email:'', portal:'https://www.oregon.gov/oha/hsd/ohp', timeline:'45–60 days', notes:'DMAP enrollment.' },
]

export default function App() {
  const { user, authLoading, signOut } = useAuth()
  const { toasts, toast } = useToast()
  const { db, setDb, loading, settingsForm, setSettingsForm } = useAppData(user, toast)
  const { confirmDialog, requestConfirm, settleConfirm } = useConfirm()

  const providers  = useProviderActions({ db, setDb, toast, requestConfirm, setPage: p => setPage(p) })
  const enrollments = useEnrollmentActions({ db, setDb, toast, requestConfirm })
  const payers     = usePayerActions({ db, setDb, toast, requestConfirm })
  const documents  = useDocumentActions({ db, setDb, toast, requestConfirm })
  const tasks      = useTaskActions({ db, setDb, toast, requestConfirm })

  const [page, setPage]                   = useState('dashboard')
  const [modal, setModal]                 = useState(null)
  const [provDetailId, setProvDetailId]   = useState(null)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [aiModalOpen, setAiModalOpen]     = useState(false)
  const [aiModalEnrollment, setAiModalEnrollment] = useState(null)

  const [provSearch, setProvSearch] = useState(''); const [provFStatus, setProvFStatus] = useState(''); const [provFSpec, setProvFSpec] = useState('')
  const [enrSearch, setEnrSearch]   = useState(''); const [enrFStage, setEnrFStage]     = useState(''); const [enrFProv, setEnrFProv]   = useState('')
  const [paySearch, setPaySearch]   = useState(''); const [payFType, setPayFType]       = useState('')
  const [docSearch, setDocSearch]   = useState(''); const [docFType, setDocFType]       = useState(''); const [docFStatus, setDocFStatus] = useState('')
  const [auditSearch, setAuditSearch] = useState(''); const [auditFType, setAuditFType] = useState('')

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setGlobalSearchOpen(o => !o) }
      if (e.key === 'Escape') { setGlobalSearchOpen(false); setAiModalOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (authLoading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,sans-serif', color:'#6B7280', flexDirection:'column', gap:12 }}>
      <div style={{ width:36,height:36,border:'3px solid #E5E7EB',borderTopColor:'#1E56F0',borderRadius:'50%',animation:'spin .65s linear infinite' }} />
      <span style={{ fontSize:13 }}>Loading PrimeCredential…</span>
    </div>
  )
  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/login'
    return null
  }

  const alertDays   = db.settings.alertDays || 90
  const alertCount  = db.providers.reduce((n, prov) => {
    ;['licenseExp','malExp','deaExp','caqhDue','recred'].forEach(f => { const days=daysUntil(prov[f]); if(days!==null && days<=alertDays) n++ })
    return n
  }, 0)
  const expDocs     = db.documents.filter(d => { const days=daysUntil(d.exp); return days!==null && days<=90 }).length
  const provDetail  = provDetailId ? db.providers.find(x => x.id === provDetailId) : null

  function openProvDetail(id) { setProvDetailId(id); setModal('provDetail') }
  function openAiFollowup(enrollment) { setAiModalEnrollment(enrollment); setAiModalOpen(true) }

  function openEnrollModal(id, preProvId) { enrollments.openEnrollModal(id, preProvId); setModal('enroll') }
  function openPayerModal(id) { payers.openPayerModal(id); setModal('payer') }
  function openDocModal(id) { documents.openDocModal(id); setModal('doc') }
  function openTaskModal(id) { tasks.openTaskModal(id); setModal('task') }

  async function handleSaveEnrollment() { await enrollments.handleSaveEnrollment(); setModal(null) }
  async function handleSavePayer()      { await payers.handleSavePayer();           setModal(null) }
  async function handleSaveDocument()   { await documents.handleSaveDocument();     setModal(null) }
  async function handleSaveTask()       { await tasks.handleSaveTask();             setModal(null) }

  async function handleSaveSettings() {
    try {
      await saveSettingsDB(settingsForm)
      setDb(prev => ({ ...prev, settings: settingsForm }))
      toast('Settings saved!', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleClearAudit() {
    if (!(await requestConfirm({
      title: 'Archive Audit Log',
      body: 'Audit records are append-only for compliance. This records an archive request; authenticated users cannot delete the audit trail.',
      confirmText: 'Record request',
      danger: false,
    }))) return
    try {
      await clearAuditLogDB()
      setDb(prev => ({ ...prev, auditLog: [] }))
      toast('Audit log cleared.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `primecredential-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    toast('Backup exported!', 'success')
  }

  async function loadSampleData() {
    if (!CAN_LOAD_SAMPLE_DATA) { toast('Sample data is disabled in production.', 'error'); return }
    if (!(await requestConfirm({
      title: 'Load Sample Data',
      body: 'This adds demo providers and payers to the current database. Use it only in local or staging environments.',
      confirmText: 'Load sample data',
      danger: false,
    }))) return
    try {
      for (const prov of SAMPLE_PROVIDERS) await upsertProvider(prov)
      for (const pay of SAMPLE_PAYERS) await upsertPayer(pay)
      const freshData = await loadAll()
      setDb(freshData)
      setSettingsForm(freshData.settings)
      toast('Sample data loaded!', 'success')
    } catch(err) { toast('Error loading sample data: ' + err.message, 'error') }
  }

  const providerWizardProps = {
    db,
    provForm: providers.provForm, setProvForm: providers.setProvForm,
    editingId: { provider: providers.editingProviderId },
    setEditingId: ({ provider }) => providers.setEditingProviderId(provider),
    npiInput: providers.npiInput, setNpiInput: providers.setNpiInput,
    npiResult: providers.npiResult, setNpiResult: providers.setNpiResult,
    npiLoading: providers.npiLoading, lookupNPI: providers.lookupNPI,
    handleSaveProvider: providers.handleSaveProvider,
    handleDeleteProvider: providers.handleDeleteProvider,
    handlePhotoUpload: providers.handlePhotoUpload,
    handleDeletePhoto: providers.handleDeletePhoto,
    photoUploading: providers.photoUploading,
    setPage,
    saving: providers.saving,
  }

  return (
    <>
      <Head>
        <title>PrimeCredential — Provider Credentialing Platform</title>
        <meta name="description" content="PrimeCredential — Enterprise-grade provider credentialing management" />
      </Head>
      <div className="app-root">

        <Sidebar page={page} setPage={setPage} alertCount={alertCount} expDocs={expDocs} user={user} signOut={signOut} db={db} />

        <div className="main">
          <Topbar
            page={page} setPage={setPage}
            openEnrollModal={openEnrollModal} openPayerModal={openPayerModal}
            openDocModal={openDocModal} openTaskModal={openTaskModal}
            exportJSON={exportJSON} saving={providers.saving}
            onOpenSearch={() => setGlobalSearchOpen(true)}
            alertCount={alertCount} user={user} signOut={signOut}
            db={db} openProvDetail={openProvDetail}
          />

          {loading ? (
            <div className="pages">
              <div className="page">
                <div className="kpi-grid" style={{ marginBottom: 20 }}>
                  {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton skeleton-card" style={{ height: 100 }} />)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="skeleton skeleton-card" style={{ height: 200 }} />
                  <div className="skeleton skeleton-card" style={{ height: 200 }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="pages">
              {page === 'dashboard'    && <Dashboard db={db} setPage={setPage} openEnrollModal={openEnrollModal} onDraftEmail={openAiFollowup} />}

              {page === 'providers'    && (
                <ProvidersPage
                  db={db}
                  provSearch={provSearch} setProvSearch={setProvSearch}
                  provFStatus={provFStatus} setProvFStatus={setProvFStatus}
                  provFSpec={provFSpec} setProvFSpec={setProvFSpec}
                  openProvDetail={openProvDetail} editProvider={providers.editProvider}
                  setPage={setPage}
                  setProvForm={providers.setProvForm}
                  setEditingId={({ provider }) => providers.setEditingProviderId(provider)}
                  setNpiInput={providers.setNpiInput} setNpiResult={providers.setNpiResult}
                  syncFromNPPES={providers.syncFromNPPES}
                  provForm={providers.provForm}
                  editingId={{ provider: providers.editingProviderId }}
                  npiInput={providers.npiInput} npiResult={providers.npiResult} npiLoading={providers.npiLoading}
                  lookupNPI={providers.lookupNPI}
                  handleSaveProvider={providers.handleSaveProvider}
                  handleDeleteProvider={providers.handleDeleteProvider}
                  handlePhotoUpload={providers.handlePhotoUpload}
                  handleDeletePhoto={providers.handleDeletePhoto}
                  photoUploading={providers.photoUploading}
                  saving={providers.saving}
                  onStageChange={enrollments.handleStageChange}
                  openEnrollModal={openEnrollModal}
                />
              )}

              {page === 'add-provider' && <AddProviderWizard {...providerWizardProps} />}

              {page === 'applications' && (
                <ApplicationsPage
                  db={db} openEnrollModal={openEnrollModal}
                  search={enrSearch} setSearch={setEnrSearch}
                  fStage={enrFStage} setFStage={setEnrFStage}
                  fProv={enrFProv} setFProv={setEnrFProv}
                  handleDeleteEnrollment={enrollments.handleDeleteEnrollment}
                  onDraftEmail={openAiFollowup}
                />
              )}

              {page === 'payers'       && (
                <PayerHub
                  db={db} initialTab="directory"
                  openEnrollModal={openEnrollModal} openPayerModal={openPayerModal}
                  search={enrSearch} setSearch={setEnrSearch}
                  fStage={enrFStage} setFStage={setEnrFStage}
                  fProv={enrFProv} setFProv={setEnrFProv}
                  handleDeleteEnrollment={enrollments.handleDeleteEnrollment}
                  paySearch={paySearch} setPaySearch={setPaySearch}
                  payFType={payFType} setPayFType={setPayFType}
                  handleDeletePayer={payers.handleDeletePayer}
                />
              )}

              {page === 'documents'    && (
                <DocumentsPage
                  db={db}
                  docSearch={docSearch} setDocSearch={setDocSearch}
                  docFType={docFType} setDocFType={setDocFType}
                  docFStatus={docFStatus} setDocFStatus={setDocFStatus}
                  openDocModal={openDocModal}
                  handleDeleteDocument={documents.handleDeleteDocument}
                />
              )}

              {page === 'tasks'        && (
                <WorkflowTasks
                  db={db}
                  openTaskModal={openTaskModal}
                  handleMarkDone={tasks.handleMarkDone}
                  handleDeleteTask={tasks.handleDeleteTask}
                />
              )}

              {page === 'alerts'       && (
                <Alerts
                  db={db}
                  onOpenProvider={providers.editProvider}
                  onDraftEmail={openAiFollowup}
                  onMarkDone={providers.handleAlertMarkDone}
                />
              )}

              {page === 'claims'       && <ClaimsPage db={db} toast={toast} requestConfirm={requestConfirm} />}
              {page === 'eligibility'  && <EligibilityPage db={db} toast={toast} requestConfirm={requestConfirm} />}
              {page === 'denials'      && <DenialLog db={db} toast={toast} onDraftAppeal={openAiFollowup} requestConfirm={requestConfirm} />}
              {page === 'revenue'      && <RevenueAnalytics db={db} />}
              {page === 'marketing'    && <MarketingPage db={db} setPage={setPage} editProvider={providers.editProvider} />}
              {page === 'reports'      && <Reports db={db} exportJSON={exportJSON} />}
              {page === 'audit'        && <Audit db={db} search={auditSearch} setSearch={setAuditSearch} fType={auditFType} setFType={setAuditFType} handleClearAudit={handleClearAudit} />}
              {page === 'settings'     && <Settings settingsForm={settingsForm} setSettingsForm={setSettingsForm} handleSaveSettings={handleSaveSettings} exportJSON={exportJSON} />}
            </div>
          )}
        </div>

        {modal === 'enroll' && (
          <EnrollModal
            db={db}
            enrollForm={enrollments.enrollForm} setEnrollForm={enrollments.setEnrollForm}
            editingId={{ enrollment: enrollments.editingEnrollmentId }}
            handleSaveEnrollment={handleSaveEnrollment}
            onClose={() => { setModal(null); enrollments.setEnrollForm({}); enrollments.setEditingEnrollmentId?.(null) }}
            saving={enrollments.saving}
          />
        )}
        {modal === 'payer' && (
          <PayerModal
            payerForm={payers.payerForm} setPayerForm={payers.setPayerForm}
            editingId={{ payer: payers.editingPayerId }}
            handleSavePayer={handleSavePayer}
            onClose={() => { setModal(null); payers.setPayerForm({}) }}
            saving={payers.saving}
          />
        )}
        {modal === 'doc' && (
          <DocModal
            db={db}
            docForm={documents.docForm} setDocForm={documents.setDocForm}
            editingId={{ doc: documents.editingDocId }}
            handleSaveDocument={handleSaveDocument}
            onClose={() => { setModal(null); documents.setDocForm({}) }}
            saving={documents.saving}
          />
        )}
        {modal === 'task' && (
          <TaskModal
            db={db}
            taskForm={tasks.taskForm} setTaskForm={tasks.setTaskForm}
            editingId={{ task: tasks.editingTaskId }}
            handleSaveTask={handleSaveTask}
            onClose={() => { setModal(null); tasks.setTaskForm({}) }}
            saving={tasks.saving}
          />
        )}
        {modal === 'provDetail' && provDetail && (
          <ProvDetailModal
            prov={provDetail} db={db}
            onClose={() => setModal(null)}
            editProvider={providers.editProvider}
            openEnrollModal={openEnrollModal}
            toast={toast}
            syncFromNPPES={providers.syncFromNPPES}
          />
        )}
        {providers.npiSyncModal && (
          <NpiSyncModal
            data={providers.npiSyncModal}
            onApply={providers.applyNpiSync}
            onClose={() => providers.setNpiSyncModal(null)}
            saving={providers.saving}
          />
        )}
        {aiModalOpen && aiModalEnrollment && (
          <AiFollowupModal
            enrollment={aiModalEnrollment}
            provider={db.providers.find(p => p.id === aiModalEnrollment.provId) || {}}
            payer={db.payers.find(p => p.id === aiModalEnrollment.payId) || {}}
            onClose={() => { setAiModalOpen(false); setAiModalEnrollment(null) }}
          />
        )}
        {globalSearchOpen && (
          <GlobalSearch
            db={db}
            onClose={() => setGlobalSearchOpen(false)}
            setPage={setPage}
            openProvDetail={openProvDetail}
            openEnrollModal={openEnrollModal}
          />
        )}

        {confirmDialog && (
          <Modal
            title={confirmDialog.title}
            sub={confirmDialog.danger ? 'Permanent action' : 'Confirmation'}
            onClose={() => settleConfirm(false)}
            footer={
              <>
                <button className="btn btn-secondary" onClick={() => settleConfirm(false)}>Cancel</button>
                <button
                  className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => settleConfirm(true)}
                >
                  {confirmDialog.confirmText || 'Confirm'}
                </button>
              </>
            }
          >
            <p style={{ margin: 0, lineHeight: 1.6 }}>{confirmDialog.body}</p>
          </Modal>
        )}

        <div className="toast-wrap">
          {toasts.map(t => (
            <div key={t.id} className={`toast t-${t.type}`}>
              <div className="toast-icon">{t.type==='success'?'✓':t.type==='error'?'✕':t.type==='warn'?'!':'i'}</div>
              {t.msg}
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
