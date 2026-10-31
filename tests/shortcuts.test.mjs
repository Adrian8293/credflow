import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveShortcut, GO_KEYS } from '../lib/shortcuts.js'

test('Ctrl/⌘ + K opens search even while typing or with a pop-up open', () => {
  for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
    const r = resolveShortcut(false, { key: 'k', typing: true, dialogOpen: true, ...mod })
    assert.equal(r.action.type, 'search'); assert.equal(r.prevent, true)
  }
})

test('G then a letter goes to the page; G alone only arms', () => {
  let r = resolveShortcut(false, { key: 'g' })
  assert.equal(r.pendingG, true); assert.equal(r.action, null)
  r = resolveShortcut(true, { key: 'p' })
  assert.deepEqual(r.action, { type: 'go', page: 'providers' }); assert.equal(r.pendingG, false)
  r = resolveShortcut(true, { key: 'a' })
  assert.equal(r.action.page, 'enrollments')
})

test('an unknown letter after G cancels the sequence', () => {
  const r = resolveShortcut(true, { key: 'z' })
  assert.equal(r.action, null); assert.equal(r.pendingG, false)
})

test('single keys: / opens search, ? opens help, N starts a new application', () => {
  assert.equal(resolveShortcut(false, { key: '/' }).action.type, 'search')
  assert.equal(resolveShortcut(false, { key: '?' }).action.type, 'help')
  assert.equal(resolveShortcut(false, { key: 'n' }).action.type, 'new-application')
})

test('nothing fires while typing, with a pop-up open, or with Ctrl/Alt held', () => {
  for (const ev of [{ typing: true }, { dialogOpen: true }, { ctrlKey: true }, { altKey: true }]) {
    for (const key of ['n', 'g', '/', '?']) assert.equal(resolveShortcut(false, { key, ...ev }).action, null)
    assert.equal(resolveShortcut(true, { key: 'p', ...ev }).action, null)
  }
})

test('every go-key is unique and maps to a distinct page', () => {
  assert.equal(new Set(GO_KEYS.map(g => g.key)).size, GO_KEYS.length)
  assert.equal(new Set(GO_KEYS.map(g => g.page)).size, GO_KEYS.length)
})
