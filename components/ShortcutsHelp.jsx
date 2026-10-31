/** ShortcutsHelp — the keyboard shortcut cheat sheet (press ? anywhere). */
import { Modal } from './ui/Modal.jsx'
import { GO_KEYS } from '../lib/shortcuts.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

function Row({ keys, label }) {
  return (
    <div className="kb-row">
      <span>{label}</span>
      <span className="kb-keys">{keys.map((k, i) => <span key={i}>{i > 0 && <span className="kb-then">then</span>}<kbd>{k}</kbd></span>)}</span>
    </div>
  )
}

export function ShortcutsHelp({ onClose }) {
  const mod = isMac ? '⌘' : 'Ctrl'
  return (
    <Modal onClose={onClose} title="Keyboard shortcuts" sub="Press ? at any time to open this list."
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="kb-grid">
        <section aria-labelledby="kb-general">
          <h4 id="kb-general">General</h4>
          <Row keys={[`${mod} K`]} label="Search and actions" />
          <Row keys={['/']} label="Search (same as above)" />
          <Row keys={['N']} label="New application" />
          <Row keys={['?']} label="Show this list" />
          <Row keys={['Esc']} label="Close a pop-up or search" />
          <Row keys={['← →']} label="Switch between tabs" />
        </section>
        <section aria-labelledby="kb-go">
          <h4 id="kb-go">Go to a page</h4>
          {GO_KEYS.map(g => <Row key={g.key} keys={['G', g.key.toUpperCase()]} label={g.label} />)}
        </section>
      </div>
      <p className="kb-note">Shortcuts pause while you are typing in a field or when a pop-up is open.</p>
    </Modal>
  )
}
