/**
 * PrintButton — opens the browser's print dialog for the current page (Save as PDF works too).
 * Print styles (styles/print.css) hide the menus and buttons and print just the page content.
 */
export function PrintButton({ label = 'Print', className = 'btn btn-secondary btn-sm' }) {
  return (
    <button type="button" className={`${className} no-print`} onClick={() => window.print()} title="Print this page or save it as a PDF"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      {label}
    </button>
  )
}
