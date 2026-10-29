import test from 'node:test'
import assert from 'node:assert/strict'
import { easeOutCubic, valueAt, animatable, COUNT_MS } from '../lib/countUp.js'

test('easing runs 0 to 1 and clamps', () => {
  assert.equal(easeOutCubic(0), 0); assert.equal(easeOutCubic(1), 1)
  assert.equal(easeOutCubic(-5), 0); assert.equal(easeOutCubic(9), 1)
  assert.ok(easeOutCubic(.5) > .5)               // fast start, slow finish
})
test('valueAt ends exactly on the target and never overshoots', () => {
  assert.equal(valueAt(0, 42, COUNT_MS), 42)
  assert.equal(valueAt(0, 42, COUNT_MS + 500), 42)
  let prev = -1
  for (let t = 0; t <= COUNT_MS; t += 25) { const v = valueAt(0, 42, t); assert.ok(v >= prev && v <= 42); prev = v }
  assert.equal(valueAt(10, 3, COUNT_MS), 3)       // counts down too
  assert.equal(valueAt(0, 5, 100, 0), 5)           // zero duration = jump
})
test('only whole numbers animate; text and placeholders render untouched', () => {
  for (const v of [0, 7, 1234]) assert.equal(animatable(v), true, String(v))
  for (const v of ['12', '—', '12d', 1.5, NaN, Infinity, null, undefined, 1e9]) assert.equal(animatable(v), false, String(v))
})
