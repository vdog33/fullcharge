-- FULLCHARGE initial schema. Catalog = public read; writes via service role only.

create table public.vehicles (
  id text primary key,
  make text not null,
  model text not null,
  years text,
  year_from int,
  year_to int,
  powertrain text,                       -- BEV / HEV / PHEV / FCEV
  erg_pdf_url text,
  erg_pdf_label text,
  rescue_sheet_pdf_url text,
  erg_version text,
  erg_date date,
  erg_verified_note text,
  source text not null default 'seed',  -- seed | nhtsa
  verification_status text not null default 'verify-before-shipping',
  chemistry text,
  chemistry_verified text,               -- 'true' | 'false' | 'partial'
  pack text,
  pack_kwh numeric,
  pack_voltage numeric,
  cut_loop text,
  lv_location text,
  no_cut_zones text,
  airbag_hv text,
  tow_notes text,
  release text,
  id_cues text[],
  watch_for text,
  warning text,
  updated_at timestamptz not null default now()
);

create table public.bess (
  id text primary key,
  name text not null,
  chemistry text,
  chemistry_verified boolean,
  kwh_usable text,
  coupling text,
  disconnect text,
  contact_name text,
  contact_phone text,                    -- NULL when no verified phone. Never guess.
  contact_note text,
  shutdown_verified boolean not null default false,
  shutdown_steps jsonb,                  -- array of strings, or "GENERIC_NEC_70615"
  recalls text,
  updated_at timestamptz not null default now()
);

-- Raw NHTSA portal listing (ingestion staging). Never shown as verified until reviewed.
create table public.nhtsa_guides (
  id bigint generated always as identity primary key,
  make text, model text, model_years text, powertrain text,
  doc_type text,                          -- 'erg' | 'rescue_sheet'
  version text, doc_date date,
  pdf_url text unique not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  removed_at timestamptz,
  verification_status text not null default 'unverified',
  vehicle_id text references public.vehicles(id)
);

create table public.data_packs (
  id text primary key,                    -- core | nhtsa-fields | nhtsa-pdfs | regional-* | maps-*
  name text not null,
  version text not null,
  required boolean not null default false,
  size_bytes bigint,
  manifest_path text,                     -- storage path to manifest.json
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.data_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);  -- e.g. key 'nhtsa_count' -> {"count": n, "counted_at": "..."}

-- Camera / VIN ID attempts = training data for the learning loop.
create table public.id_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'camera',
  model text,                             -- vision model id used
  top_match text,
  candidates jsonb not null default '[]',
  notes text,
  photo_path text,                        -- storage key in id-photos (only if user opted in)
  confirmed_id text,
  correction text,
  feedback_at timestamptz,
  feedback_token_hash text not null
);
create index on public.id_attempts (created_at desc);
create index on public.id_attempts (user_id);

alter table public.vehicles enable row level security;
alter table public.bess enable row level security;
alter table public.nhtsa_guides enable row level security;
alter table public.data_packs enable row level security;
alter table public.data_meta enable row level security;
alter table public.id_attempts enable row level security;

create policy "catalog read" on public.vehicles for select using (true);
create policy "bess read" on public.bess for select using (true);
create policy "packs read" on public.data_packs for select using (published);
create policy "meta read" on public.data_meta for select using (true);
-- nhtsa_guides: service role only (no policy).
-- id_attempts: users can read their own; all writes go through the edge function (service role).
create policy "own attempts read" on public.id_attempts for select using (auth.uid() = user_id);

-- Storage
insert into storage.buckets (id, name, public) values ('id-photos', 'id-photos', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('packs', 'packs', true) on conflict do nothing;
-- id-photos: no client policies -> only service role (edge function) can write/read.
