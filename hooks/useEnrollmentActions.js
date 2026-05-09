import { useState } from 'react'
import { upsertEnrollment, deleteEnrollment } from '../lib/db'
import { pNameShort, payName } from '../lib/helpers'

export function useEnrollmentActions({ db, setDb, toast, requestConfirm }) {
  const [enrollForm, setEnrollForm]               = useState({})
  const [editingEnrollmentId, setEditingEnrollmentId] = useState(null)
  const [saving, setSaving]                       = useState(false)

  async function handleSaveEnrollment() {
    if (!enrollForm.provId || !enrollForm.payId) {
      toast('Provider and payer required.', 'error'); return
    }
    setSaving(true)
    try {
      const provN = pNameShort(db.providers, enrollForm.provId)
      const payN  = payName(db.payers, enrollForm.payId)
      const saved = await upsertEnrollment(
        { ...enrollForm, id: editingEnrollmentId || undefined },
        provN, payN
      )
      setDb(prev => ({
        ...prev,
        enrollments: editingEnrollmentId
          ? prev.enrollments.map(x => x.id === saved.id ? saved : x)
          : [...prev.enrollments, saved],
      }))
      toast(editingEnrollmentId ? 'Enrollment updated!' : 'Enrollment saved!', 'success')
      setModal(null)
      setEnrollForm({})
      setEditingEnrollmentId(null)
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleDeleteEnrollment(id) {
    if (!(await requestConfirm({
      title: 'Delete Enrollment',
      body: 'This soft-deletes the enrollment record. It will no longer appear in the pipeline but is preserved for audit purposes.',
      confirmText: 'Delete enrollment',
      danger: true,
    }))) return
    try {
      await deleteEnrollment(id)
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleStageChange(enrollmentId, newStage) {
    const enr = db.enrollments.find(e => e.id === enrollmentId)
    if (!enr) return
    try {
      const prov    = db.providers.find(p => p.id === enr.provId)
      const payer   = db.payers.find(p => p.id === enr.payId)
      const saved   = await upsertEnrollment(
        { ...enr, stage: newStage },
        prov ? `${prov.fname} ${prov.lname}` : '',
        payer?.name || ''
      )
      setDb(prev => ({
        ...prev,
        enrollments: prev.enrollments.map(e => e.id === saved.id ? saved : e),
      }))
      toast(`Moved to ${newStage}`, 'success')
    } catch(err) { toast('Stage update failed: ' + err.message, 'error') }
  }

  function openEnrollModal(id, preProvId) {
    setEditingEnrollmentId(id || null)
    if (id) {
      const en = db.enrollments.find(x => x.id === id)
      if (en) setEnrollForm({ ...en })
    } else {
      setEnrollForm({ stage: 'Not Started', eft: 'Not Set Up', era: 'Not Set Up', contract: 'No', provId: preProvId || '', payId: '' })
    }
    setModal('enroll')
  }

  return {
    enrollForm, setEnrollForm,
    editingEnrollmentId, setEditingEnrollmentId,
    saving,
    handleSaveEnrollment, handleDeleteEnrollment, handleStageChange,
    openEnrollModal,
  }
}
