import React from 'react'
import Link from 'next/link'

/**
 * Keeps one broken screen from taking the whole app down. The sidebar and top bar stay usable, and moving to
 * another page (resetKey changes) clears the error. The raw error goes to the console only — it can contain
 * record details, so it is never shown on screen.
 */
export class RouteErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error, info) { console.error('[LACentra] Page crash:', error?.message, info?.componentStack) }
  componentDidUpdate(prev) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }) }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="page" role="alert" style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>This page hit a problem</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 14.5, marginBottom: 4 }}>Your data is safe. Nothing you saved has been lost.</p>
        <p style={{ color: 'var(--text-4)', fontSize: 13, marginBottom: 18 }}>You can try again, or go back to Today and carry on.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ failed: false })}>Try again</button>
          <Link href="/" className="btn btn-secondary">Go to Today</Link>
        </div>
      </div>
    )
  }
}

export default RouteErrorBoundary
