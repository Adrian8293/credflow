// Mandatory completion check — pure logic (no UI, no network) so it can be unit-tested.
// Nothing is marked done until the person says what was done AND answers "is anything still pending?".
// If something is pending, a follow-up task is created so it cannot be lost.

export const NOTE_MIN = 5
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateCompletion({ note, answer, what, due } = {}, today) {
  const e = {}
  if ((note || '').trim().length < NOTE_MIN) e.note = 'Write what was done (a few words is enough).'
  if (answer !== 'none' && answer !== 'pending') e.answer = 'Choose one: nothing is pending, or something is still pending.'
  if (answer === 'pending') {
    if ((what || '').trim().length < NOTE_MIN) e.what = 'Say what is still missing or waiting.'
    if (!DATE_RE.test(due || '')) e.due = 'Pick the date you will follow up.'
    else if (today && due < today) e.due = 'The follow-up date cannot be in the past.'
  }
  return e
}

// The result handed back to whoever asked for the completion.
export function buildCompletion({ note, answer, what, due }) {
  return {
    note: (note || '').trim(),
    followUp: answer === 'pending' ? { what: (what || '').trim(), due } : null,
  }
}

// Completion lines are appended to the task notes, so the record survives even before the database column exists.
export function appendCompletionNote(notes, note, date) {
  const line = `✓ Completed ${date}: ${(note || '').trim()}`
  return notes && notes.trim() ? `${notes.trim()}\n${line}` : line
}

// The follow-up task for anything still pending. It keeps the same provider, payer and owner.
export function followUpTask({ what, due }, source = {}) {
  return {
    task: `Follow up: ${what}`.slice(0, 240),
    due,
    priority: source.priority === 'Urgent' ? 'Urgent' : 'High',
    status: 'Open',
    cat: 'Follow-up',
    provId: source.provId || '',
    payId: source.payId || '',
    notes: source.task ? `Still pending after completing: ${source.task}` : '',
    ...('assigneeId' in source ? { assigneeId: source.assigneeId || '' } : {}),
  }
}

// Plain-language heads-up lines shown in the dialog so the person sees what is already known to be open.
export function completionContext({ db, provId, taskId } = {}) {
  const lines = []
  if (!db || !provId) return lines
  const prov = (db.providers || []).find(p => p.id === provId)
  const others = (db.tasks || []).filter(t => t.provId === provId && t.id !== taskId && t.status !== 'Done')
  if (others.length) lines.push(`${others.length} other open task${others.length === 1 ? '' : 's'} for ${prov ? `${prov.fname} ${prov.lname}` : 'this provider'}.`)
  const docs = (db.documents || []).filter(d => d.provId === provId && /missing|pending|requested|expired/i.test(d.status || ''))
  if (docs.length) lines.push(`${docs.length} document${docs.length === 1 ? '' : 's'} for this provider ${docs.length === 1 ? 'is' : 'are'} missing, requested or expired.`)
  return lines
}
