import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { DocumentsPage } from '../features/documents/DocumentsPage.jsx'

export default function Documents() {
  const {
    db, setDb, toast, setPage, providers, openDocModal,
    docSearch, setDocSearch,
    docFType, setDocFType,
    docFStatus, setDocFStatus,
    documents
  } = useGlobalContext()

  return (
    <>
      <Head>
        <title>Lacentra — Documents</title>
      </Head>
      <DocumentsPage
        db={db}
        docSearch={docSearch}
        setDocSearch={setDocSearch}
        docFType={docFType}
        setDocFType={setDocFType}
        docFStatus={docFStatus}
        setDocFStatus={setDocFStatus}
        openDocModal={openDocModal}
        handleDeleteDocument={documents.handleDeleteDocument}
        actions={{ setDb, toast, setPage, editProvider: providers.editProvider, setDocForm: documents.setDocForm }}
      />
    </>
  )
}

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth. Removing getServerSideProps eliminates
// the server round-trip that was causing tab-switch delays (every navigation
// previously waited for a /_next/data fetch before rendering).
