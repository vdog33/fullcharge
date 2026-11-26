-- Zone sharing: invite-only groups of departments (e.g. "North Zone": Vista, Oceanside, Escondido, Carlsbad, San Marcos).
-- A unit shares an incident card (unit, vehicle, where, when, wind). Info only — never approach instructions.
-- Scenes clear on their own after 6 hours, or when the unit that shared them clears them.

create table if not exists public.zone_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 60),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.zone_members (
  group_id uuid not null references public.zone_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  unit text not null default '' check (length(unit) <= 40),   -- "Vista E151"
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.zone_incidents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.zone_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  unit text not null default '' check (length(unit) <= 40),
  vehicle text not null default '' check (length(vehicle) <= 80),      -- "2023 Tesla Model Y"
  vehicle_ref text check (length(vehicle_ref) <= 400),                 -- app link: guide keys or vehicle id
  place text not null default '' check (length(place) <= 120),         -- "I-5 NB at Oceanside Blvd"
  lat double precision, lng double precision,
  wind_from_deg smallint check (wind_from_deg between 0 and 359),
  status text not null default 'active' check (status in ('active', 'cleared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);
create index if not exists zone_incidents_group_live on public.zone_incidents (group_id, status, expires_at desc);

alter table public.zone_groups enable row level security;
alter table public.zone_members enable row level security;
alter table public.zone_incidents enable row level security;

create or replace function public.is_zone_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from zone_members where group_id = g and user_id = auth.uid());
$$;

drop policy if exists "members read group" on public.zone_groups;
create policy "members read group" on public.zone_groups for select using (public.is_zone_member(id));
drop policy if exists "members read members" on public.zone_members;
create policy "members read members" on public.zone_members for select using (public.is_zone_member(group_id));
drop policy if exists "leave group" on public.zone_members;
create policy "leave group" on public.zone_members for delete using (user_id = auth.uid());
drop policy if exists "set my unit" on public.zone_members;
create policy "set my unit" on public.zone_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members read incidents" on public.zone_incidents;
create policy "members read incidents" on public.zone_incidents for select using (public.is_zone_member(group_id));
drop policy if exists "members share incidents" on public.zone_incidents;
create policy "members share incidents" on public.zone_incidents for insert
  with check (created_by = auth.uid() and public.is_zone_member(group_id));
drop policy if exists "sharer updates incident" on public.zone_incidents;
create policy "sharer updates incident" on public.zone_incidents for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Create a group (you become its admin) and get its invite code.
create or replace function public.create_zone(p_name text, p_unit text default '')
returns table (id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare g uuid; c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  loop
    c := substr(translate(upper(encode(extensions.gen_random_bytes(9), 'base64')), '+/=0O1IL', ''), 1, 6);
    exit when length(c) = 6 and not exists (select 1 from zone_groups z where z.invite_code = c);
  end loop;
  insert into zone_groups (name, invite_code, created_by) values (trim(p_name), c, auth.uid()) returning zone_groups.id into g;
  insert into zone_members (group_id, user_id, unit, is_admin) values (g, auth.uid(), coalesce(trim(p_unit), ''), true);
  return query select g, c;
end $$;

-- Join with an invite code.
create or replace function public.join_zone(p_code text, p_unit text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select z.id into g from zone_groups z where z.invite_code = upper(trim(p_code));
  if g is null then raise exception 'No zone with that code'; end if;
  insert into zone_members (group_id, user_id, unit) values (g, auth.uid(), coalesce(trim(p_unit), ''))
    on conflict (group_id, user_id) do update set unit = excluded.unit;
  return g;
end $$;

-- Keep updated_at honest and let an update push the 6-hour clear out (an active scene stays up while it's updated).
create or replace function public.zone_incident_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'active' then new.expires_at := greatest(old.expires_at, now() + interval '2 hours'); end if;
  return new;
end $$;
drop trigger if exists zone_incident_touch on public.zone_incidents;
create trigger zone_incident_touch before update on public.zone_incidents for each row execute function public.zone_incident_touch();

grant select, insert, update on public.zone_incidents to authenticated;
grant select on public.zone_groups to authenticated;
grant select, update, delete on public.zone_members to authenticated;
grant execute on function public.create_zone(text, text), public.join_zone(text, text), public.is_zone_member(uuid) to authenticated;

-- Live updates to every member's phone.
do $$ begin
  alter publication supabase_realtime add table public.zone_incidents;
exception when duplicate_object then null; when undefined_object then null; end $$;
