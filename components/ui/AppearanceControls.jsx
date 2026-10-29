import { useAppearance } from '../../hooks/useAppearance.js'
import { TEXT_SIZES } from '../../lib/theme.js'

const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match device']]

function Segmented({ legend, value, options, onChange }) {
  return (
    <fieldset className="seg-field">
      <legend className="seg-legend">{legend}</legend>
      <div className="seg" role="radiogroup" aria-label={legend}>
        {options.map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`seg-btn${value === id ? ' on' : ''}`} onClick={() => onChange(id)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

// Theme + text size. Used on the Settings page.
export function AppearanceControls() {
  const { choice, text, chooseTheme, chooseText } = useAppearance()
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Segmented legend="Theme" value={choice} options={THEMES} onChange={chooseTheme} />
      <Segmented legend="Text size" value={text} options={TEXT_SIZES.map(t => [t.id, t.label])} onChange={chooseText} />
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Saved on this device only. Sign-in pages always use the standard light design.</p>
    </div>
  )
}

// Compact "A A A" text-size picker for the user menu.
export function TextSizeQuick({ inMenu = false }) {
  const { text, chooseText } = useAppearance()
  return (
    <div className="tsq" role={inMenu ? 'group' : 'radiogroup'} aria-label="Text size">
      {TEXT_SIZES.map((t, i) => (
        <button key={t.id} type="button" role={inMenu ? 'menuitemradio' : 'radio'} aria-checked={text === t.id} aria-label={t.label} title={t.label}
          className={`tsq-btn${text === t.id ? ' on' : ''}`} style={{ fontSize: 12 + i * 3 }} onClick={() => chooseText(t.id)}>A</button>
      ))}
    </div>
  )
}
