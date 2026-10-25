// Lacentra holds credentialing data only — never patient information. Text shown while loading, on empty screens
// and in the sidebar must not suggest otherwise. (Words like "accepting new patients" on a provider profile are fine.)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : /\.(jsx?|html)$/.test(e.name) ? [path.join(d, e.name)] : [])

test('no screen claims to load or store patient information', () => {
  const bad = []
  for (const f of ['components', 'features', 'pages', 'public'].flatMap(walk)) {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n')
    lines.forEach((l, i) => {
      if (/\/\/|^\s*\*/.test(l.trim().slice(0, 2))) return                        // comments
      if (/(loading|store|storing|manage|track|enter)[^'"`<]{0,40}patient (information|data|records?|info)/i.test(l)) bad.push(`${f}:${i + 1}`)
    })
  }
  assert.deepEqual(bad, [])
})

test('the loading screen shows credentialing wording only', () => {
  const src = fs.readFileSync(path.join(root, 'components/ui/LoadingScreen.jsx'), 'utf8')
  assert.doesNotMatch(src, /patient/i)
})
