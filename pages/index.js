import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { Dashboard } from '../features/billing/Dashboard.jsx'

export default function IndexPage() {
  const { db, setPage, openEnrollModal, openAiFollowup, openPayerModal, openProvDetail, openTaskModal, activeOrg } = useGlobalContext()

  return (
    <>
      <Head>
        <title>Lacentra — Today</title>
      </Head>
      <Dashboard
        db={db}
        setPage={setPage}
        openEnrollModal={openEnrollModal}
        onDraftEmail={openAiFollowup}
        openPayerModal={openPayerModal}
        openProvDetail={openProvDetail}
        openTaskModal={openTaskModal}
        role={activeOrg?.role}
        orgId={activeOrg?.org_id}
      />
    </>
  )
}

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth. Removing getServerSideProps eliminates
// the server round-trip that was causing tab-switch delays (every navigation
// previously waited for a /_next/data fetch before rendering).
