import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { MatrixPage } from '../features/matrix/MatrixPage.jsx'

export default function Matrix() {
  const { db, openEnrollModal } = useGlobalContext()
  return (
    <>
      <Head><title>Lacentra — Billing Matrix</title></Head>
      <MatrixPage db={db} openEnrollModal={openEnrollModal} />
    </>
  )
}
