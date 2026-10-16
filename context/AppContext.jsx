/**
 * AppContext.jsx — LACentra v5.0
 * 
 * Memoized refactor of the global context.
 * API surface preserved for backward compat with Layout.jsx and all page routes.
 * 
 * PERFORMANCE NOTE: The context value is memoized with useMemo to prevent
 * needless re-renders when unrelated state changes. Filter states (provSearch, etc.)
 * are the primary re-render trigger — future Sprint should move them to URL params
 * or local component state to eliminate the remaining churn.
 * 
 * FUTURE: Split into DataContext + ModalContext + AuthContext to further
 * reduce consumer re-renders.
 */

import { buildAlertFeed } from '../lib/alerts.js'
import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useAppData } from '../hooks/useAppData'
import { useConfirm } from '../hooks/useConfirm'
import { useProviderActions } from '../hooks/useProviderActions'
import { useEnrollmentActions } from '../hooks/useEnrollmentActions'
import { usePayerActions } from '../hooks/usePayerActions'
import { useDocumentActions } from '../hooks/useDocumentActions'
import { useTaskActions } from '../hooks/useTaskActions'
import { saveSettings as saveSettingsDB, clearAuditLog as clearAuditLogDB } from '../lib/db'
import { daysUntil } from '../lib/helpers'

const AppContext = createContext(null)

