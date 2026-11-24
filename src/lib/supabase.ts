import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BACKEND_READY, FUNCTIONS_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

export const supabase: SupabaseClient | null = BACKEND_READY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

/** Call an edge function. Uses FUNCTIONS_URL so a local `supabase functions serve` behind ngrok works. */
export async function callFunction<T>(name: string, body: unknown, timeoutMs = 25000): Promise<T> {
  if (!supabase) throw new Error('Backend not configured');
  const { data } = await supabase.auth.getSession();
  // A signed-in user's session JWT goes on Authorization. New-style keys (sb_publishable_…) are NOT JWTs:
  // they go on the apikey header only. Legacy anon JWTs still need both.
  const userJwt = data.session?.access_token;
  const legacy = !SUPABASE_ANON_KEY.startsWith('sb_');
  const auth = userJwt ?? (legacy ? SUPABASE_ANON_KEY : undefined);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        apikey: SUPABASE_ANON_KEY,
        'ngrok-skip-browser-warning': '1',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
    return json as T;
  } finally {
    clearTimeout(t);
  }
}
