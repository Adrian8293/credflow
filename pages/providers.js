import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { ProvidersPage } from '../features/providers/ProvidersPage.jsx'

export default function Providers() {
  const {
    db, setDb, setPage, openProvDetail, openEnrollModal,
    provSearch, setProvSearch,
    provFStatus, setProvFStatus,
    provFSpec, setProvFSpec,
    providers, enrollments
  } = useGlobalContext()

  return (
    <>
      <Head>
        <title>Lacentra — Providers</title>
      </Head>
      <ProvidersPage
        db={db}
        setDb={setDb}
        provSearch={provSearch}
        setProvSearch={setProvSearch}
        provFStatus={provFStatus}
        setProvFStatus={setProvFStatus}
        provFSpec={provFSpec}
        setProvFSpec={setProvFSpec}
        openProvDetail={openProvDetail}
        editProvider={providers.editProvider}
        pendingEdit={providers.pendingEdit}
        clearPendingEdit={() => providers.setPendingEdit(false)}
        setPage={setPage}
        setProvForm={providers.setProvForm}
        setEditingId={({ provider }) => providers.setEditingProviderId(provider)}
        setNpiInput={providers.setNpiInput}
        setNpiResult={providers.setNpiResult}
        syncFromNPPES={providers.syncFromNPPES}
        provForm={providers.provForm}
        editingId={{ provider: providers.editingProviderId }}
        npiInput={providers.npiInput}
        npiResult={providers.npiResult}
        npiLoading={providers.npiLoading}
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
    </>
  )
}

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth. Removing getServerSideProps eliminates
// the server round-trip that was causing tab-switch delays (every navigation
// previously waited for a /_next/data fetch before rendering).
