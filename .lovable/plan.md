## Goal

Meta attribution is empty not because of missing data or vendor-account separation, but because of a one-field bug in the new ad-link sync. The connected ad account (`act_910839715277336`) returns every ad with an ActBlue destination link carrying a `refcode` (`q2fad9`, `q2fad10`, `enbyBS`, …). We just need the creatives request to stop erroring so those refcodes get stored as exact Meta mappings.

## Root cause (confirmed by live test)

`syncMetaAdLinks()` requests `creative{...,effective_object_story_spec}`. That subfield does not exist in Graph API v19, so Meta rejects the whole `/ads` call:

```text
(#100) Tried accessing nonexisting field (effective_object_story_spec)
```

The function catches it as a best-effort error and returns 0 mappings — which is why `campaign_attribution` is completely empty and Meta donations stay `other`.

## Fix

### 1. Remove the invalid field
In `supabase/functions/_shared/sync-lib.ts`:
- Drop `effective_object_story_spec` from the `creative{...}` field list in `syncMetaAdLinks()`.
- Remove the `pushSpec((creative as any).effective_object_story_spec)` line in `collectCreativeUrls()` (it can never be populated now and isn't needed — `object_story_spec` + `asset_feed_spec.link_urls` already cover every ad in the live test).

### 2. Deploy & run
- Deploy the edge functions.
- Trigger a Meta sync for this org (or click "Sync Meta ad links" on `/admin/attribution`), which now:
  - parses all 50+ ad links,
  - upserts exact `q2fad*` / `enbyBS` → `meta` mappings (`source='meta_ad'`, `priority=10`),
  - calls `recompute_attribution(org_id)`.

### 3. Verify
- Confirm `campaign_attribution` has `source='meta_ad'` rows.
- Confirm Meta's attributed revenue on the dashboard jumps from ~$3 to a realistic share, and spot-check a `q2fad*` donation now resolves to `meta` with `attribution_method='mapping'`, `attribution_confidence='high'`.

## Technical notes
- No schema change — the `source` column and unique index already exist.
- No resolver change — exact mappings already win at priority 1 in `recompute_attribution`.
- Robustness add: if the creatives call still returns a non-200, log the Graph error body (already partially done) so future field/version issues are visible rather than silently producing 0 mappings.
