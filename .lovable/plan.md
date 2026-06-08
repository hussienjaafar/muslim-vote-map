## Goal

Ensure donations flow correctly into the **Recent Donations widget** and the **Fundraising Intelligence chart**, using Molitico's webhook as the reference for the real ActBlue payload shape.

## What I verified is already working

- **Recent Donations widget** reads `actblue_transactions` directly (`useRecentDonations`). The CSV sync path already populated 11,182 transactions, so this widget works for historical/CSV data.
- **Fundraising Intelligence chart** reads `daily_aggregated_metrics` (`useFundraisingSummary`), which is rebuilt by `aggregateDaily` after every sync and after every webhook delivery. 147 daily rows exist and totals match the transactions.
- **CSV ingestion** is healthy (export jobs complete, credentials valid).

## The real problem: webhook payload parsing

Our `actblue-webhook` only looks for the entity ID, amount, and timestamp at the **contribution/top level**. Real ActBlue "Default" webhooks put these inside the **`lineitems[]` array** (confirmed against Molitico's `actblue-webhook`, which reads `lineitems[0].entityId`, `lineitem.amount`, `lineitem.paidAt`).

Consequence: a genuine ActBlue delivery is rejected with `400 Missing entity_id`. Our earlier "success" tests only passed because we hand-placed `entityId` at the contribution level. **Live donations would not land** in either widget.

```text
Real ActBlue payload (simplified):
{
  "contribution": { createdAt, orderNumber, refcodes:{refcode}, recurringPeriod, contributionForm },
  "lineitems":   [ { entityId, amount, paidAt, committeeName } ],
  "donor":       { firstname, lastname, email },
  "form":        { name }
}
```

## Changes

### 1. `supabase/functions/actblue-webhook/index.ts` — parse like ActBlue actually sends

- **Entity ID**: extend lookup to scan `body.lineitems[].entityId` (keep existing contribution/top-level fallbacks for our test payloads). Match the stored org `entity_id` against the entity found in the line items.
- **Pick the matching line item**: when multiple line items exist (split contributions), use the one whose `entityId` matches the resolved org; fall back to the first.
- **Amount**: read from the matched `lineitem.amount`, fall back to `contribution.amount`.
- **Transaction date**: prefer `lineitem.paidAt`, then `contribution.createdAt`, run through `normalizeActBlueTimestamp` (already handles ET→UTC).
- **Transaction ID**: keep `contribution.orderNumber` (fall back to `receiptId`/`lineitemId`).
- **Donor, refcode, form, recurring**: keep current logic (already reads `donor`, `contribution.refcodes`, `recurringPeriod`).
- Keep Basic Auth, the entity-based org routing, and the per-day `aggregateDaily` re-aggregation exactly as-is.

### 2. Verify end-to-end with a realistic payload

- Re-test the deployed function with a **true ActBlue-shaped payload** (entityId/amount/paidAt inside `lineitems`) using Basic Auth `CDS:CDS2026`, expecting `200 {"ok":true}`.
- Confirm the row appears in `actblue_transactions` (Recent Donations) and that `daily_aggregated_metrics` for that day updates (Fundraising chart).
- Delete the verification row afterward so it doesn't pollute the dashboard.

### 3. Reconcile the aggregate table

- Run a full `sync-org` (or targeted re-aggregation) for the org so `daily_aggregated_metrics` is recomputed from current transactions, clearing the small stale offset left by earlier test-donation deletes (aggregates were ~$35 / 2 donations ahead of the live transaction count).

## Out of scope (Molitico extras we are intentionally not adding)

Molitico also has `webhook_logs`, HMAC signature auth, refcode-mapping attribution, and failed-webhook reprocessing. Those are a larger attribution/observability system beyond "ingestion into the two widgets," so I'll leave them out unless you want them. The fix above is what makes live donations actually ingest.

## Verification checklist

- [ ] Webhook accepts a real ActBlue `lineitems` payload → `200 {"ok":true}`
- [ ] New donation visible via `actblue_transactions` query (Recent Donations)
- [ ] `daily_aggregated_metrics` day total increments (Fundraising chart)
- [ ] Aggregate totals reconcile with transaction totals
- [ ] Verification row removed
