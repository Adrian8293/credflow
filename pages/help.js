import React from 'react'
import Head from 'next/head'
import { HelpPage } from '../features/help/HelpPage.jsx'

export default function Help() {
  return (
    <>
      <Head>
        <title>Lacentra — Help</title>
      </Head>
      <HelpPage />
    </>
  )
}
