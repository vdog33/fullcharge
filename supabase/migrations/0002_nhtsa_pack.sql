-- All-cut-sheets pack: extra columns for the NHTSA list.
alter table public.nhtsa_guides
  add column if not exists key text unique,
  add column if not exists year_from int,
  add column if not exists year_to int,
  add column if not exists sha256 text,
  add column if not exists bytes bigint,
  add column if not exists storage_path text;

-- Catalog listing is public (it's NHTSA's public list); writes stay service-role only.
drop policy if exists "nhtsa read" on public.nhtsa_guides;
create policy "nhtsa read" on public.nhtsa_guides for select using (true);

-- Allow large PDFs in the packs bucket.
update storage.buckets set file_size_limit = 104857600, allowed_mime_types = array['application/pdf', 'application/json'] where id = 'packs';
