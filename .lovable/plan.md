## Goal

When an SMS broadcast's link does **not** contain an ActBlue link or redirect to ActBlue, keep the broadcast visible in the table but exclude its cost and raised from the totals and ROAS (its ROAS shows "—").

## How it works

During sync we already inspect each broadcast's message text, extract any direct ActBlue link, and follow vanity-link redirects. We'll record whether that inspection found an ActBlue destination at all, store it as a flag, surface it through the ROI query, and have the frontend exclude flagged broadcasts from ROAS math.

```text
sync → detect ActBlue link/redirect → has_actblue_link flag
     → sms_broadcast_roi returns flag
     → frontend: if !has_actblue_link → exclude from totals/ROAS, show "—" + badge
```

## Changes

### 1. Database (migration)
- Add column `has_actblue_link boolean NOT NULL DEFAULT true` to `sms_campaign_metrics`. Default `true` so existing rows are unaffected until the next sync recomputes them.
- Update `sms_broadcast_roi` and `sms_broadcast_detail` RPCs to also return `has_actblue_link` (no row filtering — broadcasts still appear).

### 2. Sync logic (`supabase/functions/_shared/sync-lib.ts`)
- In the per-broadcast link inspection, track a `hasActBlue` boolean per broadcast that is true when **either**:
  - a direct ActBlue link is present in the message text (direct refcode path), **or**
  - the vanity URL's redirect chain resolves to an `actblue.com` URL (even if it carries no `refcode`).
- Set `r.has_actblue_link` on each row from that boolean. Broadcasts whose links never reach ActBlue get `false`.
- Persist via the existing upsert (column added to the row object).

### 3. Frontend
- `src/pages/SmsBroadcasts.tsx` — when summing `raised` and `cost` for the totals/ROAS, skip broadcasts where `has_actblue_link === false`.
- `src/components/dashboard/SmsBroadcastTable.tsx` — for flagged broadcasts, render ROAS as "—" and add a small "No ActBlue link" badge/indicator on the row so it's clear why it's excluded.
- `src/components/dashboard/SmsBroadcastRoiCard.tsx` — exclude flagged broadcasts from the top-ROAS list and the total raised/cost it computes.
- Regenerated Supabase types will include the new field for the RPC return shapes.

## Notes / honest limits
- The flag is only as accurate as the link resolution at sync time. A shared, repointed vanity link that *currently* resolves to ActBlue will be marked `has_actblue_link = true` even for older sends (consistent with the existing refcode uniqueness behavior). The exclusion targets broadcasts whose link genuinely never reaches ActBlue (e.g. the `/zoomfundraiser` style links that resolve elsewhere).
- No changes to the attribution function or to ActBlue/Meta sync paths.
