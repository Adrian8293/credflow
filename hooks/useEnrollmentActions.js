import { useState } from 'react'
import { upsertEnrollment, deleteEnrollment, addAudit, bulkSetStage, bulkSetFollowup, bulkDeleteEnrollments } from '../lib/db'
import { pNameShort, payName, fmtDate } from '../lib/helpers'
import { suggestFollowup, needsFollowup } from '../constants/followupCadence'
import { saveFollowUp } from './useCompletion'
import { completionContext } from '../lib/completion'

const CLOSING_STAGES = ['Active', 'Approved', 'Denied']

export function useEnrollmentActions({ db, setDb, toast, requestConfirm, requestCompletion }) {
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
      // A new application with no owner picked starts with its provider's owner (when ownership is available).
      const ownerless = !editingEnrollmentId && db.staff && !enrollForm.assigneeId
      const form = ownerless ? { ...enrollForm, assigneeId: db.providers.find(p => p.id === enrollForm.provId)?.assigneeId || '' } : enrollForm
      const saved = await upsertEnrollment(
        { ...form, id: editingEnrollmentId || undefined },
        provN, payN
      )
      setDb(prev => ({
        ...prev,
        enrollments: editingEnrollmentId
          ? prev.enrollments.map(x => x.id === saved.id ? saved : x)
          : [...prev.enrollments, saved],
      }))
      toast(editingEnrollmentId ? 'Enrollment updated!' : 'Enrollment saved!', 'success')
      // setModal(null) is handled by handleSaveEnrollment wrapper in index.js
      setEnrollForm({})
      setEditingEnrollmentId(null)
    } catch(err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteEnrollment(id) {
    if (!(await requestConfirm({
      title: 'Delete Enrollment',
      body: 'This soft-deletes the enrollment record. It will no longer appear in the pipeline but is preserved for audit purposes.',
      confirmText: 'Delete enrollment',
      danger: true,
    }))) return
    try {
      await deleteEnrollment(id, (() => {
        const e = db.enrollments.find(x => x.id === id); if (!e) return undefined
        const p = db.providers.find(x => x.id === e.provId); const y = db.payers.find(x => x.id === e.payId)
        return `${p ? `${p.fname} ${p.lname}`.trim() : 'Provider'} — ${y?.name || 'Payer'}`
      })())
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleStageChange(enrollmentId, newStage) {
    const enr = db.enrollments.find(e => e.id === enrollmentId)
    if (!enr) return
    const prevStage = enr.stage
    // Closing an application (approved, active or denied) goes through the completion check, so a pending
    // document, contract page or appeal cannot be forgotten.
    let completion = null
    if (CLOSING_STAGES.includes(newStage) && newStage !== prevStage) {
      completion = await requestCompletion({
        title: `Before you move this to ${newStage}`,
        subject: `${pNameShort(db.providers, enr.provId)} — ${payName(db.payers, enr.payId)}`,
        noteLabel: newStage === 'Denied' ? 'What did the payer say?' : 'How was this confirmed?',
        notePlaceholder: newStage === 'Denied' ? 'e.g. Denial letter received; reason: missing malpractice certificate.' : 'e.g. Approval letter received and saved in Documents.',
        confirmText: `Move to ${newStage}`,
        context: completionContext({ db, provId: enr.provId }),
      })
      if (!completion) return false
    }
    try {
      const prov    = db.providers.find(p => p.id === enr.provId)
      const payer   = db.payers.find(p => p.id === enr.payId)
      const provName = prov ? `${prov.fname} ${prov.lname}` : ''
      const payerName = payer?.name || ''
      // Suggest a follow-up date for the new stage when there is none (or the old one has passed).
      const sug = suggestFollowup(newStage)
      const followup = sug && needsFollowup(enr.followup) ? sug.date : enr.followup
      const saved   = await upsertEnrollment(
        { ...enr, stage: newStage, followup },
        provName,
        payerName
      )
      setDb(prev => ({
        ...prev,
        enrollments: prev.enrollments.map(e => e.id === saved.id ? saved : e),
      }))
      // ── Compliance audit trail (NCQA/URAC) ──────────────────────────────
      // Every stage transition is recorded as its own audit entry so reviewers
      // can reconstruct the full credentialing timeline for any enrollment.
      try {
        await addAudit(
          'Enrollment',
          'Stage Changed',
          `${provName} / ${payerName}: "${prevStage}" → "${newStage}"${completion ? ` — ${completion.note}` : ''}`,
          enrollmentId
        )
      } catch (_) { /* audit failure should not block stage transition */ }

      toast(followup && followup !== enr.followup ? `Moved to ${newStage}. Follow-up set for ${fmtDate(followup)}.` : `Moved to ${newStage}`, 'success')
      if (completion) await saveFollowUp(completion, { provId: enr.provId, payId: enr.payId, task: `${newStage}: ${provName} / ${payerName}`, ...('assigneeId' in enr ? { assigneeId: enr.assigneeId } : {}) }, { setDb, toast })
      return true
    } catch(err) { toast('Stage update failed: ' + err.message, 'error'); return false }
  }

  // ── Bulk actions: one confirmation, batched requests, per-enrollment audit entries ──────────
  const bulkLabel = e => `${pNameShort(db.providers, e?.provId)} / ${payName(db.payers, e?.payId)}`
  const byId = ids => Object.fromEntries(db.enrollments.filter(e => ids.includes(e.id)).map(e => [e.id, e]))
  const merge = saved => setDb(prev => ({
    ...prev,
    enrollments: prev.enrollments.map(e => saved.find(s => s.id === e.id) || e),
  }))

  // One tap: the provider has authorized this payer in CAQH.
  async function handleCaqhAuthorized(id) {
    const enr = db.enrollments.find(e => e.id === id)
    if (!enr) return false
    const completion = await requestCompletion({
      title: 'Before you mark CAQH as authorized',
      subject: `${pNameShort(db.providers, enr.provId)} — ${payName(db.payers, enr.payId)}`,
      noteLabel: 'How did you confirm the authorization?',
      notePlaceholder: 'e.g. Payer shows as authorized in the CAQH ProView list.',
      confirmText: 'Mark authorized',
      context: completionContext({ db, provId: enr.provId }),
    })
    if (!completion) return false
    try {
      const saved = await upsertEnrollment({ ...enr, caqhStatus: 'authorized' }, pNameShort(db.providers, enr.provId), payName(db.payers, enr.payId))
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.map(e => e.id === saved.id ? saved : e) }))
      toast('Marked as authorized in CAQH.', 'success')
      addAudit('Enrollment', 'CAQH authorized', `${pNameShort(db.providers, enr.provId)} / ${payName(db.payers, enr.payId)} — ${completion.note}`, enr.id).catch(() => {})
      await saveFollowUp(completion, { provId: enr.provId, payId: enr.payId, task: 'CAQH authorization' }, { setDb, toast })
      return true
    } catch (err) { toast(err.message, 'error'); return false }
  }

  async function handleBulkStage(ids, stage) {
    const before = byId(ids)
    const todo = ids.filter(id => before[id] && before[id].stage !== stage)
    if (!todo.length) { toast(`Already in ${stage}.`, 'warn'); return false }
    if (!(await requestConfirm({
      title: `Move ${todo.length} application${todo.length === 1 ? '' : 's'}`,
      body: `Move ${todo.length} selected application${todo.length === 1 ? '' : 's'} to "${stage}"${ids.length !== todo.length ? ` (${ids.length - todo.length} already there, skipped)` : ''}? Each change is recorded in the audit trail.`,
      confirmText: `Move to ${stage}`,
    }))) return false
    try {
      merge(await bulkSetStage(todo, stage, before, bulkLabel))
      toast(`${todo.length} moved to ${stage}.`, 'success')
      return true
    } catch (err) { toast('Bulk update failed: ' + err.message, 'error'); return false }
  }

  async function handleBulkFollowup(ids, date) {
    const before = byId(ids)
    const todo = ids.filter(id => before[id])
    if (!todo.length) return false
    if (!(await requestConfirm({
      title: date ? 'Set follow-up date' : 'Clear follow-up date',
      body: date
        ? `Set the follow-up date to ${date} on ${todo.length} application${todo.length === 1 ? '' : 's'}?`
        : `Clear the follow-up date on ${todo.length} application${todo.length === 1 ? '' : 's'}?`,
      confirmText: date ? 'Set date' : 'Clear dates',
    }))) return false
    try {
      merge(await bulkSetFollowup(todo, date, before, bulkLabel))
      toast(date ? `Follow-up set on ${todo.length}.` : `Follow-up cleared on ${todo.length}.`, 'success')
      return true
    } catch (err) { toast('Bulk update failed: ' + err.message, 'error'); return false }
  }

  async function handleBulkDelete(ids) {
    const before = byId(ids)
    const todo = ids.filter(id => before[id])
    if (!todo.length) return false
    if (!(await requestConfirm({
      title: `Delete ${todo.length} application${todo.length === 1 ? '' : 's'}`,
      body: `This soft-deletes ${todo.length} enrollment record${todo.length === 1 ? '' : 's'}. They leave the pipeline but are preserved for audit purposes.`,
      confirmText: `Delete ${todo.length}`,
      danger: true,
    }))) return false
    try {
      const done = await bulkDeleteEnrollments(todo, before, bulkLabel)
      setDb(prev => ({ ...prev, enrollments: prev.enrollments.filter(e => !done.includes(e.id)) }))
      toast(`${done.length} deleted.`, 'warn')
      return true
    } catch (err) { toast('Bulk delete failed: ' + err.message, 'error'); return false }
  }

  function openEnrollModal(id, preProvId, prePayId) {
    setEditingEnrollmentId(id || null)
    if (id) {
      const en = db.enrollments.find(x => x.id === id)
      if (en) setEnrollForm({ ...en })
    } else {
      setEnrollForm({ stage: 'Not Started', eft: 'Not Set Up', era: 'Not Set Up', contract: 'No', level: 'Individual', provId: preProvId || '', payId: prePayId || '', ...(db.staff ? { assigneeId: db.providers.find(p => p.id === preProvId)?.assigneeId || '' } : {}) })
    }
    // Note: setModal('enroll') is called by the wrapper in index.js — do NOT call it here
  }

  return {
    enrollForm, setEnrollForm,
    editingEnrollmentId, setEditingEnrollmentId,
    saving,
    handleSaveEnrollment, handleDeleteEnrollment, handleStageChange,
    handleBulkStage, handleBulkFollowup, handleBulkDelete, handleCaqhAuthorized,
    openEnrollModal,
  }
}
