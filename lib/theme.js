// Theme preference: 'light' | 'dark' saved in localStorage; nothing saved = follow the device setting.
export const THEME_KEY = 'lc_theme'
export const THEME_COLORS = { light: '#0F1C2E', dark: '#0A0F1A' }   // browser/PWA chrome colour

// Sign-in, invite, reset-password and the provider portal have their own light design, so they stay light whatever the saved choice.
export const AUTH_PATH_RE = /^\/(login|invite|reset-password|portal)(\/|$)/
export function isAuthPath(path) { return AUTH_PATH_RE.test(path || '') }
export function themeForPath(path, stored, systemDark) { return isAuthPath(path) ? 'light' : resolveTheme(stored, systemDark) }

// Text size: the app is built in px, so size is applied as a page zoom (CSS `zoom` on body).
export const TEXT_KEY = 'lc_text'
export const TEXT_SIZES = [
  { id: 'standard', label: 'Standard', zoom: 1 },
  { id: 'large',    label: 'Large',    zoom: 1.12 },
  { id: 'xlarge',   label: 'Extra large', zoom: 1.25 },
]
export function normalizeTextSize(v) { return TEXT_SIZES.some(t => t.id === v) ? v : 'standard' }
export function readTextSize() { try { return normalizeTextSize(localStorage.getItem(TEXT_KEY)) } catch { return 'standard' } }
export function storeTextSize(v) { try { localStorage.setItem(TEXT_KEY, normalizeTextSize(v)) } catch { /* private mode */ } }
export function applyTextSize(v) { document.documentElement.setAttribute('data-text', normalizeTextSize(v)) }

// Visual style: 'studio' (flat, Figma-like; the default) or 'glass' (the Stage 84 frosted/gradient look).
export const STYLE_KEY = 'lc_style'
export const STYLES = [{ id: 'studio', label: 'Studio (flat)' }, { id: 'glass', label: 'Glass' }]
export function normalizeStyle(v) { return v === 'glass' ? 'glass' : 'studio' }
export function readStyle() { try { return normalizeStyle(localStorage.getItem(STYLE_KEY)) } catch { return 'studio' } }
export function storeStyle(v) { try { localStorage.setItem(STYLE_KEY, normalizeStyle(v)) } catch { /* private mode */ } }
export function applyStyle(v) { document.documentElement.setAttribute('data-style', normalizeStyle(v)) }

// Layout density: 'comfortable' (default, roomy) or 'compact' (tighter rows and spacing for power users; desktop only).
export const DENSITY_KEY = 'lc_density'
export const DENSITIES = [{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }]
export function normalizeDensity(v) { return v === 'compact' ? 'compact' : 'comfortable' }
export function readDensity() { try { return normalizeDensity(localStorage.getItem(DENSITY_KEY)) } catch { return 'comfortable' } }
export function storeDensity(v) { try { localStorage.setItem(DENSITY_KEY, normalizeDensity(v)) } catch { /* private mode */ } }
export function applyDensity(v) {
  const d = normalizeDensity(v)
  if (d === 'compact') document.documentElement.setAttribute('data-density', 'compact')
  else document.documentElement.removeAttribute('data-density')
}
export function clearStoredTheme() { try { localStorage.removeItem(THEME_KEY) } catch { /* ignore */ } }

export function resolveTheme(stored, systemDark) {
  if (stored === 'light' || stored === 'dark') return stored
  return systemDark ? 'dark' : 'light'
}
export function nextTheme(current) { return current === 'dark' ? 'light' : 'dark' }

export function readStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) } catch { return null }
}
export function storeTheme(t) {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* private mode: still works for this visit */ }
}
export function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return false }
}
export function currentTheme() {
  if (typeof document === 'undefined') return 'light'
  const a = document.documentElement.getAttribute('data-theme')
  return a === 'dark' ? 'dark' : a === 'light' ? 'light' : resolveTheme(readStoredTheme(), systemPrefersDark())
}
export function applyTheme(t) {
  const el = document.documentElement
  el.setAttribute('data-theme', t)
  el.style.colorScheme = t
  const m = document.querySelector('meta[name="theme-color"]')
  if (m) m.setAttribute('content', THEME_COLORS[t])
}

// Runs in <head> before first paint so a saved dark theme never flashes light.
export const THEME_BOOT_SCRIPT =
  "(function(){try{var s=localStorage.getItem('" + THEME_KEY + "');" +
  "var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');" +
  "if(" + AUTH_PATH_RE.toString() + ".test(location.pathname))t='light';" +
  "var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t;" +
  "var z=localStorage.getItem('" + TEXT_KEY + "');if(z==='large'||z==='xlarge')d.setAttribute('data-text',z);if(localStorage.getItem('" + DENSITY_KEY + "')==='compact')d.setAttribute('data-density','compact');d.setAttribute('data-style',localStorage.getItem('" + STYLE_KEY + "')==='glass'?'glass':'studio');}catch(e){document.documentElement.setAttribute('data-style','studio');}})();"
