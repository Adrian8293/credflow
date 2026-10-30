import { useId, useRef } from 'react'
import { useDialog } from '../../hooks/useDialog.js'

export function Modal({ onClose, title, sub, children, footer, lg }) {
  const ref = useRef(null)
  const tid = useId()
  useDialog(ref, onClose)
  return <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div ref={ref} className={`modal ${lg?'modal-lg':''}`} role="dialog" aria-modal="true" aria-labelledby={tid}>
      <div className="modal-header">
        <div style={{ flex: 1, minWidth: 0 }}><h3 id={tid}>{title}</h3>{sub&&<div className="mh-sub">{sub}</div>}</div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-footer">{footer}</div>
    </div>
  </div>
}

export function DrawerModal({ onClose, title, sub, children, footer }) {
  const ref = useRef(null)
  const tid = useId()
  useDialog(ref, onClose)
  return <>
    <div className="drawer-overlay open" onClick={onClose} />
    <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={tid}>
      <div className="drawer-header">
        <div style={{ flex: 1, minWidth: 0 }}><h3 id={tid}>{title}</h3>{sub&&<div className="mh-sub">{sub}</div>}</div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>{footer}</div>}
    </div>
  </>
}
