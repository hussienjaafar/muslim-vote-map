# Fix org sync failures (Meta + ActBlue)

Two separate bugs surfaced in the "Sync" flow (`supabase/functions/_shared/sync-lib.ts`):

## 1. Meta — "no unique or exclusion constraint matching the ON CONFLICT specification"
The Meta upsert targets `onConflict: 'organization_id,campaign_id,ad_set_id,ad_id,date'`, but `meta_ad_metrics` has no unique constraint at all (only a primary key on `id`). The sync also only ever writes **campaign-level** rows (`ad_set_id` and `ad_id` are always `null`), and NULLs don't dedupe cleanly in unique constraints anyway.

**Fix (two parts):**
- **Migration:** add a unique constraint on `meta_ad_metrics (organization_id, campaign_id, date)` — mirrors the existing pattern on `sms_campaign_metrics (organization_id, campaign_id, date)`. (Verified: no existing duplicate rows, so the constraint will apply cleanly.)
- **Code:** change the upsert `onConflict` to `'organization_id,campaign_id,date'`.

## 2. ActBlue — "ActBlue API 422: date_range_end is a required parameter"
The CSV export request POSTs only `date_range_start`. ActBlue requires `date_range_end` too.

**Fix (code):** add `date_range_end: todayIso()` to the `csv_type: 'paid_contributions'` request body.

## Files
- New migration: unique constraint on `meta_ad_metrics`.
- `supabase/functions/_shared/sync-lib.ts`: update Meta `onConflict`; add `date_range_end` to the ActBlue request body.

## Verification
After applying, re-run "Sync" on Hamawy's org and confirm both platforms return success (no ON CONFLICT error, no 422). Check edge function logs if anything still fails.

No frontend changes; the toast already reports per-platform results correctly.
