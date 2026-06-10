# Robust SMS Broadcasts: detail sub-tab + richer widget

Expand the SMS feature from a single ROI card into a full broadcast analytics area: add date & time sent everywhere, a dedicated **SMS** sub-tab that lists every broadcast, and a per-broadcast **detail page** (shareable URL) covering deliverability, engagement, fundraising/ROI, and the individual attributed donations.

## Key data finding
- The Switchboard API already returns a full `started_at` timestamp — the sync currently discards the time via `.slice(0,10)`. We'll store the full timestamp and backfill via a re-sync.
- `messages_failed`, `opt_outs`, and `conversions` are already synced but never shown — they power the deliverability/engagement sections with no new ingestion.

## Navigation

```text
Header tabs:  [ Fundraising ]  [ SMS ]  [ Data & Issues ]

SMS tab
 ├─ (no broadcast selected) → Broadcast list
 │     sortable table: Broadcast · Date & time · Delivered · Raised+ROAS · …
 │     row click → detail
 └─ ?tab=sms&broadcast=<id> → Broadcast detail page
        ├─ Header: name, date & time sent, refcode, Raised + ROAS pair
        ├─ Audience & deliverability  (sent, delivered, failed, opt-outs + rates)
        ├─ Engagement                 (clicks, click rate, conversions, conv. rate)
        ├─ Fundraising & ROI          (raised, donations, donors, avg gift, cost,
        │                               cost/donation, $/1k delivered, ROAS)
        └─ Attributed donations list  (donor, amount, time, recurring)
```

The compact "SMS Broadcast Performance" card stays on the **Fundraising** tab but gains date & time per row and a "Raised + ROAS" headline pair; its "View all broadcasts" button now links to the SMS sub-tab (replacing the dialog).

## Technical details

### Database
1. **Migration** — `ALTER TABLE public.sms_campaign_metrics ADD COLUMN sent_at timestamptz;` (nullable; UI falls back to `date` when null).
2. **Update `sms_broadcast_roi` RPC** — also return `sent_at, messages_failed, opt_outs, conversions` (used by list + card).
3. **New RPC `sms_broadcast_detail(_org_id uuid, _broadcast_id uuid)`** — returns the single broadcast's full metric row (all columns + attributed `raised/donations/donors`), gated by `can_access_organization_data`.
4. **New RPC `sms_broadcast_donations(_org_id uuid, _broadcast_id uuid)`** — returns attributed donations for that broadcast (`donor_name, amount, transaction_date, is_recurring, refcode`) by matching `attributed_channel='sms'` and `lower(attributed_campaign)=lower(campaign_name)`, ordered by date desc, capped (e.g. 500). Same access gate.
All RPCs `SECURITY DEFINER STABLE` with `GRANT EXECUTE` to `authenticated`/`service_role`.

### Sync (backfill send time)
- **`supabase/functions/_shared/sync-lib.ts`** — in `syncSwitchboard`, add `sent_at: <full started_at ISO>` to each row while keeping `date` (sliced) for the existing conflict key. Deploy `sync-org`.
- **Backfill** — run a full Switchboard re-sync so historical `sent_at` populates from `started_at`. Until it runs, rows show date-only gracefully.

### Frontend
- **`src/queries/useFundraisingQueries.ts`** — extend `SmsBroadcast` with `sentAt`, `messagesFailed`, `optOuts`, `conversions` (+ derived `deliveryRate`, `failureRate`, `optOutRate`, `avgGift`). Add `useSmsBroadcastDetail(orgId, broadcastId)` and `useSmsBroadcastDonations(orgId, broadcastId)` hooks.
- **`src/pages/Workspace.tsx`** — add a third `SMS` tab (value `sms`) between Fundraising and Data; render new `SmsBroadcasts` page when active.
- **`src/pages/SmsBroadcasts.tsx`** (new) — reads `broadcast` search param: if absent shows the broadcast **list** (reuses an extracted table with date/time + Raised+ROAS columns, row → sets `broadcast` param); if present renders `SmsBroadcastDetail`.
- **`src/components/dashboard/SmsBroadcastDetail.tsx`** (new) — the four detail sections above, surgical-glass styling, design tokens only, with a back link to the list and an empty/loading state.
- **`src/components/dashboard/SmsBroadcastRoiCard.tsx`** — add date & time per row, switch headline to Raised + ROAS pair, and point "View all" to `/home?tab=sms`. Retire the in-card dialog table (logic moves to the SMS tab list).
- Reuse existing date-range picker behavior for the list; the detail page shows the broadcast's own all-time attributed donations.

### Notes
- No changes to attribution logic or `recompute_attribution`.
- Time rendered in Eastern Time (matching the rest of the dashboard).
- Donor names in the attributed-donations list are already shown on the existing "Recent Donations" panel, so no new privacy surface.
