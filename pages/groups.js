import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { GroupsPage } from '../features/groups/GroupsPage.jsx'

export default function Groups() {
  const { db, setDb, toast, openEnrollModal } = useGlobalContext()
  return (
    <>
      <Head><title>Lacentra — Groups</title></Head>
      <GroupsPage db={db} setDb={setDb} toast={toast} openEnrollModal={openEnrollModal} />
    </>
  )
}
