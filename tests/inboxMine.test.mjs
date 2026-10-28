import test from 'node:test'
import assert from 'node:assert/strict'
import { inboxFilter, isMine } from '../lib/inbox.js'

const db = {
  tasks: [{ id: 't1', assigneeId: 'me' }, { id: 't2', assigneeId: 'other' }, { id: 't3', assigneeId: '' }],
  enrollments: [{ id: 'e1', assigneeId: 'me' }, { id: 'e2', assigneeId: 'other', provId: 'p1' }, { id: 'e3' }],
  providers: [{ id: 'p1', assigneeId: 'me' }, { id: 'p2', assigneeId: 'other' }],
}
const items = [{ taskId: 't1' }, { taskId: 't2' }, { taskId: 't3' }, { enrId: 'e1' }, { enrId: 'e2', provId: 'p1' }, { enrId: 'e3', provId: 'p1' }, { provId: 'p1' }, { provId: 'p2' }, { type: 'x' }]

test('"Mine" follows the most specific owner: task, then application, then provider', () => {
  const got = inboxFilter(items, 'mine', { db, userId: 'me' })
  assert.deepEqual(got, [items[0], items[3], items[5], items[6]])   // e2 is another person's application even though the provider is mine
})

test('"Mine" shows nothing without a signed-in user or before ownership exists', () => {
  assert.deepEqual(inboxFilter(items, 'mine', { db, userId: '' }), [])
  assert.equal(isMine({ taskId: 't1' }, { tasks: [{ id: 't1' }] }, 'me'), false)
})

test('the other filters are unchanged', () => {
  assert.equal(inboxFilter(items, 'all'), items)
})
