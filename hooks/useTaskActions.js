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
    } catch(err) { toast(err.message, 'error') }
    setSaving(false)
  }

  async function handleMarkDone(id, taskName) {
    try {
      await markTaskDone(id, taskName)
      setDb(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, status: 'Done' } : t) }))
      toast('Task marked complete!', 'success')
    } catch(err) { toast(err.message, 'error') }
  }

  async function handleDeleteTask(id) {
    if (!(await requestConfirm({
      title: 'Delete Task',
      body: 'This soft-deletes the task. It will be removed from the queue but preserved in audit history.',
      confirmText: 'Delete task',
      danger: true,
    }))) return
    try {
      await deleteTask(id)
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
    handleSaveTask, handleMarkDone, handleDeleteTask,
    openTaskModal,
  }
}
