import { useState, useEffect, useRef } from 'react'
import { Modal } from './Modal'
import { DateInput } from './DateInput'
import { validateCompletion, buildCompletion } from '../../lib/completion'
import { todayStr } from '../../lib/matrix'

// Shown before anything can be marked done. Two answers are required, there is no default:
// what was done, and whether anything is still pending (which creates a follow-up task).
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export function CompletionCheck({ config, onSettle }) {
  const [note, setNote]     = useState('')
  const [answer, setAnswer] = useState('')
  const [what, setWhat]     = useState('')
  const [due, setDue]       = useState('')
  const [tried, setTried]   = useState(false)
  const first = useRef(null)
  const today = todayStr()

  useEffect(() => { first.current?.focus() }, [])

  const errors = validateCompletion({ note, answer, what, due }, today)
  const show = (k) => tried && errors[k]

  function submit() {
    setTried(true)
    if (Object.keys(errors).length) return
    onSettle(buildCompletion({ note, answer, what, due }))
  }

  const Err = ({ id, k }) => show(k) ? <div id={id} role="alert" style={{ color: 'var(--danger)', fontSize: 14, marginTop: 4, fontWeight: 600 }}>{errors[k]}</div> : null
  const radio = (value, label, hint) => (
    <label className="cc-opt" style={{ borderColor: answer === value ? 'var(--pr)' : undefined, background: answer === value ? 'var(--pr-bg, rgba(11,107,122,.06))' : undefined }}>
      <input type="radio" name="cc-answer" value={value} checked={answer === value} onChange={() => setAnswer(value)} aria-describedby={show('answer') ? 'cc-answer-err' : undefined} />
      <span><strong>{label}</strong><span className="cc-hint">{hint}</span></span>
    </label>
  )

  return (
    <Modal
      title={config.title || 'Before you mark this done'}
      sub="Completion check"
      onClose={() => onSettle(null)}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => onSettle(null)}>Not done yet</button>
          <button type="button" className="btn btn-green" onClick={submit}>{config.confirmText || 'Mark as done'}</button>
        </>
      }
    >
      <form onSubmit={e => { e.preventDefault(); submit() }} noValidate>
        {config.subject && <p style={{ margin: '0 0 12px', fontSize: 16, lineHeight: 1.5 }}><strong>{config.subject}</strong></p>}
        {config.context?.length > 0 && (
          <ul className="cc-context" aria-label="Already known to be open">
            {config.context.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}

        <div className="fg">
          <label htmlFor="cc-note">{config.noteLabel || 'What was done?'} <span style={{ color: 'var(--danger)' }}>*</span></label>
          <textarea
            id="cc-note" ref={first} rows={3} value={note} onChange={e => setNote(e.target.value)}
            placeholder={config.notePlaceholder || 'e.g. Spoke with the payer, they confirmed receipt of the application.'}
            aria-invalid={!!show('note')} aria-describedby={show('note') ? 'cc-note-err' : undefined}
            style={show('note') ? { borderColor: 'var(--danger)' } : undefined}
          />
          <Err id="cc-note-err" k="note" />
        </div>

        <fieldset className="cc-fieldset">
          <legend>Is any information or document still pending? <span style={{ color: 'var(--danger)' }}>*</span></legend>
          {radio('none', 'No — nothing is pending', 'Everything needed for this is in hand.')}
          {radio('pending', 'Yes — something is still pending', 'A follow-up task will be created so it is not lost.')}
          <Err id="cc-answer-err" k="answer" />
        </fieldset>

        {answer === 'pending' && (
          <div className="cc-pending">
            <div className="fg">
              <label htmlFor="cc-what">What is still missing or waiting? <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="cc-what" type="text" value={what} onChange={e => setWhat(e.target.value)}
                placeholder="e.g. Signed W-9 from the provider"
                aria-invalid={!!show('what')} aria-describedby={show('what') ? 'cc-what-err' : undefined}
                style={show('what') ? { borderColor: 'var(--danger)' } : undefined}
              />
              <Err id="cc-what-err" k="what" />
            </div>
            <div className="fg">
              <label htmlFor="cc-due">Follow up by <span style={{ color: 'var(--danger)' }}>*</span></label>
              <DateInput id="cc-due" value={due} onChange={e => setDue(e.target.value)} style={show('due') ? { borderColor: 'var(--danger)' } : undefined} />
              <div className="cc-quick" role="group" aria-label="Quick follow-up dates">
                {[['Tomorrow', 1], ['In 3 days', 3], ['In a week', 7]].map(([l, n]) => (
                  <button key={n} type="button" className="btn btn-secondary btn-sm" onClick={() => setDue(todayStr(addDays(new Date(), n)))}>{l}</button>
                ))}
              </div>
              <Err id="cc-due-err" k="due" />
            </div>
          </div>
        )}
        <button type="submit" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} tabIndex={-1} aria-hidden="true">Submit</button>
      </form>
    </Modal>
  )
}
