import test from 'node:test'
import assert from 'node:assert/strict'
import { associateLabels } from '../lib/a11yLabels.js'

// Minimal fake DOM: just enough of the Element API that associateLabels touches.
function el(tag, attrs = {}, children = []) {
  const node = {
    tag, attrs: { ...attrs }, children, parentElement: null, id: attrs.id || '', labels: attrs.labels || [],
    title: attrs.title || '',
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null },
    setAttribute(k, v) { this.attrs[k] = v },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null },
    querySelectorAll(sel) {
      const out = []
      const walk = n => n.children.forEach(c => { if (match(c, sel)) out.push(c); walk(c) })
      walk(this); return out
    },
  }
  children.forEach(c => { c.parentElement = node })
  return node
}
function match(n, sel) {
  return sel.split(',').some(part => {
    part = part.trim()
    if (part === 'label:not([for])') return n.tag === 'label' && !('for' in n.attrs)
    if (part === 'input,select,textarea' || part === 'select' || part === 'textarea') return ['input', 'select', 'textarea'].includes(n.tag) && (part === 'input,select,textarea' || n.tag === part)
    if (part.startsWith('input:not([type=hidden]):not([aria-hidden="true"])')) {
      if (part.includes('[type=checkbox]')) return (n.tag === 'input' && n.attrs.type !== 'hidden' && n.attrs['aria-hidden'] !== 'true' && n.attrs.type !== 'checkbox' && n.attrs.type !== 'radio') || n.tag === 'textarea'
      return n.tag === 'input' && n.attrs.type !== 'hidden' && n.attrs['aria-hidden'] !== 'true'
    }
    return false
  })
}

test('links a label to the single field beside it', () => {
  const input = el('input', { type: 'text' })
  const label = el('label')
  const root = el('div', {}, [el('div', {}, [label, input])])
  assert.equal(associateLabels(root), 1)
  assert.ok(input.id)
  assert.equal(label.attrs.for, input.id)
})

test('ignores the date field\'s hidden calendar input', () => {
  const text = el('input', { type: 'text', placeholder: 'MM/DD/YYYY' })
  const hidden = el('input', { type: 'date', 'aria-hidden': 'true' })
  const label = el('label')
  const root = el('div', {}, [el('div', {}, [label, el('span', {}, [text, hidden])])])
  associateLabels(root)
  assert.equal(label.attrs.for, text.id)
  assert.ok(text.id)
})

test('names a placeholder-only field from its placeholder', () => {
  const input = el('input', { type: 'search', placeholder: 'Search tasks…' })
  const root = el('div', {}, [input])
  associateLabels(root)
  assert.equal(input.attrs['aria-label'], 'Search tasks')
})

test('leaves an existing aria-label alone and skips ambiguous groups', () => {
  const a = el('input', { 'aria-label': 'Mine', placeholder: 'x' })
  const b1 = el('input', {}); const b2 = el('input', {})
  const lab = el('label')
  const root = el('div', {}, [el('div', {}, [a]), el('div', {}, [lab, b1, b2])])
  associateLabels(root)
  assert.equal(a.attrs['aria-label'], 'Mine')
  assert.equal('for' in lab.attrs, false)
})
