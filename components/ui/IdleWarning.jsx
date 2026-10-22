/**
 * IdleWarning — shown for the last minute before the automatic sign-out.
 * Big, plain, with one obvious button (a phone has no mouse to "move"), so people can stay signed in.
 */
export function IdleWarning({ secondsLeft, onStay }) {
  if (secondsLeft === null || secondsLeft === undefined) return null
  const mins = Math.floor(secondsLeft / 60)
  const secs = String(secondsLeft % 60).padStart(2, '0')
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="You are about to be signed out"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10002, background: '#92400e', color: '#fff',
        padding: 'calc(10px + env(safe-area-inset-top)) 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, flexWrap: 'wrap', boxShadow: '0 4px 18px rgba(0,0,0,.25)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35, textAlign: 'center' }}>
        You will be signed out in {mins}:{secs} because you haven't used the app.
      </div>
      <button type="button" onClick={onStay}
        style={{ background: '#fff', color: '#92400e', border: 'none', borderRadius: 10, minHeight: 48, padding: '0 22px', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
        Stay signed in
      </button>
    </div>
  )
}
