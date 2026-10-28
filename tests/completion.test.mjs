import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCompletion, buildCompletion, appendCompletionNote, followUpTask, completionContext } from '../lib/completion.js'
import { taskToDb, taskFromDb } from '../lib/mappers.js'

const TODAY = '2026-10-27'

test('nothing can be completed with an empty form: note and the pending answer are both required', () => {
  const e = validateCompletion({}, TODAY)
  assert.ok(e.note); assert.ok(e.answer)
  assert.deepEqual(Object.keys(validateCompletion({ note: 'ok', answer: 'none' }, TODAY)), ['note'])   // too short
  assert.deepEqual(validateCompletion({ note: 'Called the payer', answer: 'none' }, TODAY), {})
})

test('"something is pending" needs a description and a date that is not in the past', () => {
  const base = { note: 'Sent the application', answer: 'pending' }
  assert.deepEqual(Object.keys(validateCompletion(base, TODAY)).sort(), ['due', 'what'])
  assert.ok(validateCompletion({ ...base, what: 'Signed W-9', due: '2026-10-01' }, TODAY).due)
  assert.deepEqual(validateCompletion({ ...base, what: 'Signed W-9', due: '2026-10-30' }, TODAY), {})
  assert.deepEqual(validateCompletion({ ...base, what: 'Signed W-9', due: TODAY }, TODAY), {})
})

test('the result carries a follow-up only when something is pending, and trims the text', () => {
  assert.deepEqual(buildCompletion({ note: '  done  here ', answer: 'none', what: 'x', due: '2026-11-01' }), { note: 'done  here', followUp: null })
  assert.deepEqual(buildCompletion({ note: 'Sent it', answer: 'pending', what: ' W-9 ', due: '2026-11-01' }), { note: 'Sent it', followUp: { what: 'W-9', due: '2026-11-01' } })
})

test('the completion line is appended to the notes without losing what was there', () => {
  assert.equal(appendCompletionNote('', 'Called payer', '2026-10-27'), '✓ Completed 2026-10-27: Called payer')
  assert.equal(appendCompletionNote('Ask for Dana\n', 'Called payer', '2026-10-27'), 'Ask for Dana\n✓ Completed 2026-10-27: Called payer')
})

test('the follow-up task keeps provider, payer and owner, and is never lower than High', () => {
  const t = followUpTask({ what: 'Signed W-9', due: '2026-11-01' }, { task: 'Collect docs', provId: 'p1', payId: 'y1', priority: 'Low', assigneeId: 'u1' })
  assert.deepEqual([t.task, t.due, t.priority, t.status, t.provId, t.payId, t.assigneeId], ['Follow up: Signed W-9', '2026-11-01', 'High', 'Open', 'p1', 'y1', 'u1'])
  assert.equal(followUpTask({ what: 'x'.repeat(5), due: '2026-11-01' }, { priority: 'Urgent' }).priority, 'Urgent')
  assert.ok(!('assigneeId' in followUpTask({ what: 'Signed W-9', due: '2026-11-01' }, {})))   // not sent before migration 030
})

test('the dialog shows what is already known to be open for the provider', () => {
  const db = { providers: [{ id: 'p1', fname: 'Ana', lname: 'Lee' }], tasks: [{ id: 't1', provId: 'p1', status: 'Open' }, { id: 't2', provId: 'p1', status: 'Open' }, { id: 't3', provId: 'p1', status: 'Done' }],
    documents: [{ provId: 'p1', status: 'Missing' }, { provId: 'p1', status: 'Received' }] }
  const lines = completionContext({ db, provId: 'p1', taskId: 't1' })
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^1 other open task for Ana Lee/)
  assert.match(lines[1], /1 document .* is missing/)
  assert.deepEqual(completionContext({ db, provId: '' }), [])
})

test('before migration 033 the completion columns are never sent; after it they round-trip', () => {
  const old = taskFromDb({ id: '1', task: 'A', status: 'Open' })
  assert.ok(!('completionNote' in old))
  assert.ok(!('completion_note' in taskToDb(old)))
  const now = taskFromDb({ id: '1', task: 'A', status: 'Done', completion_note: 'Called payer', completed_at: '2026-10-27T10:00:00Z' })
  assert.equal(now.completionNote, 'Called payer')
  assert.equal(taskToDb(now).completion_note, 'Called payer')
})
