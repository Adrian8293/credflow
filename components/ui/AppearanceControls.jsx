import { useAppearance } from '../../hooks/useAppearance.js'
import { TEXT_SIZES, DENSITIES, STYLES } from '../../lib/theme.js'

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
  const { choice, text, density, look, chooseTheme, chooseText, chooseDensity, chooseLook } = useAppearance()
  return (
    <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <Segmented legend="Theme" value={choice} options={THEMES} onChange={chooseTheme} />
      <Segmented legend="Look" value={look} options={STYLES.map(s => [s.id, s.label])} onChange={chooseLook} />
      <Segmented legend="Text size" value={text} options={TEXT_SIZES.map(t => [t.id, t.label])} onChange={chooseText} />
      <Segmented legend="Layout density (computers)" value={density} options={DENSITIES.map(d => [d.id, d.label])} onChange={chooseDensity} />
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, gridColumn: '1 / -1' }}>Compact fits more on screen with tighter rows; phones and tablets always use the roomy layout. Saved on this device only. Sign-in pages always use the standard light design.</p>
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
