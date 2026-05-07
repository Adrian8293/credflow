import { useState, useEffect, useCallback, useRef } from 'react'
import { daysUntil, fmtDate, fmtTS, initials, pName, pNameShort, payName } from '../lib/helpers.js'
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
import { PayersTab } from '../features/payers/PayersTab.jsx'
import { Payers } from '../features/payers/Payers.jsx'
import { PayerModal } from '../features/payers/PayerModal.jsx'
import { PayerRequirements } from '../features/payers/PayerRequirements.jsx'
import { Documents } from '../features/documents/Documents.jsx'
import { DocModal } from '../features/documents/DocModal.jsx'
import { MissingDocuments } from '../features/documents/MissingDocuments.jsx'
import { Workflows } from '../features/documents/Workflows.jsx'
import { TaskModal } from '../features/documents/TaskModal.jsx'
import { LicenseVerification } from '../features/providers/LicenseVerification.jsx'
import { PsychologyToday } from '../features/providers/PsychologyToday.jsx'
import { Providers } from '../features/providers/index.jsx'
import { NpiLookupPanel } from '../features/providers/NpiLookupPanel.jsx'
import { AddProvider } from '../features/providers/AddProvider.jsx'
import { NpiSyncModal } from '../features/providers/NpiSyncModal.jsx'
import { ProvDetailModal } from '../features/providers/ProvDetailModal.jsx'
import { ProviderLookup } from '../features/providers/ProviderLookup.jsx'
import { Enrollments } from '../features/enrollments/index.jsx'
import { EnrollmentsTab } from '../features/enrollments/EnrollmentsTab.jsx'
import { EnrollModal } from '../features/enrollments/EnrollModal.jsx'
import { KanbanPipeline } from '../features/enrollments/KanbanPipeline.jsx'
import { useSorted } from '../hooks/useSorted.js'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import { Modal, DrawerModal } from '../components/ui/Modal.jsx'
import { Badge, ExpiryBadge, StageBadge } from '../components/ui/Badge.jsx'
import { Sidebar } from '../components/ui/Sidebar.jsx'
import { Topbar } from '../components/ui/Topbar.jsx'
import { ProvidersPage } from '../features/providers/ProvidersPage.jsx'
import { DocumentsPage } from '../features/documents/DocumentsPage.jsx'
import { MarketingPage } from '../features/marketing/MarketingPage.jsx'
import { ApplicationsPage } from '../features/enrollments/ApplicationsPage.jsx'
import { GlobalSearch } from '../components/GlobalSearch.jsx'
import { STAGES, KANBAN_COLUMNS, PAYER_REQUIREMENTS, STAGE_COLOR, SPEC_COLORS, PRIORITY_COLOR, STATUS_COLOR, BADGE_CLASS } from '../constants/stages.js'
import { DENIAL_CODES, AGING_BUCKETS, getAgingBucket } from '../constants/rcm.js'
import { PAYER_CATALOG, REQUIRED_DOCS } from '../constants/payerRequirements.js'
import Head from 'next/head'
import { supabase } from '../lib/supabase'
import EnrollmentKanban from '../components/EnrollmentKanban'
import OpcaUploadPanel from '../components/OpcaUploadPanel'
import {
  WorkflowDashboard,
  WorkflowProviderCard,
  WorkflowTasks,
  WorkflowDocuments,
  ProviderCommandCenter,
  ReadinessRing,
  NextActionBanner,
  ProviderReadinessBar,
  EnrollmentStageBar,
  SLABadge,
  providerReadiness,
} from '../components/WorkflowOverhaul'
import {
  loadAll, upsertProvider, deleteProvider,
  upsertPayer, deletePayer,
  upsertEnrollment, deleteEnrollment,
  upsertDocument, deleteDocument,
  upsertTask, deleteTask, markTaskDone,
  fetchAuditLog, clearAuditLog as clearAuditLogDB,
  uploadProviderPhoto, deleteProviderPhoto,
  saveSettings as saveSettingsDB,
  subscribeToAll, mergeRealtimeChange, addAudit,
  upsertEligibilityCheck, deleteEligibilityCheck,
  upsertClaim, deleteClaim,
  upsertDenial, deleteDenial,
  upsertPayment,
} from '../lib/db'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// ─── HELPERS ──────────────────────────────────────────────────────────────────
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


