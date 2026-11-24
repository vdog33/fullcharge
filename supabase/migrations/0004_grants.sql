-- Explicit Data API grants. Newer Supabase projects don't auto-expose public tables, so we opt in table by table.
-- Row-level security (enabled in 0001) still decides which ROWS each role sees.

-- Public catalog: anyone running the app may read.
grant select on public.vehicles, public.bess, public.data_packs, public.data_meta, public.nhtsa_guides to anon, authenticated;

-- ID attempts: signed-in users read their own rows (RLS policy); writes go through the edge function.
grant select on public.id_attempts to authenticated;

-- Server side (edge function, seed + publish scripts) uses the service role.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