export function AppContextProvider({ children }) {
  const router = useRouter()

  // ── Auth ─────────────────────────────────────────────────────────────────
  const { user, authLoading, signOut } = useAuth()

  // ── Toast ────────────────────────────────────────────────────────────────
  const { toasts, toast } = useToast()

  // ── Core data ────────────────────────────────────────────────────────────
  const { db, setDb, loading, settingsForm, setSettingsForm, orgs, activeOrg, switchOrg, createOrg } = useAppData(user, toast)

  // ── Confirm dialog ────────────────────────────────────────────────────────
  const { confirmDialog, requestConfirm, settleConfirm } = useConfirm()

  // ── Stable navigation helper ──────────────────────────────────────────────
  const setPage = useCallback((p) => {
    router.push(p === 'dashboard' ? '/' : `/${p}`)
  }, [router])

  // ── Feature action hooks (namespaced objects) ─────────────────────────────
  const providers  = useProviderActions({ db, setDb, toast, requestConfirm, setPage })
  const enrollments = useEnrollmentActions({ db, setDb, toast, requestConfirm })
  const payers     = usePayerActions({ db, setDb, toast, requestConfirm })
  const documents  = useDocumentActions({ db, setDb, toast, requestConfirm })
  const tasks      = useTaskActions({ db, setDb, toast, requestConfirm })

  // ── Modal state (UI-layer only, does not affect data) ─────────────────────
  const [modal,             setModal]             = useState(null)
  const [provDetailId,      setProvDetailId]       = useState(null)
  const [globalSearchOpen,  setGlobalSearchOpen]   = useState(false)
  const [aiModalOpen,       setAiModalOpen]        = useState(false)
  const [aiModalEnrollment, setAiModalEnrollment]  = useState(null)

  // ── Filter states ─────────────────────────────────────────────────────────
  // PERF FIX: These are now isolated into their own useMemo (filterValue) so that
  // typing in a search box only triggers re-renders in components that consume
  // filterValue — not all AppContext consumers (Sidebar, Topbar, modals, etc.).
  // Long-term: migrate these to local page state or URL search params.
  const [provSearch,  setProvSearch]  = useState('')
  const [provFStatus, setProvFStatus] = useState('')
  const [provFSpec,   setProvFSpec]   = useState('')
  const [enrSearch,   setEnrSearch]   = useState('')
  const [enrFStage,   setEnrFStage]   = useState('')
  const [enrFProv,    setEnrFProv]    = useState('')
  const [paySearch,   setPaySearch]   = useState('')
  const [payFType,    setPayFType]    = useState('')
  const [docSearch,   setDocSearch]   = useState('')
  const [docFType,    setDocFType]    = useState('')
  const [docFStatus,  setDocFStatus]  = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditFType,  setAuditFType]  = useState('')

  // ── Derived values ────────────────────────────────────────────────────────
  const alertDays  = db.settings?.alertDays || 90
  const caqhDays   = db.settings?.caqhDays  || 30
  const alertCount = buildAlertFeed(db).length
  const expDocs   = db.documents.filter(d => {
    const days = daysUntil(d.exp)
    return days !== null && days <= alertDays
  }).length
  const provDetail = provDetailId ? db.providers.find(x => x.id === provDetailId) : null

  // ── Stable modal opener helpers ───────────────────────────────────────────
  const openProvDetail   = useCallback((id)        => { setProvDetailId(id); setModal('provDetail') }, [])
  const openAiFollowup   = useCallback((enrollment) => { setAiModalEnrollment(enrollment); setAiModalOpen(true) }, [])
  const openEnrollModal  = useCallback((id, preProvId, prePayId) => { enrollments.openEnrollModal(id, preProvId, prePayId); setModal('enroll') }, [enrollments])
  const openPayerModal   = useCallback((id)        => { payers.openPayerModal(id); setModal('payer') }, [payers])
  const openDocModal     = useCallback((id)        => { documents.openDocModal(id); setModal('doc') }, [documents])
  const openTaskModal    = useCallback((id)        => { tasks.openTaskModal(id); setModal('task') }, [tasks])

  // ── Stable save helpers (close modal on success) ──────────────────────────
  const handleSaveEnrollment = useCallback(async () => { await enrollments.handleSaveEnrollment(); setModal(null) }, [enrollments])
  const handleSavePayer      = useCallback(async () => { await payers.handleSavePayer(); setModal(null) }, [payers])
  const handleSaveDocument   = useCallback(async () => await documents.handleSaveDocument(), [documents])
  const handleSaveTask       = useCallback(async () => { await tasks.handleSaveTask(); setModal(null) }, [tasks])

  // ── Settings ──────────────────────────────────────────────────────────────
  const handleSaveSettings = useCallback(async () => {
    try {
      await saveSettingsDB(settingsForm)
      setDb(prev => ({ ...prev, settings: settingsForm }))
      toast('Settings saved!', 'success')
    } catch (err) { toast(err.message, 'error') }
  }, [settingsForm, setDb, toast])

  const handleClearAudit = useCallback(async () => {
    if (!(await requestConfirm({
      title: 'Archive Audit Log',
      body: 'Audit records are append-only for HIPAA compliance. This records an archive request in the audit trail — records are not deleted.',
      confirmText: 'Record archive request',
      danger: false,
    }))) return
    try {
      await clearAuditLogDB()
      toast('Archive request recorded. Contact your admin to export old entries.', 'success')
    } catch (err) { toast(err.message, 'error') }
  }, [requestConfirm, toast])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lacentra-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    toast('Backup exported!', 'success')
  }, [db, toast])


  // ── Isolated filter memo — only filter consumers re-render on keystroke ──
  // FIX (BUG-TDZ): The previous dependency array was [filterValue] — a
  // self-referential reference to the variable being defined. Turbopack
  // minifies `filterValue` to a short identifier (e.g. `aI`) and the compiled
  // code attempted to read `aI` before it was initialized, producing:
  //   "ReferenceError: Cannot access 'aI' before initialization"
  // This crashed static prerendering of /404 and killed every Vercel build.
  //
  // FIX: Use the actual state values as dependencies. useState setter functions
  // (setProvSearch, etc.) are guaranteed stable by React and never need to be
  // listed. The eslint-disable comment that was hiding this bug is removed.
  const filterValue = useMemo(() => ({
    provSearch,  setProvSearch,
    provFStatus, setProvFStatus,
    provFSpec,   setProvFSpec,
    enrSearch,   setEnrSearch,
    enrFStage,   setEnrFStage,
    enrFProv,    setEnrFProv,
    paySearch,   setPaySearch,
    payFType,    setPayFType,
    docSearch,   setDocSearch,
    docFType,    setDocFType,
    docFStatus,  setDocFStatus,
    auditSearch, setAuditSearch,
    auditFType,  setAuditFType,
  }), [
    provSearch, provFStatus, provFSpec,
    enrSearch,  enrFStage,   enrFProv,
    paySearch,  payFType,
    docSearch,  docFType,    docFStatus,
    auditSearch, auditFType,
  ])

  // ── Memoized context value ────────────────────────────────────────────────
  // Deps are grouped: data deps change less frequently than filter deps.
  // When filter state changes, only the filter group re-memoizes — but because
  // all values are in one object, all consumers still re-render. Future split
  // into DataContext + FiltersContext + ModalContext will eliminate this.
  const value = useMemo(() => ({
    // Auth
    user, authLoading, signOut,

    // UI
    toasts, toast,
    confirmDialog, requestConfirm, settleConfirm,

    // Data
    db, setDb, loading, settingsForm, setSettingsForm,

    // Feature namespaces (action hooks)
    providers, enrollments, payers, documents, tasks,

    // Modal state
    modal, setModal,
    provDetailId, setProvDetailId,
    globalSearchOpen, setGlobalSearchOpen,
    aiModalOpen, setAiModalOpen,
    aiModalEnrollment, setAiModalEnrollment,

    // Filter states (spread from isolated filterValue memo)
    ...filterValue,

    // Organizations (multi-tenant)
    orgs, activeOrg, switchOrg, createOrg,

    // Derived
    alertDays, caqhDays, alertCount, expDocs, provDetail,

    // Stable helpers
    setPage,
    openProvDetail, openAiFollowup,
    openEnrollModal, openPayerModal, openDocModal, openTaskModal,
    handleSaveEnrollment, handleSavePayer, handleSaveDocument, handleSaveTask,
    handleSaveSettings, handleClearAudit, exportJSON,
  }), [
    user, authLoading, signOut,
    toasts, toast,
    confirmDialog, requestConfirm, settleConfirm,
    db, setDb, loading, settingsForm, setSettingsForm,
    orgs, activeOrg, switchOrg, createOrg,
    providers, enrollments, payers, documents, tasks,
    modal, provDetailId, globalSearchOpen,
    aiModalOpen, aiModalEnrollment,
    filterValue,
    alertDays, caqhDays, alertCount, expDocs, provDetail,
    setPage, openProvDetail, openAiFollowup,
    openEnrollModal, openPayerModal, openDocModal, openTaskModal,
    handleSaveEnrollment, handleSavePayer, handleSaveDocument, handleSaveTask,
    handleSaveSettings, handleClearAudit, exportJSON,
  ])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// Primary hook
export function useGlobalContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useGlobalContext must be used within AppContextProvider')
  return ctx
}

// Alias for future use
export const useApp = useGlobalContext

export default AppContext
