import { FieldError, focusFirstInvalid } from '../../components/ui/FieldError.jsx'
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
    if (!f('task').trim() || !f('due')) { focusFirstInvalid(); return }
    handleSaveTask()
  }

  const fieldStyle = invalid => ({
    border: invalid ? '1.5px solid var(--danger)' : undefined,
    borderRadius: 'var(--r)',
  })

  const InlineError = ({ id, msg }) => <FieldError id={id}>{msg}</FieldError>


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
            aria-required="true" aria-invalid={(taskInvalid) || undefined} aria-describedby={(taskInvalid) ? 'task-desc-err' : undefined}
          />
          {taskInvalid && <InlineError id="task-desc-err" msg="Task description is required" />}
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
            aria-required="true" aria-invalid={(dueInvalid) || undefined} aria-describedby={(dueInvalid) ? 'task-due-err' : undefined}
          />
          {dueInvalid && <InlineError id="task-due-err" msg="Due date is required" />}
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

        {db.staff?.length > 0 && (
          <div className="fg">
            <label htmlFor="task-owner">Owner</label>
            <select id="task-owner" value={f('assigneeId')} onChange={e => set('assigneeId', e.target.value)}>
              <option value="">Unassigned</option>
              {db.staff.map(s => <option key={s.id} value={s.id}>{s.email}</option>)}
              {f('assigneeId') && !db.staff.some(s => s.id === f('assigneeId')) && <option value={f('assigneeId')}>Former team member</option>}
            </select>
          </div>
        )}

        <div className="fg">
          <label>Provider <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 400 }}>(optional)</span></label>
          <select value={f('provId')} onChange={e => set('provId', e.target.value)}>
            <option value="">— None —</option>
            {[...db.providers].filter(p => p.status !== 'Inactive' || p.id === f('provId')).sort((a, b) => `${a.lname} ${a.fname}`.localeCompare(`${b.lname} ${b.fname}`)).map(p => <option key={p.id} value={p.id}>{p.fname} {p.lname}</option>)}
          </select>
        </div>

        <div className="fg">
          <label>Payer <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontWeight: 400 }}>(optional)</span></label>
          <select value={f('payId')} onChange={e => set('payId', e.target.value)}>
            <option value="">— None —</option>
            {[...db.payers].sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
