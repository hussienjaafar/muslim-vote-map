## Goal
Get Congressional District polygons rendering on both `/admin/issue-map` and the public `/map`.

## Steps

1. **Download GeoJSON from source project**
   - `curl` `https://kvdfsjrcbbxrvikbrtnk.supabase.co/storage/v1/object/public/geojson/congressional-districts-119.json` to `/tmp/cd119.json`.
   - Verify ~436 features and reasonable size before proceeding.

2. **Upload to this project's `geojson` bucket**
   - Bucket already exists and is public (confirmed in storage config).
   - Use a small Node/Deno script with the service role key (or `supabase.storage.from('geojson').upload`) to push `congressional-districts-119.json` at the bucket root, with `upsert: true` and `contentType: application/json`.
   - Ensure a public-read policy on `storage.objects` for `bucket_id = 'geojson'` exists; add via migration if missing.

3. **Verify public URL**
   - `curl -I` `https://dtmftlfgjprzhxbzyzzo.supabase.co/storage/v1/object/public/geojson/congressional-districts-119.json` → expect 200 and feature count ≈ 436.

4. **Publish issues**
   - Run `UPDATE public.issues SET is_published = true;` via the insert/update tool so non-admin `/map` users get rows under the existing public RLS policies on `issues`, `issue_donor_states`, and `issue_donor_districts`.

5. **Replace bundled fallback (optional cleanup)**
   - Overwrite `public/geojson/congressional-districts-118.json` with the real 119th file so offline/CDN-hiccup fallback works in `IssueMap.tsx`.

## Notes
- No code changes to `IssueMap.tsx` or `useImpactMapLayers.ts` are needed — they already read both the bucket file and the bundled fallback.
- No schema changes; only a data update on `issues` and a storage upload.
- If the source download is rate-limited or large, we'll stream to disk and retry; if upload via JS exceeds size limits, we'll chunk via the storage REST API with the service role key.