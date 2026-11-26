-- BETA ONLY: one open test zone. No sign-in, no invite code — everyone running the beta sees, shares, updates
-- and clears scenes in it. Before launch: run the "close it" lines at the bottom.
alter table public.zone_incidents alter column created_by drop not null;
alter table public.zone_groups alter column created_by drop not null;

insert into public.zone_groups (id, name, invite_code, created_by)
values ('00000000-0000-0000-0000-0000000000be', 'Beta test zone (open)', 'OPENBT', null)
on conflict (id) do nothing;

drop policy if exists "open zone read" on public.zone_incidents;
create policy "open zone read" on public.zone_incidents for select to anon, authenticated
  using (group_id = '00000000-0000-0000-0000-0000000000be');
drop policy if exists "open zone share" on public.zone_incidents;
create policy "open zone share" on public.zone_incidents for insert to anon, authenticated
  with check (group_id = '00000000-0000-0000-0000-0000000000be');
drop policy if exists "open zone update" on public.zone_incidents;
create policy "open zone update" on public.zone_incidents for update to anon, authenticated
  using (group_id = '00000000-0000-0000-0000-0000000000be') with check (group_id = '00000000-0000-0000-0000-0000000000be');

grant select, insert, update on public.zone_incidents to anon;

-- Close it before launch:
--   drop policy "open zone read" on public.zone_incidents;
--   drop policy "open zone share" on public.zone_incidents;
--   drop policy "open zone update" on public.zone_incidents;
--   revoke select, insert, update on public.zone_incidents from anon;
--   delete from public.zone_groups where id = '00000000-0000-0000-0000-0000000000be';
