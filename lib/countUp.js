// Pure helpers for the count-up animation on headline numbers.
export const COUNT_MS = 750
export function easeOutCubic(t) { const x = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - x, 3) }
// Value to show `elapsed` ms into an animation from `from` to `to` (integers stay integers).
export function valueAt(from, to, elapsed, duration = COUNT_MS) {
  if (!(duration > 0) || elapsed >= duration) return to
  return Math.round(from + (to - from) * easeOutCubic(elapsed / duration))
}
// Only whole, finite, modest numbers are animated; anything else (text, "—", "12d", huge) renders as-is.
export function animatable(v) { return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) <= 100000 }
