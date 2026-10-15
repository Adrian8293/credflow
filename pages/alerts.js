import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { Alerts as AlertsView } from '../features/billing/Alerts.jsx'

export default function Alerts() {
  const { db, providers, openAiFollowup, setPage, openEnrollModal } = useGlobalContext()

  const handleOpenProvider = (id) => {
    providers.editProvider(id)
    setPage('providers')
  }

  return (
    <>
      <Head>
        <title>Lacentra — Alerts</title>
      </Head>
      <AlertsView
        db={db}
        onOpenProvider={handleOpenProvider}
        onDraftEmail={openAiFollowup}
        onMarkDone={providers.handleAlertMarkDone}
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
