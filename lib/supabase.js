import { createBrowserClient } from '@supabase/ssr'

/**
 * lib/supabase.js — Browser-side Supabase client
 *
 * Uses createBrowserClient from @supabase/ssr so that the session is stored
 * in cookies (not localStorage). This is required for the middleware edge
 * guard to read the session on every request without a network round-trip.
 *
 * Drop-in replacement for createClient — the `supabase` export has the
 * same API surface (auth, from, rpc, storage, etc.).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local')
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
