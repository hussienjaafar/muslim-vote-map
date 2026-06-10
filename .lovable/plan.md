## Goal

Go back to **time-relative SMS attribution**, using the **form name as the reference point** for which donations are SMS. Refcode matching stays as the high-confidence first pass; everything else falls back to "nearest broadcast by date."

This fixes broadcasts like **FECFiling** that have no extractable refcode: their SMS-form donations will now attribute to the closest broadcast in time instead of showing $0.

## How attribution will work (in `recompute_attribution`)

The SMS matching happens in two steps inside `recompute_attribution`. Both get the time-relative ordering; the second step is redefined to key off the form name.

### Step 1 — Exact refcode match (unchanged logic, new ordering)
For donations whose `refcode`/`refcode2` exactly equals a broadcast's `refcode`, attribute to that broadcast. When a refcode is shared by multiple broadcasts, pick the **closest by absolute date, preferring a send on/before the donation** on ties:

```sql
ORDER BY
  abs((t.transaction_date AT TIME ZONE 'America/New_York')::date - s.date) ASC,
  (s.date <= (t.transaction_date AT TIME ZONE 'America/New_York')::date) DESC
LIMIT 1
```
- `attribution_method = 'sms_match'`, confidence `high`.

### Step 2 — Form-name reference → nearest broadcast by date
Replace the current fuzzy step (campaign_id-in-refcode / campaign_name-in-form_name) with a **form-name based** rule:

- A donation is treated as SMS when its `form_name` identifies the SMS channel — i.e. `form_name` contains `sms` / `text` / `txt`, **or** it matches an `org_form_channel_overrides` row mapped to the `sms` channel.
- Each such donation (still unattributed after Step 1) is credited to the **nearest SMS broadcast by absolute date**, preferring an on/before send on ties (same ORDER BY as above).
- `attribution_method = 'sms_match'`, confidence `medium`.

This is the "form name as reference point" behavior: the form tells us it's SMS, and the closest broadcast in time gets the credit — no refcode required.

## Result for FECFiling

FECFiling (2026-03-28, no refcode) will now receive the SMS-form donations closest to its send date via Step 2, so it stops showing $0. Donations carrying real refcodes (e.g. `jdendorsement` → DoctorListFundraiser) still attribute correctly via Step 1 and won't be pulled away.

## Apply to existing data

After updating the function, run `recompute_attribution` for the org so all historical SMS donations re-attribute under the restored rule, then spot-check FECFiling and a couple of refcoded broadcasts.

## Technical notes
- Only `recompute_attribution` changes (one migration). The two SMS `SELECT ... LIMIT 1` subqueries get the new ORDER BY; Step 2's `WHERE`/`EXISTS` predicate is rewritten to the form-name SMS test plus a nearest-broadcast lateral pick.
- `sms_broadcast_roi` / `sms_broadcast_detail` already join on `attributed_campaign`, so the dashboard updates automatically once attribution is recomputed.
- No schema or frontend changes.
