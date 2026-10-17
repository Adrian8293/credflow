import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { RequestsPage } from '../features/requests/RequestsPage.jsx'

export default function Requests() {
  const { db, setDb, toast } = useGlobalContext()
  return (
    <>
      <Head><title>Lacentra — Requests</title></Head>
      <RequestsPage db={db} setDb={setDb} toast={toast} />
    </>
  )
}
