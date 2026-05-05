## Goal
Eliminate "Muslim voter" framing from the live UI and convert the Home National Overview to issue-scoped donor data, in line with the project memory rule: "NEVER use ... 'Muslim voter' framing. ALWAYS use activate, reach, campaign, audience..."

## Audit findings

**Live, user-visible (must fix):**
- `src/components/home/HomeMiniMap.tsx` — National Overview tooltip says "Michigan: 0 muslim voters", metrics are `population/turnout/donors` from `voter_impact_states.muslim_voters`. This is the screenshot.
- `src/pages/Home.tsx` line 295 — uses `HomeMiniMap`. (Container only.)
- `src/lib/colorScales.ts` — `metricLabels.population = 'Muslim Voters'` (powers the tooltip text above).
- `src/components/landing/MapFlyover.tsx` — landing-page hero animation colored by `muslim_voters`.

**Legacy / not routed (verify dead, then leave or delete):**
- `src/components/voter-impact/*` (RegionSidebar, ImpactMap, RegionSearch, ComparePanel, MapControls, DataCart, etc.) — per memory the Voter Impact Map was removed. Confirm no route imports them; if dead, delete.
- `src/pages/Admin.tsx` — old standalone admin uploader referencing `muslim_voters`/`muslim_registered`. Confirm replaced by `src/pages/admin/*` and remove if unused.
- `src/hooks/useVoterData.ts`, `src/hooks/useImpactMapLayers.ts` — only used by voter-impact components; remove if those are removed.

**Backend / DB (keep, do not touch):**
- `voter_impact_districts/states.muslim_*` columns — memory: "kept only as read-only election context". Leave columns; just stop surfacing the label.
- `src/integrations/supabase/types.ts` — auto-generated, do not edit.
- Migration files — historical, do not edit.

**Email/branding (separate concern — defer):**
- `muslimvoterproject.com` URLs and `notify.muslimvoterproject.com` sender across edge functions and email templates. Per memory: "Email sender domain still notify.muslimvoterproject.com — domain rebrand deferred." Skip unless you confirm otherwise.

## Plan

### 1. Convert Home National Overview to issue data
Rewrite `HomeMiniMap.tsx` to:
- Accept the active issue (read from existing `activeIssueId` state in `Home.tsx` and pass via prop).
- Pull from `issue_donor_states` (via `useIssueDonorStates([activeIssueId])`) instead of `voter_impact_states`.
- Replace the metric toggle with issue metrics: **Total Donors / Gold Donors / Silver Donors** (matches `/map`).
- Tooltip format: `"Michigan: 12,400 total donors"` (no "muslim").
- Color scale: reuse the issue color palette from `src/lib/issueColors.ts` (already used by IssueMap), keyed off the chosen metric.
- On click, navigate to `/map?region=XX&type=state&issue=<id>` so context carries through.

### 2. Update labels in `colorScales.ts`
- Change `metricLabels.population` from `'Muslim Voters'` to `'Population'` (kept for any remaining legacy reads). If voter-impact components are deleted in step 4, this whole file's `population/turnout/donors` legacy section can go too.

### 3. Fix landing flyover
- `MapFlyover.tsx`: switch its color source to neutral state metadata (e.g., paint by `vote_2024_pct` or just an aesthetic gradient by FIPS) so we stop reading `muslim_voters` for marketing visuals.

### 4. Remove dead voter-impact code (only if unrouted)
After grepping `App.tsx` and the admin layout, delete any of these that have zero importers:
- `src/components/voter-impact/` directory
- `src/hooks/useVoterData.ts`, `src/hooks/useImpactMapLayers.ts`
- `src/pages/Admin.tsx` (legacy standalone admin), if `src/pages/admin/*` covers everything.

If anything is still referenced, leave the file but rename user-facing labels ("Muslim Voters" → "Population" or remove the row entirely).

### 5. Verification pass
- Re-run `rg -i muslim src/` — every remaining hit should be either (a) auto-generated `types.ts`, (b) a migration file, or (c) inside a deleted directory. No live UI string should match.
- Smoke test `/home` (tooltip wording, metric toggle), `/` (landing flyover still renders), `/map` (unchanged).

## Notes
- No DB migrations. Data model unchanged.
- No changes to email infra (deferred per memory).
- Issue-based metrics on the home overview require an active issue; if no issues are published yet we'll fall back to a neutral grey map with "Select an issue to see donor data" hint.