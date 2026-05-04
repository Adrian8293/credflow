export function Modal({ onClose, title, sub, children, footer, lg }) {
  return <div className="overlay open" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className={`modal ${lg?'modal-lg':''}`}>
      <div className="modal-header">
        <div><h3>{title}</h3>{sub&&<div className="mh-sub">{sub}</div>}</div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-footer">{footer}</div>
    </div>
  </div>
}

export function DrawerModal({ onClose, title, sub, children, footer }) {
  return <>
    <div className="drawer-overlay open" onClick={onClose} />
    <div className="drawer">
      <div className="drawer-header">
        <div><h3>{title}</h3>{sub&&<div className="mh-sub">{sub}</div>}</div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="drawer-body">{children}</div>
      {footer && <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>{footer}</div>}
    </div>
  </>
}

export { Modal, DrawerModal }
