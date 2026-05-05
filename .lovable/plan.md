
# Phase 1 — Naming, Positioning & Scope

Decisions only. No code changes until you approve this plan.

## 1. Product name

**Campaign Data Solutions** (confirmed).

Usage conventions I'll apply consistently:
- Full name: **Campaign Data Solutions**
- Short form (nav, footer, tight UI): **CDS**
- Sender display name (emails): **Campaign Data Solutions**
- Possessive in copy: "Campaign Data Solutions helps you…" (avoid "CDS's")

## 2. Tagline (pick one)

Hero direction: which districts care about which issues, and who funds them there.

- "Issue-based donor intelligence, district by district."
- "See which districts care about the issues you campaign on."
- "Find your strongest districts on the issues that matter."

## 3. Audience repositioning

Strip community-specific copy. Target reader for landing/auth/emails:
- Advocacy organizations
- Issue-based PACs
- Campaign consultants and independent expenditure groups

No references to Muslim-American organizing or culturally specific framing.

## 4. New SKU structure (proposal)

Old SKUs are tied to `voter_impact_*` records. Replace with issue-scoped products driven by `issue_donor_districts` / `issue_donor_states`:

| SKU | Scope | Source columns |
|---|---|---|
| Issue Gold Donors — District | per (issue, CD) | `gold_donors`, `gold_addresses`, `gold_cell_phones` |
| Issue Silver Donors — District | per (issue, CD) | `silver_donors`, `silver_addresses`, `silver_cell_phones` |
| Issue Gold Donors — State | per (issue, state) | state-rollup columns |
| Issue Silver Donors — State | per (issue, state) | state-rollup columns |
| Issue Total Donors — District | combined | `total_donors` |

Pricing: Request-Quote model preserved (no public per-record pricing). Internal `price_per_record` retained on `data_products` for admin-side quoting only.

Decision: reuse old internal numbers ($5 gold / $1 silver) or supply new?

Cart-grouping shifts from `(product, geo)` to `(issue, product, geo)`. `data_cart_items` and `data_order_items` need an `issue_id` column. Migration handled in Phase 5.

## 5. Voter tables — keep as election context

`voter_impact_districts` / `voter_impact_states` currently feed the Issue Map sidebar with election context (winner, margin, turnout). Recommendation: **keep as read-only context**, hide all UI that surfaces Muslim voter counts as a primary metric. `ElectionResultsImport.tsx` stays. `VoterImpactDataImport.tsx` is removed.

Confirm.

## 6. Files to delete (Phase 2)

Routes & pages:
- `src/pages/admin/VoterImpactMap.tsx`
- Remove `/admin/voter-impact-map` route in `App.tsx`
- Promote `IssueDonorMap` from `/admin/issue-map` → `/map` (auth-gated, primary user map). Keep an admin entry that reuses the same component with import/manage controls visible.

Components — delete:
- `src/components/voter-impact/ImpactMap.tsx`
- `src/components/voter-impact/MapLegend.tsx`
- `src/components/voter-impact/MapControls.tsx`
- `src/components/voter-impact/DataProductSelector.tsx`
- `src/components/voter-impact/ComparePanel.tsx`
- `src/components/voter-impact/StateMiniCard.tsx`
- `src/components/voter-impact/RegionSidebar.tsx`
- `src/components/voter-impact/RegionSearch.tsx` (after confirming `IssueRegionSearch` covers all callers)

Components — keep & refactor:
- `src/components/voter-impact/DataCart.tsx`, `DataCartIcon.tsx` — retained, refactored issue-scoped

Home widgets — delete and rebuild around issues:
- `src/components/home/HomeMiniMap.tsx`
- `src/components/home/RecommendedDistricts.tsx`
- `src/components/home/YourRegionsWidget.tsx`

Admin imports:
- Delete: `src/components/admin/VoterImpactDataImport.tsx`
- Keep: `src/components/admin/IssueDonorImport.tsx`, `ElectionResultsImport.tsx`

Hooks:
- `src/hooks/useImpactMapLayers.ts` — delete
- `src/hooks/useVoterData.ts` — keep, prune unused methods after sweep

Landing:
- `src/components/landing/MapFlyover.tsx` — re-theme, do not delete
- `src/components/landing/ParticleField.tsx` — keep

Memory:
- `.lovable/memory/index.md` — replace with Campaign Data Solutions framing
- `mem://index.md` Core — drop Muslim framing; swap map-colors rule for "per-issue palettes from `src/lib/issueColors.ts`"
- `mem://project/business-model` — rewrite around issue-based activation
- `mem://features/user-home` — rewrite around issues
- `mem://data/voter-impact-map` — demote to election-context-only note

## 7. Untouched

Auth, invite-only flow, access vetting, admin shell, mobile sheet logic, surgical-glass design system, fonts, color tokens (except map-color memory rule), Lovable Cloud wiring, edge functions, PGMQ, pg_cron, Stripe wiring, Meta Pixel/CAPI scaffolding.

## Phase order

```
Phase 1  Naming + scope                ← THIS PLAN
Phase 2  Routes + admin restructure    promote /map, delete VoterImpactMap, sidebar
Phase 3  Landing + copy + email        new /, marketing/auth/email copy
Phase 4  /home rebuild around issues   new mini-map + recommended issues widget
Phase 5  Product catalog migration     new SKUs, cart/order schema migration
Phase 6  Memory + SEO + assets         index.html, robots.txt, og, memory files
```

## Decisions I still need

1. Tagline: pick one of three (or rewrite).
2. SKU pricing: reuse $5 gold / $1 silver internally, or new numbers?
3. Confirm voter tables stay as read-only election context.
4. Confirm `RegionSearch.tsx` deletion (after `IssueRegionSearch` audit).
