-- Background-download bundles (~48 MB .bin blobs of many cut-sheet files).
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'application/json', 'image/webp', 'application/octet-stream'],
      file_size_limit = 104857600
  where id = 'packs';
