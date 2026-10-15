/**
 * pages/404.js — Custom 404 page
 *
 * CRITICAL: This page is ALWAYS statically prerendered by Next.js regardless
 * of getServerSideProps. It must import NOTHING that touches supabase, auth,
 * or any module with side-effectful initialization.
 *
 * It intentionally does NOT use AppContextProvider or Layout — those import
 * the supabase client chain which caused "Cannot access 'aI' before initialization"
 * when the SSR build worker prerendered this page.
 */
import Head from 'next/head'
import { useRouter } from 'next/router'

export default function NotFound() {
  const router = useRouter()
  return (
    <>
      <Head><title>404 — Page Not Found | LACentra</title></Head>
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter, system-ui, sans-serif',
        background: '#F8FAFC', color: '#1E293B', gap: 16, padding: 40,
        textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, background: '#EFF6FF', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>🔍</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-.04em' }}>
          Page not found
        </h1>
        <p style={{ margin: 0, color: '#64748B', fontSize: 15, maxWidth: 360 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '10px 20px', background: '#fff', color: '#1E293B',
              border: '1.5px solid #E2E8F0', borderRadius: 8,
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >← Go back</button>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '10px 20px', background: '#1565C0', color: '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >Go to Dashboard</button>
        </div>
      </div>
    </>
  )
}
