import { useState } from 'react'
import { Modal } from '../../components/ui/Modal.jsx'
import { DateInput } from '../../components/ui/DateInput.jsx'

export function TaskModal({ db, taskForm, setTaskForm, editingId, handleSaveTask, onClose, saving }) {
  const f   = k => taskForm[k] ?? ''
  const set = (k, v) => setTaskForm(prev => ({ ...prev, [k]: v }))

  // Inline validation — mirrors EnrollModal pattern for consistency
  const [touched, setTouched] = useState({ task: false, due: false })
  const taskInvalid = touched.task && !f('task').trim()
  const dueInvalid  = touched.due  && !f('due')

  function handleSaveWithValidation() {
    setTouched({ task: true, due: true })
    if (!f('task').trim() || !f('due')) return
    handleSaveTask()
  }

  const fieldStyle = invalid => ({
    border: invalid ? '1.5px solid var(--danger)' : undefined,
    borderRadius: 'var(--r)',
  })

  const InlineError = ({ msg }) => (
    <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  )

  return (
    <Modal
      title={editingId.task ? 'Edit Task' : 'New Task'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveWithValidation} disabled={saving}>
            {saving ? 'Saving…' : 'Save Task'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="fg full">
          <label style={{ color: taskInvalid ? 'var(--danger)' : undefined }}>
            Task Description <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="text"
            value={f('task')}
            onChange={e => { set('task', e.target.value); setTouched(t => ({ ...t, task: true })) }}
            onBlur={() => setTouched(t => ({ ...t, task: true }))}
            placeholder="Follow up with Aetna re: enrollment…"
            style={fieldStyle(taskInvalid)}
          />
          {taskInvalid && <InlineError msg="Task description is required" />}
        </div>

        <div className="fg">
          <label style={{ color: dueInvalid ? 'var(--danger)' : undefined }}>
            Due Date <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <DateInput
            
            value={f('due')}
            onChange={e => { set('due', e.target.value); setTouched(t => ({ ...t, due: true })) }}
            onBlur={() => setTouched(t => ({ ...t, due: true }))}
            style={fieldStyle(dueInvalid)}
          />
          {dueInvalid && <InlineError msg="Due date is required" />}
        </div>

        <div className="fg">
          <label>Priority</label>
          <select value={f('priority')} onChange={e => set('priority', e.target.value)}>
            <option>Urgent</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>

        <div className="fg">
          <label>Status</label>
          <select value={f('status')} onChange={e => set('status', e.target.value)}>
            <option>Open</option><option>In Progress</option><option>Waiting</option><option>Done</option>
          </select>
        </div>

        <div className="fg">
          <label>Category</label>
          <select value={f('cat')} onChange={e => set('cat', e.target.value)}>
            <option>Follow-up</option><option>Application</option><option>Document Renewal</option>
            <option>Recredentialing</option><option>Enrollment</option><option>Internal</option><option>Other</option>
          </select>
        </div>

        <div className="fg">
          <label>Provider <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 400 }}>(optional)</span></label>
          <select value={f('provId')} onChange={e => set('provId', e.target.value)}>
            <option value="">— None —</option>
            {db.providers.map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
        </div>

        <div className="fg">
          <label>Payer <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 400 }}>(optional)</span></label>
          <select value={f('payId')} onChange={e => set('payId', e.target.value)}>
            <option value="">— None —</option>
            {db.payers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="fg full">
          <label>Notes</label>
          <textarea value={f('notes')} onChange={e => set('notes', e.target.value)} style={{ minHeight: 56 }} />
        </div>
      </div>
    </Modal>
  )
}

// ─── NPI SYNC MODAL ───────────────────────────────────────────────────────────
// Shows a field-by-field diff between NPPES and Lacentra.
// User can check/uncheck individual fields before applying.
