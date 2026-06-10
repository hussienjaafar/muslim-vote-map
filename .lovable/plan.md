## Goal

Make Meta and SMS attribution work the way Molitico's does — deterministic refcode matching — by fixing the bug that strips refcodes off every donation at import time. Today 98.9% of transactions have a NULL refcode, so there is nothing for the refcode→channel mappings to match against. The Meta refcode mappings (`q2fad*`, `enbyBS`) are already synced and correct; they just have no refcodes to bind to.

## Root cause

`parseActblueCsv()` in `supabase/functions/_shared/sync-lib.ts` reads the refcode from CSV columns named `refcode` / `refcode2`:

```ts
refcode: get('refcode') || get('refcode2') || null,
```

ActBlue's contribution CSV actually names these columns **"Reference Code"** and **"Reference Code 2"** (lowercased by the parser to `reference code` / `reference code 2`). The lookup never matches, so every refcode is dropped. Evidence: the `modigitalh4nj` Meta form has 4,096 donations but only 2 stored refcodes.

## How Molitico does it (for reference)

- Reads `refcode`, `refcode2`, `refcode_custom` on every transaction.
- Matches refcodes against Meta ad-link refcodes (exact, then partial) and SMS campaign refcodes.
- Falls back to **contribution-form** matching and **send-date proximity** scoring for SMS.
- It only works because the refcodes are present on the transactions — which is precisely what we're missing.

## Plan

### 1. Fix the CSV refcode mapping (the core fix)
In `parseActblueCsv()`, read the real ActBlue headers with fallbacks:
- `refcode`  ← `reference code` || `refcode`
- `refcode2` ← `reference code 2` || `refcode2`
Store the primary refcode (and keep refcode2 available for matching). Keep existing fallbacks so webhook-shaped and older exports still work.

### 2. Capture refcode2 for matching
`actblue_transactions` has only a single `refcode` column. Add a `refcode2 text` column (nullable) so both ActBlue reference codes are retained, mirroring Molitico. Update `parseActblueCsv()` and the webhook insert to populate it, and extend `recompute_attribution` to match on either `refcode` or `refcode2`.

### 3. Re-import ActBlue history
Trigger a full ActBlue CSV re-sync for the affected org(s) so the corrected parser backfills refcodes onto existing transactions (upsert on `organization_id,transaction_id`, so no duplicates). Confirm `pct_with_refcode` jumps from ~1% to the expected majority.

### 4. Recompute attribution
After re-import, `recompute_attribution` runs automatically (already wired into the CSV job). The already-synced `q2fad*`/`enbyBS` → Meta mappings will now bind to the `modigitalh4nj` donations, moving ~4,000 donations / ~$131k from `other` to `meta` with `attribution_method='mapping'`.

### 5. Molitico-parity SMS matching (bring SMS up to par)
With refcodes restored, extend the SMS tier in `recompute_attribution` to match Switchboard `sms_campaign_metrics` on refcode (exact + contains) and contribution-form, with send-date proximity as a tiebreaker — mirroring Molitico's `sync-sms-campaign-attribution`. This upgrades SMS from low-confidence keyword guessing to deterministic matching.

### 6. Verify
- `pct_with_refcode` is high for the org.
- Channel breakdown shows a realistic Meta share (hundreds of donations, ~$100k+), not 2.
- Spot-check `modigitalh4nj` donations now resolve to `meta` via `mapping`.
- SMS donations resolve via `sms_match` where a campaign refcode/form matches.

## Technical notes
- Schema change: add `actblue_transactions.refcode2 text`; no destructive changes.
- `recompute_attribution`: broaden exact/prefix/contains refcode checks to consider `coalesce(refcode2,'')` as well; add the SMS proximity tiebreaker.
- Re-import is idempotent via the existing `organization_id,transaction_id` conflict key.
- The form-level override (`modigitalh4nj` → meta) remains available as a manual safety net but is not needed once refcodes import correctly — the deterministic refcode path is more accurate (preserves per-campaign labels).
