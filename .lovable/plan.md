## Problem

Some broadcasts share one vanity link that's **repointed to a new ActBlue target before each send**. Our sync resolves the vanity link *live* on every run, so it only ever reflects where the link points *now* — i.e. the most recent broadcast. Older sends that used the same link get the wrong refcode (or none), so their donations can't be attributed.

## Key insight

The cron sync runs daily, so each broadcast is first seen within ~24h of its send — **while the vanity link still points to that broadcast's own target**, before the next send repoints it. If we resolve each broadcast's destination **once, the first time we see it, and lock it in**, every future broadcast captures its own refcode at send time. This differentiates shared-link sends going forward.

(History can't be recovered: on the initial backfill the link only reflects the latest send, so older shared-link broadcasts stay on date-based fallback. Only new sends are fixed.)

## Changes

### 1. Schema (one migration on `sms_campaign_metrics`)
- Add `link_resolved boolean NOT NULL DEFAULT false` — marks broadcasts whose vanity link has already been resolved and locked.
- Add `link_target_url text` — stores the resolved final destination URL (diagnostics + future re-derivation).

### 2. Switchboard sync (`supabase/functions/_shared/sync-lib.ts`, `syncSwitchboard`)
- Before the resolve loop, fetch existing `campaign_id → { link_resolved, link_refcode, link_target_url }` for this org.
- **Only resolve broadcasts that are not yet resolved** (`link_resolved = false` or new). Skip the live fetch/redirect for already-locked broadcasts and carry their stored `link_refcode` / `link_target_url` forward unchanged.
- For each newly resolved broadcast: store `link_refcode` (refcode from the message text or the resolved ActBlue URL), `link_target_url` (final resolved URL), set `has_actblue_link`, and set `link_resolved = true` — whether or not a refcode was found, so we never re-resolve and overwrite it later.
- Keep the existing within-batch guard for the *not-yet-resolved* set only: when several unresolved broadcasts in the same sync share one vanity link, trust the resolved refcode only for the most recent one; the rest stay null and fall back to date matching. This stops the initial backfill from smearing the latest target across older sends.
- The upsert must not clobber locked values: include `link_resolved`, `link_refcode`, `link_target_url` in the upserted rows using the preserved (existing) values for already-resolved broadcasts.

### 3. Attribution
- No change to `recompute_attribution` or `assign_sms_refcodes`. They already prefer `link_refcode` and fall back to date/form-name matching. With per-broadcast `link_refcode` now correctly locked, exact refcode matching naturally attributes each shared-link broadcast to its own donations.

## Apply / verify
- After deploy, run a sync; confirm new/unresolved broadcasts get distinct `link_refcode` / `link_target_url` and `link_resolved = true`.
- Spot-check a set of broadcasts that share a vanity link: each should now carry its own refcode rather than all sharing the latest one.
- Re-run `recompute_attribution` for the org and verify donations split correctly across the shared-link broadcasts.

## Technical notes
- Daily cadence is the assumption that makes first-sight capture correct. If two broadcasts share a link and are sent on the *same day*, the daily sync may still only catch the later target for both — increasing sync frequency would tighten this, but that's out of scope here.
- No frontend changes; `sms_broadcast_roi` / `sms_broadcast_detail` already join on `attributed_campaign`.
