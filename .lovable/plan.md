# Plan: Exact refcode-to-refcode SMS attribution

## Goal
Match each SMS donation to the **specific broadcast that used that refcode**, the same deterministic way Meta works today. Right now donations and broadcasts have no shared key: donations carry refcodes like `victory`/`frontrunner`, but `sms_campaign_metrics` only stores the Switchboard `campaign_id` (`bc_01...`) and `campaign_name` — no refcode. So first we capture each broadcast's refcode from its link, then match exactly.

Per your answers: refcode comes from the broadcast's link (sync parses it), **exact** match only, and the same refcode can appear on multiple broadcasts → attribute to the broadcast whose **send date is closest** to the donation date.

## How it works

```text
Broadcast message body ──contains──▶ shortened link ──resolves──▶ ActBlue URL ?refcode=victory
                                                                              │
sms_campaign_metrics.refcode  ◀── store ──────────────────────────────────────┘
                                                                              │ exact match (case-insensitive)
actblue_transactions.refcode "victory" ──────────────────────────────────────┘
        └─ if multiple broadcasts share "victory" → pick closest send date
```

## Changes

### 1. Add `refcode` to `sms_campaign_metrics` (migration)
- Add `refcode text` column (nullable). No data backfill in the migration itself.

### 2. Capture the broadcast refcode during Switchboard sync (`syncSwitchboard` in `_shared/sync-lib.ts`)
- For each broadcast, read its message body / link field from the Switchboard API (using the Get Broadcast detail when the list response doesn't include the body).
- Extract candidate URLs from the body; for Switchboard shortened links, follow the redirect to the final ActBlue URL.
- Parse the `refcode` (fallback `refcode2`) query param using the existing `extractRefcode` helper, and store it on the broadcast's `sms_campaign_metrics` row.
- Robustness: wrap link resolution in try/catch with a short timeout so a broken link never fails the whole sync; leave `refcode` null when none is found.

### 3. Rewrite the SMS tier in `recompute_attribution` (migration)
Run two passes before the existing fallbacks:
- **Pass A — exact refcode match (high confidence):** `lower(t.refcode)` (or `t.refcode2`) `=` `lower(s.refcode)` where `s.refcode` is not null. Sets `attributed_channel='sms'`, `attributed_campaign = campaign_name`, `attribution_method='sms_match'`, `attribution_confidence='high'`. When several broadcasts share the refcode, tie-break by `ORDER BY abs((t.transaction_date AT TIME ZONE 'America/New_York')::date - s.date)` (closest send date).
- **Pass B — existing fallbacks (medium):** keep the current `campaign_id`-contains and `form_name`-contains logic for anything Pass A misses. The `keyword` tier remains the final low-confidence safety net.

### 4. Backfill + recompute
- Trigger a full Switchboard re-sync for the org so existing broadcasts get their `refcode` populated.
- Run `recompute_attribution` so the ~830 SMS donations bind to their exact broadcast at high confidence with `attributed_campaign` set.

## Result
- Every SMS donation links to the exact broadcast whose refcode it carries.
- Confidence upgrades from low (keyword guess) to high (exact refcode match).
- Per-broadcast ROI reporting becomes possible (donations / $ raised vs each broadcast's `cost`).

## Technical notes / open risk
- The one unknown is whether the Switchboard broadcast payload exposes the message body (and thus the link). If the list endpoint omits it, sync will call the Get Broadcast detail endpoint per broadcast. If Switchboard doesn't expose the body/link at all, we fall back to storing the refcode via a small admin-provided broadcast→refcode mapping instead — I'll confirm against the live API during build and adjust.
- Schema change limited to one nullable column; `recompute_attribution` is the only function modified.
