-- Who's on a shared scene: each phone checks in as RESPONDING (listed by unit for the officer on scene) or
-- WATCHING (counted, not listed). Info only — Tablet Command / the MDC stays the accountability system.
create table if not exists public.zone_checkins (
  incident_id uuid not null references public.zone_incidents(id) on delete cascade,
  device_id text not null check (length(device_id) between 8 and 64),
  unit text not null default '' check (length(unit) <= 40),
  status text not null check (status in ('responding', 'watching')),
  user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (incident_id, device_id)
);
alter table public.zone_checkins enable row level security;

create or replace function public.can_see_incident(i uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from zone_incidents z where z.id = i
    and (z.group_id = '00000000-0000-0000-0000-0000000000be' or is_zone_member(z.group_id)));
$$;
grant execute on function public.can_see_incident(uuid) to anon, authenticated;

drop policy if exists "see checkins" on public.zone_checkins;
create policy "see checkins" on public.zone_checkins for select to anon, authenticated using (public.can_see_incident(incident_id));
drop policy if exists "check in" on public.zone_checkins;
create policy "check in" on public.zone_checkins for insert to anon, authenticated with check (public.can_see_incident(incident_id));
drop policy if exists "change my checkin" on public.zone_checkins;
create policy "change my checkin" on public.zone_checkins for update to anon, authenticated
  using (public.can_see_incident(incident_id)) with check (public.can_see_incident(incident_id));
grant select, insert, update on public.zone_checkins to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.zone_checkins;
exception when duplicate_object then null; when undefined_object then null; end $$;
