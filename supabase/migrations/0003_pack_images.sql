-- Rescue sheets ship as WebP page images.
update storage.buckets set allowed_mime_types = array['application/pdf', 'application/json', 'image/webp'] where id = 'packs';
-- One NHTSA sheet can now be several vehicles (rows share a pdf_url), so the unique key is the row key, not the URL.
alter table public.nhtsa_guides drop constraint if exists nhtsa_guides_pdf_url_key;
