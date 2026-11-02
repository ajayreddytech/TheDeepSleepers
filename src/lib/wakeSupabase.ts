import { createClient } from '@supabase/supabase-js'

// Second Supabase project: the wake-up app. Its daily_logs table is read-only here.
// Row-level security there only returns rows for the signed-in user, so the Sleep tab needs
// a session on this project too (Google sign-in from the Sleep tab).
const wakeUrl = import.meta.env.VITE_WAKE_SUPABASE_URL
const wakePublishableKey = import.meta.env.VITE_WAKE_SUPABASE_ANON_KEY

export const wakeSupabaseConfigured = Boolean(wakeUrl && wakePublishableKey)

export const wakeSupabase = wakeSupabaseConfigured
  ? createClient(wakeUrl, wakePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE returns a ?code= parameter, so this client never collides with the main client's
        // implicit #access_token redirect, and its storage key keeps the two sessions apart.
        flowType: 'pkce',
        storageKey: 'the-deep-sleepers.wake-auth',
      },
    })
  : null
