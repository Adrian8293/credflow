import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { ScreeningPage } from '../features/compliance/ScreeningPage.jsx'

export default function Screening() {
  const { db, setDb, toast, activeOrg, openProvDetail } = useGlobalContext()
  return (
    <>
      <Head><title>Lacentra — Screening</title></Head>
      <ScreeningPage db={db} setDb={setDb} toast={toast} role={activeOrg?.role} onOpenProvider={openProvDetail} />
    </>
  )
}
