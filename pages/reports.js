import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { Reports as ReportsView } from '../features/billing/Reports.jsx'

export default function Reports() {
  const { db, exportJSON, openProvDetail, openEnrollModal, toast } = useGlobalContext()

  return (
    <>
      <Head>
        <title>Lacentra — Reports</title>
      </Head>
      <ReportsView
        db={db}
        exportJSON={exportJSON}
        toast={toast}
        onOpenProvider={openProvDetail}
        onOpenEnrollment={(id) => openEnrollModal(id)}
      />
    </>
  )
}

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth. Removing getServerSideProps eliminates
// the server round-trip that was causing tab-switch delays (every navigation
// previously waited for a /_next/data fetch before rendering).
