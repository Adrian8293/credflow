import React from 'react'
import Head from 'next/head'
import { useGlobalContext } from '../context/AppContext'
import { TasksPage } from '../features/tasks/TasksPage.jsx'

export default function Tasks() {
  const { db, openTaskModal, openProvDetail, tasks, user } = useGlobalContext()

  return (
    <>
      <Head>
        <title>Lacentra — Tasks</title>
      </Head>
      <TasksPage
        db={db}
        userId={user?.id}
        openTaskModal={openTaskModal}
        openProvDetail={openProvDetail}
        handleMarkDone={tasks.handleMarkDone}
        handleReopen={tasks.handleReopen}
        handleQuickAdd={tasks.handleQuickAdd}
        handleDeleteTask={tasks.handleDeleteTask}
        handleAssign={tasks.handleAssign}
      />
    </>
  )
}

// Static page — no getServerSideProps needed.
// Auth is enforced client-side: Layout.jsx redirects unauthenticated
// users to /login via useAuth.