// ─── SORT HOOK ────────────────────────────────────────────────────────────────
export default function App() {
  const { user, authLoading, signOut } = useAuth()
  const [page, setPage] = useState('dashboard')
  const [db, setDb] = useState({ providers:[], payers:[], enrollments:[], documents:[], tasks:[], auditLog:[], settings:{} })
  const [loading, setLoading] = useState(true)
  const { toasts, toast } = useToast()
  const [modal, setModal] = useState(null) // null | 'enroll' | 'payer' | 'doc' | 'task' | 'provDetail'
  const [editingId, setEditingId] = useState({})
  const [provDetailId, setProvDetailId] = useState(null)
  const [provDetailTab, setProvDetailTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)

  // Form states
  const [provForm, setProvForm] = useState({})
  const [enrollForm, setEnrollForm] = useState({})
  const [payerForm, setPayerForm] = useState({})
  const [docForm, setDocForm] = useState({})
  const [taskForm, setTaskForm] = useState({})
  const [settingsForm, setSettingsForm] = useState({})

  // Filter/search states
  const [provSearch, setProvSearch] = useState(''); const [provFStatus, setProvFStatus] = useState(''); const [provFSpec, setProvFSpec] = useState('')
  const [enrSearch, setEnrSearch] = useState(''); const [enrFStage, setEnrFStage] = useState(''); const [enrFProv, setEnrFProv] = useState('')
  const [paySearch, setPaySearch] = useState(''); const [payFType, setPayFType] = useState('')
  const [docSearch, setDocSearch] = useState(''); const [docFType, setDocFType] = useState(''); const [docFStatus, setDocFStatus] = useState('')
  const [wfSearch, setWfSearch] = useState(''); const [wfFPriority, setWfFPriority] = useState(''); const [wfFStatus, setWfFStatus] = useState('')
  const [auditSearch, setAuditSearch] = useState(''); const [auditFType, setAuditFType] = useState('')
  const [npiInput, setNpiInput] = useState(''); const [npiResult, setNpiResult] = useState(null); const [npiLoading, setNpiLoading] = useState(false)
  const [npiSyncModal, setNpiSyncModal] = useState(null)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)

  // ─── GLOBAL SEARCH SHORTCUT
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setGlobalSearchOpen(o => !o)
      }
      if (e.key === 'Escape') setGlobalSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ─── LOAD DATA ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadAll().then(data => {
      setDb(data)
      setSettingsForm(data.settings)
      setLoading(false)
    }).catch(err => {
      toast('Error loading data: ' + err.message, 'error')
      setLoading(false)
    })
  }, [user])

  // ─── REALTIME ────────────────────────────────────────────────────────────────
  // Each table change merges directly into state — no full re-fetch.
  // stateKey matches the db state object keys (e.g. 'providers', 'tasks').
  // mappedRow is already transformed through the *FromDb mapper in db.js.
  useEffect(() => {
    if (!user) return
    const unsub = subscribeToAll((stateKey, mappedRow, eventType, oldId) => {
      setDb(prev => mergeRealtimeChange(prev, stateKey, mappedRow, eventType, oldId))
    })
    return unsub
  }, [user])

  // ─── AUTH GUARD ───────────────────────────────────────────────────────────────
  if (authLoading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Poppins,sans-serif', color:'#5a6e5a' }}>Loading…</div>
  if (!user) {
    if (typeof window !== 'undefined') window.location.href = '/login'
    return null
  }

  // ─── COMPUTED ALERTS ──────────────────────────────────────────────────────────
  const alertDays = db.settings.alertDays || 90
  const alertCount = db.providers.reduce((n, prov) => {
    ['licenseExp','malExp','deaExp','caqhDue','recred'].forEach(f => { const d=daysUntil(prov[f]); if(d!==null && d<=alertDays) n++ })
    return n
  }, 0)
  const pendingEnroll = db.enrollments.filter(e => !['Active','Denied'].includes(e.stage)).length
  const expDocs = db.documents.filter(d => { const days=daysUntil(d.exp); return days!==null && days<=90 }).length

  // ─── SAVE PROVIDER ────────────────────────────────────────────────────────────
  async function handlePhotoUpload(file, providerId) {
    if (!providerId) { alert('Save the provider first before uploading a photo.'); return }
    setPhotoUploading(true)
    try {
      const url = await uploadProviderPhoto(providerId, file)
      setProvForm(f => ({ ...f, avatarUrl: url }))
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === providerId ? { ...p, avatarUrl: url } : p)
      }))
      toast('Photo uploaded!', 'success')
    } catch(err) { toast(err.message, 'error') }
    setPhotoUploading(false)
  }

  async function handleDeletePhoto(providerId) {
    if (!confirm('Remove this photo?')) return
    try {
      await deleteProviderPhoto(providerId)
      setProvForm(f => ({ ...f, avatarUrl: '' }))
      setDb(prev => ({
        ...prev,
        providers: prev.providers.map(p => p.id === providerId ? { ...p, avatarUrl: '' } : p)
      }))
      toast('Photo removed.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleSaveProvider() {
    if (!provForm.fname?.trim() || !provForm.lname?.trim()) { toast('First and last name required.', 'error'); return }

    // ── Duplicate detection (skip when editing an existing provider) ───────────
    if (!editingId.provider) {
      const fname = provForm.fname.trim().toLowerCase()
      const lname = provForm.lname.trim().toLowerCase()
      const npi   = provForm.npi?.trim()

      const duplicate = db.providers.find(p => {
        // NPI match is definitive (NPIs are unique per provider)
        if (npi && p.npi && p.npi === npi) return true
        // Name match as fallback (case-insensitive)
        const sameName = p.fname.trim().toLowerCase() === fname &&
                         p.lname.trim().toLowerCase() === lname
        return sameName
      })

      if (duplicate) {
        toast(
          `Duplicate: ${duplicate.fname} ${duplicate.lname}${duplicate.cred ? ', ' + duplicate.cred : ''} is already on file.`,
          'error'
        )
        return
      }
    }

    setSaving(true)
    try {
      const saved = await upsertProvider({ ...provForm, id: editingId.provider || undefined })
      setDb(prev => {
        const list = editingId.provider ? prev.providers.map(x => x.id===saved.id ? saved : x) : [...prev.providers, saved]
        return { ...prev, providers: list }
      })
      toast(editingId.provider ? 'Provider updated!' : 'Provider saved!', 'success')
      setEditingId(e => ({ ...e, provider: null }))
      setProvForm({})
      setNpiResult(null)
      setNpiInput('')
      setPage('providers')
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteProvider(id) {
    if (!confirm('Delete this provider and all linked data?')) return
    setSaving(true)
    try {
      await deleteProvider(id)
      setDb(prev => ({
        ...prev,
        providers: prev.providers.filter(x => x.id !== id),
        enrollments: prev.enrollments.filter(e => e.provId !== id),
        documents: prev.documents.filter(d => d.provId !== id),
        tasks: prev.tasks.filter(t => t.provId !== id),
      }))
      toast('Provider deleted.', 'warn')
      setEditingId(e => ({ ...e, provider: null }))
      setPage('providers')
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  // ─── SAVE ENROLLMENT ──────────────────────────────────────────────────────────
  async function handleSaveEnrollment() {
    if (!enrollForm.provId || !enrollForm.payId) { toast('Provider and payer required.', 'error'); return }
    setSaving(true)
    try {
      const provN = pNameShort(db.providers, enrollForm.provId)
      const payN = payName(db.payers, enrollForm.payId)
      const saved = await upsertEnrollment({ ...enrollForm, id: editingId.enrollment || undefined }, provN, payN)
      setDb(prev => {
        const list = editingId.enrollment ? prev.enrollments.map(x => x.id===saved.id ? saved : x) : [...prev.enrollments, saved]
        return { ...prev, enrollments: list }
      })
      toast(editingId.enrollment ? 'Enrollment updated!' : 'Enrollment saved!', 'success')
      setModal(null)
      setEnrollForm({})
      setEditingId(e => ({ ...e, enrollment: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteEnrollment(id) {
    if (!confirm('Delete this enrollment?')) return
    try {
      await deleteEnrollment(id)
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE PAYER ───────────────────────────────────────────────────────────────
  async function handleSavePayer() {
    if (!payerForm.name?.trim()) { toast('Payer name required.', 'error'); return }
    setSaving(true)
    try {
      const saved = await upsertPayer({ ...payerForm, id: editingId.payer || undefined })
      setDb(prev => {
        const list = editingId.payer ? prev.payers.map(x => x.id===saved.id ? saved : x) : [...prev.payers, saved]
        return { ...prev, payers: list }
      })
      toast(editingId.payer ? 'Payer updated!' : 'Payer saved!', 'success')
      setModal(null)
      setPayerForm({})
      setEditingId(e => ({ ...e, payer: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeletePayer(id) {
    if (!confirm('Delete this payer?')) return
    try {
      await deletePayer(id)
      setDb(prev => ({ ...prev, payers: prev.payers.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE DOCUMENT ────────────────────────────────────────────────────────────
  async function handleSaveDocument() {
    if (!docForm.provId || !docForm.exp) { toast('Provider and expiration date required.', 'error'); return }
    setSaving(true)
    try {
      const provN = pNameShort(db.providers, docForm.provId)
      const saved = await upsertDocument({ ...docForm, id: editingId.doc || undefined }, provN)
      setDb(prev => {
        const list = editingId.doc ? prev.documents.map(x => x.id===saved.id ? saved : x) : [...prev.documents, saved]
        return { ...prev, documents: list }
      })
      toast(editingId.doc ? 'Document updated!' : 'Document saved!', 'success')
      setModal(null)
      setDocForm({})
      setEditingId(e => ({ ...e, doc: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteDocument(id) {
    if (!confirm('Delete this document?')) return
    try {
      await deleteDocument(id)
      setDb(prev => ({ ...prev, documents: prev.documents.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE TASK ────────────────────────────────────────────────────────────────
  async function handleSaveTask() {
    if (!taskForm.task?.trim() || !taskForm.due) { toast('Task description and due date required.', 'error'); return }
    setSaving(true)
    try {
      const saved = await upsertTask({ ...taskForm, id: editingId.task || undefined })
      setDb(prev => {
        const list = editingId.task ? prev.tasks.map(x => x.id===saved.id ? saved : x) : [...prev.tasks, saved]
        return { ...prev, tasks: list }
      })
      toast(editingId.task ? 'Task updated!' : 'Task saved!', 'success')
      setModal(null)
      setTaskForm({})
      setEditingId(e => ({ ...e, task: null }))
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleMarkDone(id, taskName) {
    try {
      await markTaskDone(id, taskName)
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id===id ? { ...t, status:'Done' } : t) }))
      toast('Task marked complete!', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleDeleteTask(id) {
    if (!confirm('Delete this task?')) return
    try {
      await deleteTask(id)
      setDb(prev => ({ ...prev, tasks: prev.tasks.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── SAVE SETTINGS ────────────────────────────────────────────────────────────
  async function handleSaveSettings() {
    try {
      await saveSettingsDB(settingsForm)
      setDb(prev => ({ ...prev, settings: settingsForm }))
      toast('Settings saved!', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── CLEAR AUDIT ──────────────────────────────────────────────────────────────
  async function handleClearAudit() {
    if (!confirm('Clear the audit log?')) return
    try {
      await clearAuditLogDB()
      setDb(prev => ({ ...prev, auditLog: [] }))
      toast('Audit log cleared.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  // ─── NPI LOOKUP ───────────────────────────────────────────────────────────────
  async function lookupNPI() {
    if (!/^\d{10}$/.test(npiInput)) { toast('Enter a valid 10-digit NPI.', 'error'); return }
    setNpiLoading(true)
    setNpiResult(null)
    try {
      const res = await fetch(`/api/npi?number=${npiInput}`)
      const data = await res.json()
      if (!data.results?.length) { setNpiResult({ error: 'No provider found for this NPI.' }); return }

      // ── Use npiMapper for richer, taxonomy-aware data ──────────────────────
      const { mapNpiResponse, npiCardToProviderDefaults } = await import('../lib/npiMapper')
      const card = mapNpiResponse(data)
      if (!card) { setNpiResult({ error: 'No provider found for this NPI.' }); return }

      // addr string for the result box
      const addr = [card.address, card.city, card.state, card.zip].filter(Boolean).join(', ')
      setNpiResult({ ...card, addr, npi: npiInput })

      // Pre-fill form with mapped defaults (only fills empty fields)
      const defaults = npiCardToProviderDefaults(card)
      setProvForm(f => ({
        ...f,
        ...Object.fromEntries(
          Object.entries(defaults).filter(([k, v]) => v && !f[k])
        ),
        npi: npiInput,
      }))

      await addAudit('Provider', 'NPI Lookup', `NPI ${npiInput} → ${card.fname} ${card.lname} (${card.taxonomyDesc})`, '')
      toast('NPI data loaded!', 'success')
    } catch(e) { setNpiResult({ error: e.message || 'Could not reach NPI registry.' }) }
    setNpiLoading(false)
  }

  // ─── SYNC PROVIDER FROM NPPES ─────────────────────────────────────────────────
  // Fetches fresh NPPES data for a provider by their stored NPI, diffs it
  // against what's in CredFlow, and opens a confirmation modal showing exactly
  // what will change before saving anything.
  // npiSyncModal shape: { prov, diffs: [{field, label, npiValue, storedValue}], card }

  async function syncFromNPPES(provId) {
    const prov = db.providers.find(p => p.id === provId)
    if (!prov) return
    if (!prov.npi) { toast('This provider has no NPI on file — add it first.', 'error'); return }

    toast('Fetching NPPES data…', 'success')
    try {
      const res = await fetch(`/api/npi?number=${prov.npi}`)
      const data = await res.json()
      const { mapNpiResponse, diffNpiVsProvider } = await import('../lib/npiMapper')
      const card = mapNpiResponse(data)
      if (!card) { toast('No NPPES record found for NPI ' + prov.npi, 'error'); return }

      // Build diff — also include new fields not in diffNpiVsProvider's default list
      const baseDiffs = diffNpiVsProvider(card, prov)

      // Pull specific identifiers from the NPPES identifiers array
      const npiIdentifiers = card.identifiers || []
      const findId = (...keywords) => {
        const match = npiIdentifiers.find(i =>
          keywords.some(kw => (i.desc || '').toLowerCase().includes(kw.toLowerCase()))
        )
        return match?.identifier || ''
      }
      const nppesMedicaid = card.medicaid || findId('medicaid', 'dmap', 'ohp')
      const nppesPtan     = findId('medicare', 'ptan', 'part b')
      const nppesCaqh     = findId('caqh')

      // Extra fields to check that aren't in the base diff
      const EXTRA_FIELDS = [
        { field: 'phone',        label: 'Phone',                npiVal: card.phone },
        { field: 'license',      label: 'License #',            npiVal: card.license },
        { field: 'address',      label: 'Address',              npiVal: card.address },
        { field: 'city',         label: 'City',                 npiVal: card.city },
        { field: 'state',        label: 'State',                npiVal: card.state },
        { field: 'zip',          label: 'ZIP',                  npiVal: card.zip },
        { field: 'medicaid',     label: 'Medicaid ID',          npiVal: nppesMedicaid },
        { field: 'ptan',         label: 'Medicare PTAN',        npiVal: nppesPtan },
        { field: 'caqh',         label: 'CAQH ID',              npiVal: nppesCaqh },
        { field: 'focus',        label: 'Specialty Focus',      npiVal: card.taxonomyDesc },
        { field: 'taxonomyCode', label: 'Taxonomy Code',        npiVal: card.taxonomyCode },
        { field: 'taxonomyDesc', label: 'Taxonomy Description', npiVal: card.taxonomyDesc },
      ]

      const extraDiffs = EXTRA_FIELDS
        .filter(f => {
          const nv = (f.npiVal || '').trim().toLowerCase()
          const sv = (prov[f.field] || '').trim().toLowerCase()
          return nv && sv && nv !== sv
        })
        .map(f => ({ field: f.field, label: f.label, npiValue: f.npiVal, storedValue: prov[f.field] }))

      // Also detect new fields NPPES has that we don't
      const newFields = EXTRA_FIELDS
        .filter(f => {
          const nv = (f.npiVal || '').trim()
          const sv = (prov[f.field] || '').trim()
          return nv && !sv
        })
        .map(f => ({ field: f.field, label: f.label, npiValue: f.npiVal, storedValue: '(empty)', isNew: true }))

      const allDiffs = [...baseDiffs, ...extraDiffs, ...newFields]
        // dedupe by field
        .filter((d, i, arr) => arr.findIndex(x => x.field === d.field) === i)

      if (allDiffs.length === 0) {
        toast(`✓ ${prov.fname} ${prov.lname} is already up to date with NPPES.`, 'success')
        return
      }

      setNpiSyncModal({ prov, diffs: allDiffs, card })
    } catch (err) {
      toast('NPPES sync failed: ' + (err.message || 'Unknown error'), 'error')
    }
  }

  async function applyNpiSync(selectedFields) {
    if (!npiSyncModal) return
    const { prov, diffs, card } = npiSyncModal
    setSaving(true)
    try {
      const updates = {}
      selectedFields.forEach(field => {
        const diff = diffs.find(d => d.field === field)
        updates[field] = diff ? diff.npiValue : card[field]
      })
      const updated = { ...prov, ...updates }
      const saved = await upsertProvider(updated)
      setDb(prev => ({ ...prev, providers: prev.providers.map(p => p.id === saved.id ? saved : p) }))
      await addAudit('Provider', 'NPPES Sync', `Synced ${selectedFields.join(', ')} from NPPES for NPI ${prov.npi}`, prov.id)
      toast(`✓ ${prov.fname} ${prov.lname} updated from NPPES!`, 'success')
      setNpiSyncModal(null)
    } catch (err) {
      toast('Save failed: ' + err.message, 'error')
    }
    setSaving(false)
  }

  // ─── LOAD SAMPLE DATA ─────────────────────────────────────────────────────────
  async function loadSampleData() {
    if (!confirm('Load sample data? This will add sample providers and payers.')) return
    setSaving(true)
    try {
      for (const prov of SAMPLE_PROVIDERS) {
        await upsertProvider(prov)
      }
      const savedPayers = []
      for (const pay of SAMPLE_PAYERS) {
        const saved = await upsertPayer(pay)
        savedPayers.push(saved)
      }
      const freshData = await loadAll()
      setDb(freshData)
      setSettingsForm(freshData.settings)
      toast('Sample data loaded!', 'success')
    } catch(err) { toast('Error loading sample data: ' + err.message, 'error') }
    setSaving(false)
  }

  // ─── EXPORT ───────────────────────────────────────────────────────────────────
  function exportJSON() {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `credflow-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    toast('Backup exported!', 'success')
  }

  // ─── OPEN MODALS ──────────────────────────────────────────────────────────────
  function openEnrollModal(id, preProvId) {
    setEditingId(e => ({ ...e, enrollment: id || null }))
    if (id) {
      const en = db.enrollments.find(x => x.id === id)
      if (en) setEnrollForm({ ...en })
    } else {
      setEnrollForm({ stage:'Not Started', eft:'Not Set Up', era:'Not Set Up', contract:'No', provId: preProvId||'', payId:'' })
    }
    setModal('enroll')
  }

  function openPayerModal(id) {
    setEditingId(e => ({ ...e, payer: id || null }))
    if (id) {
      const pay = db.payers.find(x => x.id === id)
      if (pay) setPayerForm({ ...pay })
    } else {
      setPayerForm({ type:'Commercial', timeline:'60–90 days' })
    }
    setModal('payer')
  }

  function openDocModal(id) {
    setEditingId(e => ({ ...e, doc: id || null }))
    if (id) {
      const doc = db.documents.find(x => x.id === id)
      if (doc) setDocForm({ ...doc })
    } else {
      setDocForm({ type:'License' })
    }
    setModal('doc')
  }

  function openTaskModal(id) {
    setEditingId(e => ({ ...e, task: id || null }))
    if (id) {
      const t = db.tasks.find(x => x.id === id)
      if (t) setTaskForm({ ...t })
    } else {
      setTaskForm({ priority:'Medium', status:'Open', cat:'Follow-up' })
    }
    setModal('task')
  }

  function openProvDetail(id) {
    setProvDetailId(id)
    setProvDetailTab('profile')
    setModal('provDetail')
  }

  function editProvider(id) {
    const prov = db.providers.find(x => x.id === id)
    if (!prov) return
    setEditingId(e => ({ ...e, provider: id }))
    setProvForm({ ...prov })
    setNpiInput(prov.npi || '')
    setNpiResult(null)
    setPage('add-provider')
    setModal(null)
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  const provDetail = provDetailId ? db.providers.find(x => x.id === provDetailId) : null

  return (
    <>
      <Head>
        <title>CredFlow — Credentialing. Simplified. Accelerated.</title>
        {/* Fonts loaded globally via _app.js — Plus Jakarta Sans + Geist Mono */}
      </Head>
      <div className="app-root">
        {/* ─── SIDEBAR ─── */}
        <Sidebar page={page} setPage={setPage} alertCount={alertCount} expDocs={expDocs} user={user} signOut={signOut} />

        {/* ─── MAIN ─── */}
        <div className="main">
          <Topbar page={page} setPage={setPage} openEnrollModal={openEnrollModal} openPayerModal={openPayerModal} openDocModal={openDocModal} openTaskModal={openTaskModal} exportJSON={exportJSON} saving={saving} onOpenSearch={()=>setGlobalSearchOpen(true)} alertCount={alertCount} user={user} signOut={signOut} />

          {loading ? (
            <div className="loading-screen">
              <div className="spinner-lg"></div>
              <div style={{ marginTop:16, color:'#5a6e5a' }}>Loading your data…</div>
            </div>
          ) : (
            <div className="pages">
              {/* ── 11 CORE PAGES ── */}
              {page === 'dashboard'    && <WorkflowDashboard db={db} setPage={setPage} openEnrollModal={openEnrollModal} openProvDetail={openProvDetail} />}

              {page === 'providers'    && <ProvidersPage
                db={db}
                provSearch={provSearch} setProvSearch={setProvSearch}
                provFStatus={provFStatus} setProvFStatus={setProvFStatus}
                provFSpec={provFSpec} setProvFSpec={setProvFSpec}
                openProvDetail={openProvDetail} editProvider={editProvider}
                setPage={setPage} setProvForm={setProvForm} setEditingId={setEditingId}
                setNpiInput={setNpiInput} setNpiResult={setNpiResult}
                syncFromNPPES={syncFromNPPES}
                provForm={provForm} editingId={editingId}
                npiInput={npiInput} npiResult={npiResult} npiLoading={npiLoading}
                lookupNPI={lookupNPI} handleSaveProvider={handleSaveProvider}
                handleDeleteProvider={handleDeleteProvider}
                handlePhotoUpload={handlePhotoUpload} handleDeletePhoto={handleDeletePhoto}
                photoUploading={photoUploading} saving={saving}
              />}

              {page === 'applications' && <ApplicationsPage
                db={db} openEnrollModal={openEnrollModal}
                search={enrSearch} setSearch={setEnrSearch}
                fStage={enrFStage} setFStage={setEnrFStage}
                fProv={enrFProv} setFProv={setEnrFProv}
                handleDeleteEnrollment={handleDeleteEnrollment}
              />}

              {page === 'payers'       && <PayerHub
                db={db} initialTab="directory"
                openEnrollModal={openEnrollModal} openPayerModal={openPayerModal}
                search={enrSearch} setSearch={setEnrSearch}
                fStage={enrFStage} setFStage={setEnrFStage}
                fProv={enrFProv} setFProv={setEnrFProv}
                handleDeleteEnrollment={handleDeleteEnrollment}
                paySearch={paySearch} setPaySearch={setPaySearch}
                payFType={payFType} setPayFType={setPayFType}
                handleDeletePayer={handleDeletePayer}
              />}

              {page === 'documents'    && <DocumentsPage
                db={db}
                docSearch={docSearch} setDocSearch={setDocSearch}
                docFType={docFType} setDocFType={setDocFType}
                docFStatus={docFStatus} setDocFStatus={setDocFStatus}
                openDocModal={openDocModal} handleDeleteDocument={handleDeleteDocument}
              />}

              {page === 'tasks'        && <WorkflowTasks db={db} openTaskModal={openTaskModal} handleMarkDone={handleMarkDone} handleDeleteTask={handleDeleteTask} />}

              {page === 'alerts'       && <Alerts db={db} />}

              {page === 'marketing'    && <MarketingPage db={db} setPage={setPage} editProvider={editProvider} />}

              {page === 'reports'      && <Reports db={db} exportJSON={exportJSON} />}

              {page === 'audit'        && <Audit db={db} search={auditSearch} setSearch={setAuditSearch} fType={auditFType} setFType={setAuditFType} handleClearAudit={handleClearAudit} />}

              {page === 'settings'     && <Settings settingsForm={settingsForm} setSettingsForm={setSettingsForm} handleSaveSettings={handleSaveSettings} exportJSON={exportJSON} />}

              {/* ── Legacy page aliases — keep working if navigated to directly ── */}
              {page === 'add-provider' && <AddProvider db={db} provForm={provForm} setProvForm={setProvForm} editingId={editingId} setEditingId={setEditingId} npiInput={npiInput} setNpiInput={setNpiInput} npiResult={npiResult} setNpiResult={setNpiResult} npiLoading={npiLoading} lookupNPI={lookupNPI} handleSaveProvider={handleSaveProvider} handleDeleteProvider={handleDeleteProvider} handlePhotoUpload={handlePhotoUpload} handleDeletePhoto={handleDeletePhoto} photoUploading={photoUploading} setPage={setPage} saving={saving} />}
            </div>
          )}
        </div>

        {/* ─── MODALS ─── */}
        {modal === 'enroll' && <EnrollModal db={db} enrollForm={enrollForm} setEnrollForm={setEnrollForm} editingId={editingId} handleSaveEnrollment={handleSaveEnrollment} onClose={()=>{setModal(null);setEnrollForm({});setEditingId(e=>({...e,enrollment:null}))}} saving={saving} />}
        {modal === 'payer' && <PayerModal payerForm={payerForm} setPayerForm={setPayerForm} editingId={editingId} handleSavePayer={handleSavePayer} onClose={()=>{setModal(null);setPayerForm({});setEditingId(e=>({...e,payer:null}))}} saving={saving} />}
        {modal === 'doc' && <DocModal db={db} docForm={docForm} setDocForm={setDocForm} editingId={editingId} handleSaveDocument={handleSaveDocument} onClose={()=>{setModal(null);setDocForm({});setEditingId(e=>({...e,doc:null}))}} saving={saving} />}
        {modal === 'task' && <TaskModal db={db} taskForm={taskForm} setTaskForm={setTaskForm} editingId={editingId} handleSaveTask={handleSaveTask} onClose={()=>{setModal(null);setTaskForm({});setEditingId(e=>({...e,task:null}))}} saving={saving} />}
        {modal === 'provDetail' && provDetail && <ProvDetailModal prov={provDetail} db={db} onClose={()=>setModal(null)} editProvider={editProvider} openEnrollModal={openEnrollModal} toast={toast} syncFromNPPES={syncFromNPPES} />}
        {npiSyncModal && <NpiSyncModal data={npiSyncModal} onApply={applyNpiSync} onClose={()=>setNpiSyncModal(null)} saving={saving} />}

        {/* ─── TOASTS ─── */}
        {globalSearchOpen && <GlobalSearch db={db} onClose={()=>setGlobalSearchOpen(false)} setPage={setPage} openProvDetail={openProvDetail} openEnrollModal={openEnrollModal} />}

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

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

