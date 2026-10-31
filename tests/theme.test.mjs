import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, nextTheme, isAuthPath, themeForPath, THEME_BOOT_SCRIPT, THEME_KEY } from '../lib/theme.js'

test('a saved choice wins over the device setting', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
})
test('with nothing saved, follow the device', () => {
  assert.equal(resolveTheme(null, true), 'dark')
  assert.equal(resolveTheme(null, false), 'light')
  assert.equal(resolveTheme('garbage', true), 'dark')   // tampered storage value is ignored
})
test('toggle flips between the two themes', () => {
  assert.equal(nextTheme('light'), 'dark')
  assert.equal(nextTheme('dark'), 'light')
  assert.equal(nextTheme(undefined), 'dark')
})
test('sign-in, invite, reset and portal pages stay light', () => {
  for (const p of ['/login', '/invite', '/invite/abc', '/reset-password', '/portal']) assert.equal(themeForPath(p, 'dark', true), 'light', p)
  for (const p of ['/', '/providers', '/loginhelp', '/settings', '/portalx']) assert.equal(themeForPath(p, 'dark', false), 'dark', p)
  assert.equal(isAuthPath('/login'), true); assert.equal(isAuthPath('/logins'), false)
})
test('boot script is plain ES5 that sets data-theme and cannot throw', () => {
  assert.ok(THEME_BOOT_SCRIPT.includes(THEME_KEY) && THEME_BOOT_SCRIPT.includes('data-theme'))
  assert.ok(THEME_BOOT_SCRIPT.includes('try{') && THEME_BOOT_SCRIPT.includes('catch'))
  assert.doesNotThrow(() => new Function(THEME_BOOT_SCRIPT))
  // run it against a fake DOM: saved dark, on /providers → dark; on /login → light
  const run = (path, saved, sys) => {
    const attrs = {}
    const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v }, style: {} } }
    new Function('localStorage', 'window', 'document', 'location', THEME_BOOT_SCRIPT)(
      { getItem: () => saved }, { matchMedia: () => ({ matches: sys }) }, doc, { pathname: path })
    return attrs['data-theme']
  }
  assert.equal(run('/providers', 'dark', false), 'dark')
  assert.equal(run('/login', 'dark', true), 'light')
  assert.equal(run('/', null, true), 'dark')
  assert.equal(run('/', null, false), 'light')
})

import { normalizeDensity, DENSITIES } from '../lib/theme.js'
test('density: only "compact" is compact; anything else is comfortable', () => {
  assert.equal(normalizeDensity('compact'), 'compact')
  for (const v of ['comfortable', '', null, undefined, 'tiny', 7]) assert.equal(normalizeDensity(v), 'comfortable')
  assert.deepEqual(DENSITIES.map(d => d.id), ['comfortable', 'compact'])
})
test('boot script restores a saved compact density before first paint', () => {
  assert.match(THEME_BOOT_SCRIPT, /lc_density/)
  assert.match(THEME_BOOT_SCRIPT, /data-density/)
})

import { normalizeStyle, STYLES, THEME_BOOT_SCRIPT as BOOT2 } from '../lib/theme.js'
test('style: Studio is the default; only "glass" selects Glass', () => {
  assert.equal(normalizeStyle('glass'), 'glass')
  for (const v of ['studio', '', null, undefined, 'flat', 3]) assert.equal(normalizeStyle(v), 'studio')
  assert.deepEqual(STYLES.map(s => s.id), ['studio', 'glass'])
})
test('boot script sets the style before first paint and is valid JavaScript', () => {
  assert.match(BOOT2, /data-style/)
  assert.doesNotThrow(() => new Function(BOOT2))
})
