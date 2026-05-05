

## Map View — Round 2 Mobile Polish

The previous pass made the maps usable on mobile. Now they need to **breathe** — currently ~22% of viewport height is consumed by stacked headers, the bottom-sheet peek wastes 130px showing only "Tap a state to explore", and the map itself is mostly empty Canada/Mexico padding while overlays crowd the bottom edge.

### Audit (at 390×844 viewport from the screenshot)

| # | Problem | Impact |
|---|---|---|
| 1 | **Triple-stacked header**: admin h-16 + map h-14 + metric scroller h-12 ≈ 188px (22% of screen) | Map gets only ~430px of vertical space before the 130px bottom-sheet peek = ~300px visible map |
| 2 | **Bottom-sheet peek wastes 130px** when no region selected — only shows "Tap a state to explore" | User stares at empty real estate |
| 3 | **Map doesn't auto-fit to CONUS** on mount on small viewports — wide aspect ratio leaves huge Canada/Mexico borders | "Where's the data?" feeling |
| 4 | **Issue Map**: Issue selector pill ("Campaign Finance +") + map zoom controls + legend all stack on bottom-right area | Visual collision; zoom buttons sit *behind* the legend at 360–390px |
| 5 | **Legend on mobile is full-width** with inline Quantile/Linear/Log toggles → 3 buttons at ~30px wide each | Below 40px tap target; mode toggles are decorative on phones |
| 6 | **Metric pills "G. Cells / S. Cells"** are abbreviations only mobile users see — opaque without hover | Confusing |
| 7 | **Voter Map header** still shows full title `"Muslim Voter Population Map"` (28 chars) which truncates with ellipsis on 360px | Loses context |
| 8 | **Sheet tap-to-cycle drag handle** has only a 30px tap area — easy to miss; users don't realize it's interactive | Discoverability |
| 9 | Both maps: when sheet is at peek and user taps a region, sheet animates to 50% — but the **legend "lift" stays at 140px** instead of hiding, creating a visible flash as legend disappears mid-animation | Janky |
| 10 | No way to **collapse the metric scroller** to reclaim vertical space once the user has chosen | Permanent UI cost |

### Design fixes

#### A. Reclaim vertical space (both maps)
- **Hide bottom-sheet entirely until a region is selected.** Replace the empty peek with a small floating "Tap a region" hint pill at bottom-center (auto-dismisses on first interaction, ~32px tall vs 130px sheet). Once a region is selected, the sheet appears at peek with real data.
- **Collapsible metric row on Issue Map**: add a tiny chevron at the right of the metric scroller; tap collapses it to just show the active metric as a pill. Persists in localStorage.
- **Voter Map title** → use the short metric name on mobile: `"Population"` instead of `"Muslim Voter Population Map"`. Already-dynamic `MAP_TITLES` gets a parallel `MAP_TITLES_SHORT` map.

#### B. Map fit on mount
- On both maps, when `isMobile && !selectedRegion`, call `map.fitBounds([[-125, 24], [-66, 50]], { padding: 20 })` after load to lock onto CONUS so Canada/Mexico don't dominate. AK/HI mini-cards already cover the cutoffs.

#### C. Legend redesign for mobile
- **Remove Quantile/Linear/Log toggles from the mobile legend** — relocate them into a "⋯ Scale" overflow item inside the issue picker sheet. Mobile users almost never change scale modes.
- Keep just: metric label + gradient bar + 3 stops (low / mid / high). Reduces legend height from ~78px to ~46px.

#### D. Issue Map overlay layout
- Move the issue selector pill from `top-3 left-3` → **top-center** (absolute `top-3 left-1/2 -translate-x-1/2`) so it doesn't fight with map zoom controls (which are top-right by default in maplibre).
- Legend and zoom controls cleanly stay on opposite corners.

#### E. Drag-handle discoverability
- Expand the drag-handle button to 100% width × 36px tall (currently ~30px tall, full width but small target).
- Add a subtle one-time pulse animation on first sheet appearance to teach the gesture.

#### F. Sheet/legend animation parity
- When user taps a region and the sheet expands, **start hiding the legend immediately** (CSS opacity transition over 200ms) rather than waiting for `activeSnapPoint` to change. Use a `useEffect` that sets a `legendHiding` flag the moment selection changes.

#### G. Metric label clarity (Issue Map)
- Rename mobile shorts: `"G. Cells"` → `"Gold ☎"`, `"S. Cells"` → `"Silver ☎"` using the phone glyph for instant recognition. Or longer: ditch abbreviations and let the row scroll horizontally — the snap-x scroll already exists, so users can swipe for the rest.

### Out of scope
- Replacing custom bottom sheet with vaul/drawer library (current implementation works; vaul has touch-target and accessibility issues we already worked around).
- Pinch-to-zoom UX changes — handled by maplibre.
- Landscape orientation overhaul.

### Files

- `src/pages/admin/IssueDonorMap.tsx` — hide peek when no region; collapsible metric row; reposition issue selector; short metric labels.
- `src/pages/admin/VoterImpactMap.tsx` — hide peek when no region; short title on mobile; CONUS fit-bounds on mount; legend hide-on-select animation.
- `src/components/issue-donor/IssueLegend.tsx` — remove scale toggles when `compact` prop set (mobile); compact height variant.
- `src/components/voter-impact/MapLegend.tsx` — same compact variant for parity.
- `src/components/issue-donor/IssueSelector.tsx` — accept scale-mode props to expose toggles inside its sheet on mobile.
- `src/components/voter-impact/ImpactMap.tsx` — `fitBounds` to CONUS on initial mobile mount.
- `src/components/issue-donor/IssueMap.tsx` — same `fitBounds` for parity.

No DB changes, no new dependencies, all gated on `useIsMobile()` — desktop unchanged.

### Result

- Map area **reclaims ~150px of vertical space** on mobile (no peek when idle, shorter legend, optional collapsed metric row).
- Issue selector + zoom controls + legend no longer collide on small screens.
- CONUS fills the viewport on mount instead of empty borders.
- Scale-mode toggles remain available (in issue picker sheet) for power users without cluttering the legend for everyone else.
- Drag-handle discoverable; legend transitions smoothly on selection.

