// IMPORTANT: Expo only bakes EXPO_PUBLIC_* values into the app when they are read EXACTLY as
// `process.env.EXPO_PUBLIC_NAME`. Reading them through an alias (const env = process.env) leaves them
// undefined in a real build — which silently put TestFlight build 1 in mock mode. Keep these literal.
const RAW_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS;
const RAW_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const RAW_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY; // publishable key (sb_publishable_…) or legacy anon key
const RAW_FUNCTIONS = process.env.EXPO_PUBLIC_FUNCTIONS_URL;

export const USE_MOCKS = (RAW_MOCKS ?? 'true') === 'true';
// Tolerate a URL copied with /rest/v1 on the end.
export const SUPABASE_URL = (RAW_URL ?? '').trim().replace(/\/(rest|storage|auth|functions)\/v1\/?.*$/, '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = (RAW_KEY ?? '').trim();
// ngrok-friendly override for local edge functions; falls back to the hosted project
export const FUNCTIONS_URL = RAW_FUNCTIONS || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '');

export const BACKEND_READY = !USE_MOCKS && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

export const DISCLAIMER = 'Responder aid — NOT a replacement for the manufacturer ERG.';
export const CONFIRM = 'Confirm in the ERG / EVR app on scene';
export const NHTSA_PORTAL = 'https://www.nhtsa.gov/emergency-response-guides';
