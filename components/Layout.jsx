import React, { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useGlobalContext } from '../context/AppContext'
import { Sidebar } from './ui/Sidebar.jsx'
import { Topbar } from './ui/Topbar.jsx'
import { Modal } from './ui/Modal.jsx'
import { EnrollModal } from '../features/enrollments/EnrollModal.jsx'
import { PayerModal } from '../features/payers/PayerModal.jsx'
import { DocModal } from '../features/documents/DocModal.jsx'
import { TaskModal } from '../features/documents/TaskModal.jsx'
import { ProvDetailModal } from '../features/providers/ProvDetailModal.jsx'
import { NpiSyncModal } from '../features/providers/NpiSyncModal.jsx'
import { AiFollowupModal } from './AiFollowupModal.jsx'
import { GlobalSearch } from './GlobalSearch.jsx'
import { MfaChallenge } from './MfaChallenge.jsx'
import { useIdleLogout } from '../hooks/useIdleLogout'
import { supabase } from '../lib/supabase'

export function Layout({ children }) {
  const router = useRouter()
  const {
    user, authLoading, signOut, db, loading, setPage, activeOrg, orgsLoaded,
    toasts, toast,
    confirmDialog, settleConfirm,
    modal, setModal,
    provDetailId, setProvDetailId,
    globalSearchOpen, setGlobalSearchOpen,
    aiModalOpen, setAiModalOpen,
    aiModalEnrollment, setAiModalEnrollment,
    alertCount, expDocs, provDetail,
    openProvDetail, openEnrollModal, openPayerModal, openDocModal, openTaskModal,
    handleSaveEnrollment, handleSavePayer, handleSaveDocument, handleSaveTask,
    exportJSON, providers, enrollments, payers, documents, tasks
  } = useGlobalContext()

  // Map router pathname to Sidebar highlighted page state
  const getSidebarPage = () => {
    const path = router.pathname
    if (path === '/') return 'dashboard'
    if (path === '/add-provider') return 'add-provider'
    if (path === '/providers') return 'providers'
    if (path === '/enrollments') return 'applications'
    if (path === '/payers') return 'payers'
    if (path === '/documents') return 'documents'
    if (path === '/tasks') return 'tasks'
    if (path === '/alerts') return 'alerts'
    if (path === '/reports') return 'reports'
    if (path === '/audit') return 'audit'
    if (path === '/settings') return 'settings'
    if (path === '/help') return 'help'
    return 'dashboard'
  }

  const activePage = getSidebarPage()

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  // Automatic logoff after 30 minutes idle (Settings → Security; on by default).
  const idle = useIdleLogout({
    enabled: !!user && db?.settings?.sessionTimeout !== false,
    minutes: 30,
    onTimeout: async () => { try { await supabase.auth.signOut() } catch { /* ignore */ } window.location.href = '/login?reason=idle' },
  })

  // Two-step verification gate: if the account has an authenticator app but this session has not passed
  // the code check yet (aal1 → aal2), show the code screen instead of the app.
  const [mfaState, setMfaState] = React.useState('checking')   // checking | needed | ok
  useEffect(() => {
    if (!user) return
    let live = true
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (!live) return
      setMfaState(!error && data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2' ? 'needed' : 'ok')
    }).catch(() => live && setMfaState('ok'))
    return () => { live = false }
  }, [user])

  // Providers and clinic staff only get the portal; staff never sit on the portal page.
  const role = activeOrg?.role
  const isPortalRole = role === 'provider' || role === 'clinic_staff'
  useEffect(() => {
    if (!user || !orgsLoaded || !role) return
    if (isPortalRole && router.pathname !== '/portal') router.replace('/portal')
    if (!isPortalRole && router.pathname === '/portal') router.replace('/')
  }, [user, orgsLoaded, role, isPortalRole, router])

  if (authLoading || (user && mfaState === 'checking') || (user && !orgsLoaded) || (loading && !isPortalRole)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', color: '#6B7280', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E5E7EB', borderTopColor: '#1565C0', borderRadius: '50%', animation: 'spin .65s linear infinite' }} />
        <span style={{ fontSize: 13 }}>Loading Lacentra…</span>
      </div>
    )
  }

  if (!user) return null

  if (mfaState === 'needed') return <MfaChallenge onVerified={() => window.location.reload()} onSignOut={signOut} />

  // Portal roles never see the staff chrome (sidebar, modals, staff data).
  if (isPortalRole) return router.pathname === '/portal' ? <>{idle.secondsLeft !== null && <div role="alert" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#b54708', color: '#fff', textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>You will be signed out in {idle.secondsLeft}s because of inactivity. Move your mouse or press a key to stay signed in.</div>}{children}</> : null
  if (router.pathname === '/portal') return null

  const idleBanner = idle.secondsLeft !== null && (
    <div role="alert" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#b54708', color: '#fff', textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>
      You will be signed out in {idle.secondsLeft}s because of inactivity. Move your mouse or press a key to stay signed in.
    </div>
  )

  return (
    <div className="app-root">
      {idleBanner}
      <Sidebar
        page={activePage}
        setPage={setPage}
        alertCount={alertCount}
        expDocs={expDocs}
        user={user}
        signOut={signOut}
        db={db}
      />

      <div className="main">
        <Topbar
          page={activePage}
          setPage={setPage}
          openEnrollModal={openEnrollModal}
          openPayerModal={openPayerModal}
          openDocModal={openDocModal}
          openTaskModal={openTaskModal}
          exportJSON={exportJSON}
          saving={providers.saving}
          onOpenSearch={() => setGlobalSearchOpen(true)}
          alertCount={alertCount}
          user={user}
          signOut={signOut}
          db={db}
          openProvDetail={openProvDetail}
        />

        <div className="pages">
          {children}
        </div>
      </div>

      {modal === 'enroll' && (
        <EnrollModal
          db={db}
          enrollForm={enrollments.enrollForm}
          setEnrollForm={enrollments.setEnrollForm}
          editingId={{ enrollment: enrollments.editingEnrollmentId }}
          handleSaveEnrollment={handleSaveEnrollment}
          onClose={() => { setModal(null); enrollments.setEnrollForm({}); enrollments.setEditingEnrollmentId?.(null) }}
          saving={enrollments.saving}
          onAddPayer={() => { setModal(null); setTimeout(() => openPayerModal(), 50) }}
        />
      )}
      {modal === 'payer' && (
        <PayerModal
          payerForm={payers.payerForm}
          setPayerForm={payers.setPayerForm}
          editingId={{ payer: payers.editingPayerId }}
          handleSavePayer={handleSavePayer}
          onClose={() => { setModal(null); payers.setPayerForm({}) }}
          saving={payers.saving}
        />
      )}
      {modal === 'doc' && (
        <DocModal
          db={db}
          docForm={documents.docForm}
          setDocForm={documents.setDocForm}
          editingId={{ doc: documents.editingDocId }}
          handleSaveDocument={handleSaveDocument}
          onClose={() => { setModal(null); documents.setDocForm({}) }}
          saving={documents.saving}
          toast={toast}
        />
      )}
      {modal === 'task' && (
        <TaskModal
          db={db}
          taskForm={tasks.taskForm}
          setTaskForm={tasks.setTaskForm}
          editingId={{ task: tasks.editingTaskId }}
          handleSaveTask={handleSaveTask}
          onClose={() => { setModal(null); tasks.setTaskForm({}) }}
          saving={tasks.saving}
        />
      )}
      {modal === 'provDetail' && provDetail && (
        <ProvDetailModal
          prov={provDetail}
          db={db}
          onClose={() => setModal(null)}
          editProvider={providers.editProvider}
          openEnrollModal={openEnrollModal}
          toast={toast}
          syncFromNPPES={providers.syncFromNPPES}
          onSaveLicense={providers.handleSaveLicense}
          onDeleteLicense={providers.handleDeleteLicense}
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
          alertLabel={aiModalEnrollment.alertLabel}
          alertDays={aiModalEnrollment.alertDays}
          alertDate={aiModalEnrollment.alertDate}
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
            <div className="toast-icon">
              {t.type === 'success' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : t.type === 'error' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              ) : t.type === 'warn' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              )}
            </div>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
