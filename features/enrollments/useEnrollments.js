import { upsertEnrollment, deleteEnrollment } from '../../lib/db.js'
import { useState } from 'react'

export function useEnrollments({ db, setDb, toast, setModal, setEditingId, setEnrollForm }) {

  async function handleSaveEnrollment(enrollForm, editingId) {
    try {
      const provN = db.providers.find(p => p.id === enrollForm.provId)
      const payN  = db.payers.find(p => p.id === enrollForm.payId)
      const provName = provN ? `${provN.fname} ${provN.lname}` : ''
      const payName  = payN?.name || ''
      const saved = await upsertEnrollment(
        { ...enrollForm, id: editingId.enrollment || undefined },
        provName, payName
      )
      setDb(prev => ({
        ...prev,
        enrollments: editingId.enrollment
          ? prev.enrollments.map(x => x.id === saved.id ? saved : x)
          : [...prev.enrollments, saved]
      }))
      setModal(null)
      setEditingId(prev => ({ ...prev, enrollment: null }))
      setEnrollForm({})
      toast(editingId.enrollment ? 'Enrollment updated' : 'Enrollment added')
    } catch (e) { toast(e.message, 'error') }
  }

  async function handleDeleteEnrollment(id) {
    try {
      await deleteEnrollment(id)
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.filter(e => e.id !== id) }))
      toast('Enrollment deleted')
    } catch (e) { toast(e.message, 'error') }
  }

  return { handleSaveEnrollment, handleDeleteEnrollment }
}

export { useEnrollments }
