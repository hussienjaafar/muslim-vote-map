# Refcode Attribution System (Molitico-parity, adapted to CDS)

## How Molitico works (analysis)
- Attribution is computed **at ingest** in the ActBlue webhook and **stored on each transaction** as `attributed_channel` (+ `sms_campaign_id`). Their old nightly `calculate-attribution` batch is explicitly deprecated.
- It runs a **priority chain**: form-channel override → deterministic `refcode_mappings` exact match → click_id/fbclid match → `sms_campaigns` refcode match → `refcode2` `fb_` prefix → form-name match → keyword patterns (`fb`/`sms`/`txt`/`email`) → else `other`/`organic`.
- `refcode_mappings` is auto-filled when they **deploy Meta ads from their app** (refcode minted at ad creation); unmapped refcodes trigger a just-in-time re-sync.
- Dashboard RPCs read the **pre-computed** `attributed_channel` (no query-time joins) for per-channel raised/ROI.

## Improvements we'll make
- **Single source of truth + idempotent recompute.** One shared TypeScript attribution resolver used by both ingestion paths (webhook *and* CSV/API sync) — Molitico's logic lives only in the webhook, so their CSV-synced rows can drift. We unify it.
- **DB-side recompute function** so backfills and mapping edits re-attribute history without re-importing.
- **Confidence + method tracking** (`attribution_method`, `attribution_confidence`) so the dashboard can show "deterministic vs pattern-guessed" instead of a flat label.
- **Reuse the existing empty `campaign_attribution` table** as the deterministic mapping store rather than adding a parallel one.
- Keep CDS terminology (no "purchase/CSV/download" language in UI).

## What we don't replicate
We don't create Meta campaigns from our app, so there's no auto-minted refcode. Deterministic mappings are **admin-managed** instead, with pattern matching as the fallback. (If we later add Meta campaign deploys, the resolver already supports deterministic mappings.)

---

## Implementation

### 1. Schema (migration)
- `actblue_transactions`: add `attributed_channel text default 'other'`, `attributed_campaign text`, `attribution_method text`, `attribution_confidence text`. Index `(organization_id, attributed_channel)`.
- **Reuse `campaign_attribution`** as the deterministic mapping table; add `platform text` (meta/sms/email), `match_type text` (`exact`/`prefix`/`contains`), `pattern text`, `priority int`. Mappings are per-org, refcode/pattern → channel + campaign label.
- New `org_form_channel_overrides` (org_id, contribution_form/slug, attributed_channel) — Priority 0 locked channels for dedicated forms. Full GRANT + RLS (admins + org owners manage, org members read).

### 2. Shared resolver — `supabase/functions/_shared/attribution.ts`
`resolveAttribution({ org_id, refcode, source_campaign, form_name }, ctx)` returns `{ channel, campaign, method, confidence, sms_campaign_id }`. Priority chain:
0. `org_form_channel_overrides` substring match on form → locked channel (method=`form_override`, high)
1. `campaign_attribution` exact refcode match → channel/campaign (method=`mapping`, high)
2. `campaign_attribution` prefix/contains pattern match (method=`pattern_mapping`, medium)
3. `sms_campaign_metrics` campaign_id/name match on refcode/form → `sms` (method=`sms_match`, medium)
4. Keyword patterns on refcode/form: `fb|facebook|ig|meta`→meta, `sms|text|txt`→sms, `em|email`→email, `organic|direct`→organic (method=`keyword`, low)
5. else `other` (method=`none`)

Channels: **meta, sms, email, organic, other**.

### 3. Wire ingestion
- `actblue-webhook/index.ts`: call resolver before insert (both single-contribution and lineitems paths), persist the four columns.
- `_shared/sync-lib.ts`: same resolver in the row mapper so CSV/API-synced rows are attributed identically.

### 4. DB recompute + backfill
- `recompute_attribution(_org_id uuid, _since timestamptz)` SQL function mirroring the resolver chain (set-based) for historical rows and post-mapping-edit refresh.
- Backfill migration runs it across all existing ~11k transactions.

### 5. Dashboard per-channel ROI
- Extend `useFundraisingQueries.ts`: aggregate raised/donors by `attributed_channel`; join Meta spend (`meta_ad_metrics`) and SMS cost (`sms_campaign_metrics`) to compute **per-channel ROI** (raised ÷ spend) replacing the current blended number.
- Add a "Revenue by Channel" card (raised, share %, spend, ROI, confidence badge) to the Fundraising dashboard, using existing surgical-glass tokens/components.

### 6. Admin UI for mappings
- New admin screen (under `/admin`) to CRUD per-org refcode mappings (refcode/pattern, match type, channel, campaign label, priority) and form-channel overrides.
- "Recompute attribution" action per org → invokes `recompute_attribution`, shows method/confidence breakdown counts.

### 7. Verify
- Run resolver against current data via `recompute_attribution`; query channel breakdown to confirm coverage improved vs the ~36% refcode fill rate; spot-check known SMS/Meta refcodes.

## Technical notes
- Resolver is pure TS shared between Deno edge functions; the SQL `recompute_attribution` duplicates the same precedence for batch use (kept in sync intentionally).
- `attributed_channel` defaults to `other`; recompute is idempotent and safe to re-run.
- All new public tables get GRANT + RLS in the same migration.
