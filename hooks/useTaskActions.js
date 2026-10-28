import { useState } from 'react'
import { upsertTask, deleteTask, markTaskDone } from '../lib/db'
import { saveFollowUp } from './useCompletion'
import { appendCompletionNote, completionContext } from '../lib/completion'
import { todayStr } from '../lib/matrix'

export function useTaskActions({ db, setDb, toast, requestConfirm, requestCompletion, userId }) {
  // New tasks start with you as the owner, when assignment is available and you are on the staff list.
  const mineId = db.staff?.some(s => s.id === userId) ? userId : ''
  const ownerField = db.staff ? { assigneeId: mineId } : {}
  const [taskForm, setTaskForm]         = useState({})
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [saving, setSaving]             = useState(false)

  async function handleSaveTask() {
    if (!taskForm.task?.trim() || !taskForm.due) {
      toast('Task description and due date required.', 'error'); return
    }
    // Choosing "Done" in the edit form goes through the same completion check as the Done button.
    let completion = null
    const before = editingTaskId ? db.tasks.find(x => x.id === editingTaskId) : null
    if (taskForm.status === 'Done' && before?.status !== 'Done') {
      completion = await askCompletion({ ...before, ...taskForm, id: editingTaskId || undefined })
      if (!completion) { toast('Not saved — the task was not marked done.', 'warn'); return }
    }
    setSaving(true)
    try {
      const completed = completion ? {
        notes: appendCompletionNote(taskForm.notes, completion.note, todayStr()),
        ...('completionNote' in taskForm || (before && 'completionNote' in before) ? { completionNote: completion.note } : {}),
      } : {}
      const saved = await upsertTask({ ...taskForm, ...completed, id: editingTaskId || undefined })
      setDb(prev => ({
        ...prev,
        tasks: editingTaskId
          ? prev.tasks.map(x => x.id === saved.id ? saved : x)
          : [...prev.tasks, saved],
      }))
      toast(editingTaskId ? 'Task updated!' : 'Task saved!', 'success')
      if (completion) await saveFollowUp(completion, saved, { setDb, toast })
      setTaskForm({})
      setEditingTaskId(null)
    } catch(err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function askCompletion(t) {
    return requestCompletion({
      title: 'Before you mark this task done',
      subject: t.task,
      context: completionContext({ db, provId: t.provId, taskId: t.id }),
    })
  }

  // Nothing is marked done without the completion check. Resolves true only when the task was really completed,
  // false when the person cancelled or the save failed (callers keep the row visible in that case).
  async function handleMarkDone(id, taskName) {
    const t = db.tasks.find(x => x.id === id)
    const completion = await askCompletion(t || { id, task: taskName })
    if (!completion) return false
    try {
      const notes = appendCompletionNote(t?.notes, completion.note, todayStr())
      await markTaskDone(id, taskName, { note: completion.note, notes, sendNote: !!t && 'completionNote' in t })
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === id ? { ...x, status: 'Done', notes, ...('completionNote' in x ? { completionNote: completion.note } : {}) } : x) }))
      toast('Task marked complete!', 'success')
      await saveFollowUp(completion, t || {}, { setDb, toast })
      return true
    } catch(err) { toast(err.message, 'error'); return false }
  }

  async function handleReopen(id) {
    const t = db.tasks.find(x => x.id === id)
    if (!t) return
    try {
      const saved = await upsertTask({ ...t, status: 'Open' })
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === id ? saved : x) }))
      toast('Task reopened.', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  // One-line add from the Tasks page. Returns true when saved so the caller can clear its input.
  async function handleQuickAdd({ task, due, provId }) {
    if (!task?.trim() || !due) { toast('Task description and due date required.', 'error'); return false }
    try {
      const saved = await upsertTask({ task: task.trim(), due, priority: 'Medium', status: 'Open', cat: 'Follow-up', provId: provId || '', ...ownerField })
      setDb(prev => prev.tasks.some(x => x.id === saved.id) ? prev : { ...prev, tasks: [...prev.tasks, saved] })
      toast('Task added.', 'success')
      return true
    } catch(err) { toast(err.message, 'error'); return false }
  }

  // One-click ownership change from the list ('' = unassigned). Saves through the normal task save so it is audited and queued offline.
  async function handleAssign(id, assigneeId) {
    const t = db.tasks.find(x => x.id === id)
    if (!t) return
    try {
      const saved = await upsertTask({ ...t, assigneeId })
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(x => x.id === id ? saved : x) }))
      toast(assigneeId ? 'Task assigned.' : 'Task unassigned.', 'success')
    } catch (err) { toast(err.message, 'error') }
  }

  async function handleDeleteTask(id) {
    if (!(await requestConfirm({
      title: 'Delete Task',
      body: 'This soft-deletes the task. It will be removed from the queue but preserved in audit history.',
      confirmText: 'Delete task',
      danger: true,
    }))) return
    try {
      await deleteTask(id, db.tasks.find(x => x.id === id)?.task)
      setDb(prev => ({ ...prev, tasks: prev.tasks.filter(x => x.id !== id) }))
      toast('Deleted.', 'warn')
    } catch(err) { toast(err.message, 'error') }
  }

  function openTaskModal(id) {
    setEditingTaskId(id || null)
    if (id) {
      const t = db.tasks.find(x => x.id === id)
      if (t) setTaskForm({ ...t })
    } else {
      setTaskForm({ priority: 'Medium', status: 'Open', cat: 'Follow-up', ...ownerField })
    }
  }

  return {
    taskForm, setTaskForm,
    editingTaskId,
    saving,
    handleSaveTask, handleMarkDone, handleReopen, handleQuickAdd, handleDeleteTask, handleAssign,
    openTaskModal,
  }
}
