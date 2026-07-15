-- The bim.py backend route (save_project_model) uploads parsed IFC files to a
-- "bim_models" storage bucket, but that bucket was never created — every upload
-- fell through to the "documents" bucket fallback, which also rejected the file
-- because IFC has no registered MIME type (browsers/clients send it as
-- application/octet-stream) and "documents" only allowlists office/PDF/image
-- types. Result: every IFC upload failed with a 415 invalid_mime_type error.
--
-- Private bucket — raw IFC/BIM files, not meant to be publicly linkable.
-- No allowed_mime_types restriction: CAD formats (IFC, DWG, DXF) don't have
-- reliable standard MIME types, so an allowlist here just reproduces the bug.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('bim_models', 'bim_models', false, 52428800) -- 50 MB, matches this project's upload cap
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "allow_all_bim_models_storage" ON storage.objects;
CREATE POLICY "allow_all_bim_models_storage"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'bim_models')
  WITH CHECK (bucket_id = 'bim_models');

-- Defense in depth: bim.py falls back to the "documents" bucket if the
-- bim_models upload fails for any reason. Allow octet-stream there too so
-- that fallback path doesn't hit the same 415 error.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'application/octet-stream')
WHERE id = 'documents'
  AND NOT ('application/octet-stream' = ANY(allowed_mime_types));

NOTIFY pgrst, 'reload schema';
