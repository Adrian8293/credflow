import '../styles/globals.css'
import '../styles/credflow.css'
import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { AppContextProvider } from '../context/AppContext'
import { Layout } from '../components/Layout'

// ── Env validation (dev only) ────────────────────────────────────────────────
// NOTE: Never throw at module scope — it crashes the Next.js SSR build worker
// during static prerendering of /404 and /_error (which always go through _app.js).
// Use console.warn instead so missing vars surface in logs without killing the build.
if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    console.warn(
      `[Lacentra] Missing required environment variables:\n${missing.map(k => `  • ${k}`).join('\n')}\n\nCopy .env.example → .env.local and fill in your Supabase credentials.`
    )
  }
}

// Inline SVG favicon — eliminates the 404 on every page load
const FAVICON_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>
  <path d='M24 2L4 10V26C4 36 13 44 24 47C35 44 44 36 44 26V10L24 2Z' fill='%231565C0'/>
  <path d='M24 2L44 10V26C44 36 35 44 24 47V2Z' fill='%235CB85C'/>
  <polyline points='13,25 21,33 35,17' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round' fill='none'/>
</svg>`
const FAVICON_URL = `data:image/svg+xml,${FAVICON_SVG}`

// ── Error Boundary — prevents a single render error from white-screening the app ──
// React requires class components for error boundaries (no functional equivalent).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, { componentStack }) {
    // Structured log — replace with Sentry.captureException(error) once monitoring is added
    console.error('[LACentra] Render crash:', error.message, componentStack)
  }

  handleReset() {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, fontFamily: 'Inter, system-ui, sans-serif',
          background: '#F8FAFC', color: '#1E293B', padding: 40, textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ margin: 0, color: '#64748B', fontSize: 14, maxWidth: 400 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: 12 }}>
            Your data is safe. Reload to continue working.
          </p>
          <button
            onClick={() => this.handleReset()}
            style={{
              marginTop: 8, padding: '10px 24px', background: '#1565C0', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App({ Component, pageProps }) {
  const router = useRouter()
  
  // Define routes that shouldn't render the layout
  const isGuestOrSpecialPage = 
    router.pathname === '/login' || 
    router.pathname === '/reset-password' || 
    router.pathname === '/invite' || 
    router.pathname.startsWith('/review/')

  return (
    <>
      <Head>
        <link rel="icon" href={FAVICON_URL} type="image/svg+xml" />
        <link rel="shortcut icon" href={FAVICON_URL} />
        {/* Sora (display) + DM Sans (body) — LACentra brand system */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <title>Lacentra</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <ErrorBoundary>
        <AppContextProvider>
          {isGuestOrSpecialPage ? (
            <Component {...pageProps} />
          ) : (
            <Layout>
              <Component {...pageProps} />
            </Layout>
          )}
        </AppContextProvider>
      </ErrorBoundary>
    </>
  )
}

