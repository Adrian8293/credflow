import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultHidden, toggleHidden, hiddenForColumnSet, visibleColumns, addView, removeView, isHiddenList, isViewList } from '../lib/tableViews.js'

const cols = [
  { id: 'name', locked: true }, { id: 'a' }, { id: 'b', hiddenByDefault: true }, { id: 'c', hiddenByDefault: true },
]

test('defaults hide only hiddenByDefault columns', () => assert.deepEqual(defaultHidden(cols), ['b', 'c']))
test('toggle adds and removes, ignores locked and unknown', () => {
  assert.deepEqual(toggleHidden([], 'a', cols), ['a'])
  assert.deepEqual(toggleHidden(['a'], 'a', cols), [])
  assert.deepEqual(toggleHidden(['a'], 'name', cols), ['a'])
  assert.deepEqual(toggleHidden(['a'], 'zzz', cols), ['a'])
})
test('column set view hides everything else but never locked', () => {
  const h = hiddenForColumnSet(cols, ['b'])
  assert.deepEqual(h.sort(), ['a', 'c'])
  assert.deepEqual(visibleColumns(cols, h).map(c => c.id), ['name', 'b'])
})
test('views: trims, replaces same name case-insensitively, keeps last 12', () => {
  let v = addView([], { name: '  Mine  ', columns: ['a'] })
  assert.equal(v[0].name, 'Mine')
  v = addView(v, { name: 'MINE', columns: ['b'] })
  assert.equal(v.length, 1); assert.deepEqual(v[0].columns, ['b'])
  for (let i = 0; i < 15; i++) v = addView(v, { name: 'v' + i, columns: [] })
  assert.equal(v.length, 12)
  assert.equal(removeView(v, 'v14').length, 11)
})
test('validators', () => {
  assert.equal(isHiddenList(['a']), true); assert.equal(isHiddenList('a'), false)
  assert.equal(isViewList([{ name: 'x' }]), true); assert.equal(isViewList([1]), false)
})
