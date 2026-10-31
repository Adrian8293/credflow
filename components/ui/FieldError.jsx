/**
 * FieldError — the red "this field needs attention" message under a form field.
 * It is announced to screen readers when it appears (role="alert"); give the field aria-describedby={id} and aria-invalid
 * so the message is also read when the field is focused.
 */
export function FieldError({ id, children }) {
  return (
    <div id={id} role="alert" className="field-error">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{children}</span>
    </div>
  )
}

/** After a failed save, send keyboard / screen-reader focus to the first field marked invalid in the open pop-up. */
export function focusFirstInvalid() {
  setTimeout(() => {
    const el = document.querySelector('[role="dialog"] [aria-invalid="true"]')
    if (el) el.focus()
  }, 50)
}
