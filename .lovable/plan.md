## Goal

When the same refcode (e.g. `victory`) is used by more than one broadcast, attribute each donation to the **most recent broadcast sent on or before the donation date** — the send that actually drove it — instead of the broadcast that happens to be nearest in absolute time (which can be a *future* send).

## Current behavior (the bug)

`recompute_attribution` matches SMS donations to broadcasts in `sms_campaign_metrics` and tie-breaks with:

```sql
ORDER BY abs((t.transaction_date AT TIME ZONE 'America/New_York')::date - s.date) ASC
```

Absolute distance means a donation can be credited to a broadcast that went out *after* it. With a reused refcode like `victory`, donations land on the wrong send.

## Change

In `recompute_attribution` (the only place SMS↔donation matching happens), replace the absolute-distance ordering in the SMS matching steps with a "most recent send on/before the donation, else nearest upcoming" ordering:

```sql
ORDER BY (s.date <= dd) DESC,
         CASE WHEN s.date <= dd THEN dd - s.date
              ELSE s.date - dd END ASC
```

where `dd = (t.transaction_date AT TIME ZONE 'America/New_York')::date`.

This means:
- Broadcasts sent on/before the donation rank first; among them the **most recent** wins (no day cap — "No limit" as requested).
- If a donation predates every matching send, it falls back to the **earliest upcoming** matching broadcast (so early donations still get credited).

Applied to both SMS matching steps in the function:
1. the exact-refcode SMS match, and
2. the fuzzy SMS match (campaign_id / campaign_name contains).

No schema changes, no other functions touched. `sms_broadcast_roi` / `sms_broadcast_detail` already join on the chosen `attributed_campaign`, so they update automatically once attribution is recomputed.

## Apply to existing data

After updating the function, run `recompute_attribution` for the org so all historical SMS donations re-attribute under the new rule. Then spot-check `victory` and a couple of other reused refcodes to confirm donations now sit on the correct send.

## Technical notes
- Only the `ORDER BY` clauses inside the two SMS `SELECT ... LIMIT 1` subqueries change; matching predicates (`WHERE`) stay the same.
- Date math uses the ET-localized donation date already used elsewhere in the function, keeping timezone behavior consistent.
