# Issue Map — Small UX Polish

From an end-to-end test of `/map`, the core flows work well: metric switching updates the legend and AK/HI cards live, hover tooltips are clear, the issue swap-in-place works, and the softened dimming reads nicely. Below are small, low-risk tweaks that make the tool friendlier — no business-logic or data changes.

## Proposed tweaks

### 1. Desktop "explore" hint (discoverability)
Mobile shows a "Tap a region to explore" pill, but desktop gets nothing. New users don't know a state is clickable or that clicking drills into congressional districts.
- Add a subtle, dismissible hint near the map (e.g. bottom-center) on desktop: "Click a state to drill into its districts."
- Auto-dismiss on first region selection; remember dismissal in `localStorage` so it doesn't nag on return visits.

### 2. Clearer swap affordance on selected issues
The issue name is a dropdown to swap issues, but the only cue is a faint chevron that brightens on hover. Make it obvious it's interactive:
- Always show the chevron at low opacity (not only on hover) and add a `title`/tooltip "Click to switch issue" (title already present).
- Tiny hover background already exists — keep it, just raise the resting chevron opacity.

### 3. Label the metric tabs
The five metric tabs (Total Donors, Gold Donors, …) sit in the top bar next to "Home" and "Admin", so they can read like site navigation rather than map controls.
- Add a small "Metric" label/caption before the tab group on desktop (the mobile collapsed view already says "Metric").

### 4. "Drill into districts" prompt in the sidebar
When a state is selected, there's no on-screen cue that a second click (or zoom) reveals districts; users rely on discovering the toast.
- Add a small inline hint at the top of the state sidebar: "Click the state again to view its congressional districts." Hidden once in district view.

### 5. Minor consistency
- Ensure the AK/HI mini-cards and the legend never visually collide at short viewport heights (add a small bottom offset/guard).

## Technical notes
- All changes live in presentation components: `src/pages/admin/IssueDonorMap.tsx` (desktop hint, metric label), `src/components/issue-donor/IssueSelector.tsx` (chevron opacity), `src/components/issue-donor/IssueRegionSidebar.tsx` (drill-in hint), and `src/components/issue-donor/IssueMap.tsx` (only if needed for the hint placement / mini-card offset).
- Use existing semantic tokens and the established surgical-glass styling; no new colors.
- `localStorage` keys follow the existing `issueMap.*` convention (e.g. `issueMap.desktopHintDismissed`).

## Out of scope
No changes to data, metrics math, pricing/quote flow, or terminology.

Want all five, or a subset? I can also drop any you consider unnecessary.
