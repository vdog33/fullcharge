-- Background-download bundles (~48 MB .bin blobs of many cut-sheet files).
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'application/json', 'image/webp', 'application/octet-stream'],
      file_size_limit = 52428800  -- the project's global 50 MB upload cap; bundles stay under 44 MB
  where id = 'packs';
