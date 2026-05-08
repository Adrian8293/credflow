import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function useAuth() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Use getUser() for server-verified auth instead of getSession()
    // getSession() only reads the local JWT without validating it.
    // getUser() makes a round-trip to Supabase to verify the token is
    // still valid, not revoked, and not expired.
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null)
      setAuthLoading(false)
    }).catch(() => {
      setUser(null)
      setAuthLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  return { user, authLoading, signOut }
}

export { useAuth }
