# Per-Broadcast SMS ROI Widget

Add an SMS broadcast performance widget to the Fundraising tab: a compact card listing your best-returning broadcasts, plus an expandable detail view with a full sortable table. Every SMS broadcast already carries its cost, delivery counts, clicks, and a refcode that ties donations back to it — this surfaces ROI per broadcast.

## What it shows

For each broadcast that actually delivered messages:
- **Broadcast name + send date**
- **ROAS** — Raised ÷ Cost, shown as a multiple (e.g. `3.2x`), color-coded (green ≥ 1x, red < 1x)
- **Raised** (attributed donations) · **Cost** · **Donations** · **Donors**
- Secondary metrics: **$ per 1k delivered**, **Conversion rate** (donations ÷ clicks), **Click rate** (clicks ÷ delivered), **Cost per donation**

Broadcasts with no delivered messages are excluded entirely.

## Layout

```text
Fundraising tab
 ├─ KPI grid (existing)
 ├─ Funds vs Spend chart (existing)
 ├─ Revenue by Channel (existing)
 ├─ ► SMS Broadcast Performance  (NEW compact card)
 │     Top broadcasts by ROAS · ROAS bars · [View all broadcasts]
 └─ Recent Donations (existing)

[View all broadcasts] → dialog with full sortable table of every broadcast
```

**Compact card:** header with broadcast count + total SMS raised/cost, then the top ~5 broadcasts ranked by ROAS, each as a row with a ROAS bar, raised, cost, and donations. A "View all broadcasts" button opens the detail view.

**Detail view (dialog):** a sortable table of all in-range broadcasts. Columns: Broadcast, Date, Delivered, Click rate, Cost, Raised, Donations, ROAS, $/1k, Conv. rate, Cost/donation. Click a column header to sort (default ROAS, descending). Color-coded ROAS column. Respects the dashboard's date-range picker (filters by broadcast send date).

## Technical details

### New database RPC — `sms_broadcast_roi(_org_id uuid, _start date, _end date)`
- `SECURITY DEFINER`, `STABLE`, gated by `public.can_access_organization_data(auth.uid(), _org_id)` (same pattern as `org_hourly_rollup`).
- Selects from `sms_campaign_metrics s` where `s.organization_id = _org_id`, `s.date BETWEEN _start AND _end`, and `s.messages_delivered > 0`.
- For each broadcast, a lateral aggregate over `actblue_transactions` where `organization_id = _org_id`, `attributed_channel = 'sms'`, `transaction_type = 'donation'`, and `lower(attributed_campaign) = lower(s.campaign_name)` → `raised = sum(amount)`, `donations = count(*)`, `donors = count(distinct donor_email)`. (Attribution is already computed by `recompute_attribution`, so we just read it.)
- Returns columns: `id, campaign_name, date, refcode, cost, messages_sent, messages_delivered, clicks, raised, donations, donors`.
- All ratio metrics (ROAS, $/1k, click rate, conversion rate, cost/donation) are computed client-side to keep the RPC simple and null-safe.

Migration also grants `EXECUTE` to `authenticated` (RPCs are reachable by default once defined, but we'll set it explicitly).

### Frontend
- **`src/queries/useFundraisingQueries.ts`** — add `SmsBroadcast` type and `useSmsBroadcastRoi(orgId, range)` hook calling `supabase.rpc('sms_broadcast_roi', …)`, mapping rows and deriving `roas`, `dollarsPer1kDelivered`, `clickRate`, `conversionRate`, `costPerDonation` (null when denominator is 0). Same polling/`keepPreviousData` config as the other hooks.
- **`src/components/dashboard/SmsBroadcastRoiCard.tsx`** (new) — compact card (surgical-glass styling, design tokens only) showing the top-5-by-ROAS list with ROAS bars, plus a "View all broadcasts" button that opens the detail dialog. Empty state mirrors `ChannelBreakdownCard` ("No delivered SMS broadcasts for this period yet.").
- **`src/components/dashboard/SmsBroadcastTable.tsx`** (new) — sortable table rendered inside a shadcn `Dialog`, used by the card's "View all" button. Sortable headers with default ROAS-desc, tabular-nums, color-coded ROAS.
- **`src/pages/Dashboard.tsx`** — render `<SmsBroadcastRoiCard orgId={orgId} range={range} />` directly below `<ChannelBreakdownCard />`.

### Notes
- ROAS = Raised ÷ Cost (a broadcast with cost 0 shows "—").
- Revenue per broadcast = all SMS-attributed donations mapped to that broadcast (attribution already date-matches sends to donations); the date-range picker filters which broadcasts appear by their send date.
- No schema/table changes — read-only RPC plus UI. No changes to `recompute_attribution` or the sync pipeline.
