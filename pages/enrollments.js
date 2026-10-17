import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { ApplicationsPage } from '../features/enrollments/ApplicationsPage.jsx'

export default function Enrollments() {
  const {
    db, openEnrollModal, openAiFollowup, loading,
    enrSearch, setEnrSearch,
    enrFStage, setEnrFStage,
    enrFProv, setEnrFProv,
    enrollments
  } = useGlobalContext()

  return (
    <>
      <Head>
        <title>Lacentra — Enrollments</title>
      </Head>
      <ApplicationsPage
        db={db}
        openEnrollModal={openEnrollModal}
        search={enrSearch}
        setSearch={setEnrSearch}
        fStage={enrFStage}
        setFStage={setEnrFStage}
        fProv={enrFProv}
        setFProv={setEnrFProv}
        handleDeleteEnrollment={enrollments.handleDeleteEnrollment}
        onDraftEmail={openAiFollowup}
        handleStageChange={enrollments.handleStageChange}
        handleBulkStage={enrollments.handleBulkStage}
        handleBulkFollowup={enrollments.handleBulkFollowup}
        handleBulkDelete={enrollments.handleBulkDelete}
        loading={loading}
      />
    </>
  )
}

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth. Removing getServerSideProps eliminates
// the server round-trip that was causing tab-switch delays (every navigation
// previously waited for a /_next/data fetch before rendering).
