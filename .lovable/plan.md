# Reliable per-broadcast refcode extraction

## Goal
Keep your existing refcode-based attribution. Stop guessing which refcode belongs to each SMS broadcast by date, and instead extract the real `?refcode=` straight from each broadcast's form link.

## Why today is unreliable
- ActBlue donations already capture `refcode` correctly at the transaction level (e.g. `victory`, `electionday`). That part works.
- The weak link is mapping each **broadcast** to a refcode. The Switchboard SMS message contains the donate link, but we never read it — `assign_sms_refcodes` instead infers a broadcast's refcode from whichever refcode happened to appear in donations on the send date. When two sends are close together or share a label, broadcasts get the wrong refcode or `NULL` (e.g. Copy of Frontrunner, Q1_Deadline, Fundraiser_3272026 all sit at `NULL` → 0.00x ROAS).

## What we found
The Switchboard list endpoint we currently call returns only summary fields (no message body). But the single-broadcast endpoint `GET /v1/broadcasts/{id}` returns `message_text`, which contains the ActBlue link the organizer pasted, e.g.:

```text
"Hey {{firstname}}, donate here: https://secure.actblue.com/donate/moliticosms?refcode=victory&..."
```

So we can parse `?refcode=` (and `refcode2`) directly from `message_text` per broadcast.

## Changes

### 1. Pull the real link per broadcast (sync-lib.ts → syncSwitchboard)
- For each broadcast we upsert, call `GET /v1/broadcasts/{id}` and read `message_text`.
- Extract the refcode from any ActBlue URL in the text using a regex like `refcode2?=([^&#\s"']+)` (lowercased), reusing the existing `extractRefcode` helper pattern.
- Store it on `sms_campaign_metrics` in a new dedicated column `link_refcode` (so it is never clobbered by the date heuristic).
- Incremental syncs only fetch detail for broadcasts in the window; full backfills fetch all. A small per-call guard keeps request volume bounded.

### 2. Make the link refcode authoritative (assign_sms_refcodes)
- Change the function so each broadcast's `refcode` is set to `coalesce(link_refcode, <existing date-based guess>)`.
- The deterministic link refcode always wins; the date heuristic only fills broadcasts whose message had no extractable ActBlue link (e.g. media-only sends or shortened links).

### 3. Attribution flows through unchanged
- `recompute_attribution` already matches ActBlue transactions to broadcasts via `sms_campaign_metrics.refcode`. With correct per-broadcast refcodes, the SMS ROI / detail widgets show the right Raised and ROAS automatically.

### 4. Backfill
- Run a full org re-sync so historical broadcasts get their `link_refcode` populated and attribution recomputes.

## Honest limitation (no behavior hidden from you)
If two different broadcasts genuinely use the **same** `refcode` (e.g. both link to `?refcode=victory`), ActBlue exports cannot tell them apart — the unique part of the link (`refcodeSB`/`t`) is not stored by ActBlue. In that case donations are split between the same-refcode broadcasts by closest send date. To get fully exact separation, each broadcast needs its own unique `?refcode=` in the form link. This plan guarantees we always capture whatever refcode the form actually used.

## Out of scope
- No use of Switchboard's reported donation/amount numbers (you asked to stay on the refcode system).
- No change to the org-wide Channel Breakdown or Attribution admin logic beyond the improved SMS refcode mapping.

## Technical notes
- Migration: add `link_refcode text` to `sms_campaign_metrics`; update `assign_sms_refcodes` to prefer it.
- Edge function: `supabase/functions/_shared/sync-lib.ts` (`syncSwitchboard`) gains the per-broadcast detail fetch + refcode parse + `link_refcode` write.
- Frontend: no required changes; widgets read existing fields. ROAS rows that were 0.00x due to bad mapping populate once attribution recomputes.
