-- Zone scene notifications, delivered even when the app is closed (Expo push service → Apple).
-- Phones register their push address; a new scene (or a wind change) notifies every phone in that zone
-- except the one that sent it. Beta: the open test zone notifies every registered phone.
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_tokens (
  token text primary key check (token like 'ExponentPushToken[%' or token like 'ExpoPushToken[%'),
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null default 'ios',
  zone_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
-- Phones can add / refresh their own address but nobody can list them through the API.
drop policy if exists "register push" on public.push_tokens;
create policy "register push" on public.push_tokens for insert to anon, authenticated with check (true);
drop policy if exists "refresh push" on public.push_tokens;
create policy "refresh push" on public.push_tokens for update to anon, authenticated using (true) with check (true);
grant insert, update on public.push_tokens to anon, authenticated;

-- Which phone sent the scene, so it isn't notified about its own share.
alter table public.zone_incidents add column if not exists sender_token text;

create or replace function public.zone_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  title text; body text; msgs jsonb;
begin
  if tg_op = 'INSERT' then
    title := 'Zone scene: ' || coalesce(nullif(new.unit, ''), 'unit not set');
    body := coalesce(nullif(new.vehicle, ''), 'Vehicle not set')
      || case when new.place <> '' then ' · ' || new.place else '' end
      || case when new.wind_from_deg is not null then ' · wind from ' || (array['N','NE','E','SE','S','SW','W','NW'])[((round(new.wind_from_deg / 45.0)::int % 8) + 1)] else '' end;
  elsif new.status = 'active' and new.wind_from_deg is distinct from old.wind_from_deg and new.wind_from_deg is not null then
    title := 'Wind changed: ' || coalesce(nullif(new.unit, ''), 'zone scene');
    body := 'Now from ' || (array['N','NE','E','SE','S','SW','W','NW'])[((round(new.wind_from_deg / 45.0)::int % 8) + 1)] || ' · ' || coalesce(nullif(new.vehicle, ''), '');
  else
    return new;
  end if;

  select jsonb_agg(jsonb_build_object(
      'to', t.token, 'title', title, 'body', body, 'sound', 'default',
      'priority', 'high', 'interruptionLevel', 'time-sensitive',
      'data', jsonb_build_object('url', '/command?incident=' || new.id::text)))
    into msgs
  from push_tokens t
  where t.zone_alerts
    and t.token is distinct from new.sender_token
    and (new.group_id = '00000000-0000-0000-0000-0000000000be'
         or t.user_id in (select m.user_id from zone_members m where m.group_id = new.group_id));

  if msgs is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := msgs,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  raise warning 'zone_push failed: %', sqlerrm; -- a notification problem must never block a share
  return new;
end $$;

drop trigger if exists zone_push on public.zone_incidents;
create trigger zone_push after insert or update on public.zone_incidents for each row execute function public.zone_push();
