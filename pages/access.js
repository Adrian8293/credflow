import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { AccessPage } from '../features/access/AccessPage.jsx'

export default function Access() {
  const { db, toast, activeOrg } = useGlobalContext()
  return (
    <>
      <Head><title>Lacentra — Access</title></Head>
      <AccessPage db={db} toast={toast} activeOrg={activeOrg} />
    </>
  )
}
