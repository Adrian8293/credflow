import { useState } from 'react'
import { upsertTask, deleteTask, markTaskDone } from '../lib/db'

export function useTaskActions({ db, setDb, toast, requestConfirm }) {
  const [taskForm, setTaskForm]         = useState({})
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [saving, setSaving]             = useState(false)

  async function handleSaveTask() {
    if (!taskForm.task?.trim() || !taskForm.due) {
      toast('Task description and due date required.', 'error'); return
    }
    setSaving(true)
    try {
      const saved = await upsertTask({ ...taskForm, id: editingTaskId || undefined })
      setDb(prev => ({
        ...prev,
        tasks: editingTaskId
          ? prev.tasks.map(x => x.id === saved.id ? saved : x)
          : [...prev.tasks, saved],
      }))
      toast(editingTaskId ? 'Task updated!' : 'Task saved!', 'success')
      setTaskForm({})
      setEditingTaskId(null)
    } catch(err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkDone(id, taskName) {
    try {
      await markTaskDone(id, taskName)
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, status: 'Done' } : t) }))
      toast('Task marked complete!', 'success')
    } catch(err) { toast(err.message, 'error') }
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
      const saved = await upsertTask({ task: task.trim(), due, priority: 'Medium', status: 'Open', cat: 'Follow-up', provId: provId || '' })
      setDb(prev => prev.tasks.some(x => x.id === saved.id) ? prev : { ...prev, tasks: [...prev.tasks, saved] })
      toast('Task added.', 'success')
      return true
    } catch(err) { toast(err.message, 'error'); return false }
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
      setTaskForm({ priority: 'Medium', status: 'Open', cat: 'Follow-up' })
    }
  }

  return {
    taskForm, setTaskForm,
    editingTaskId,
    saving,
    handleSaveTask, handleMarkDone, handleReopen, handleQuickAdd, handleDeleteTask,
    openTaskModal,
  }
}
