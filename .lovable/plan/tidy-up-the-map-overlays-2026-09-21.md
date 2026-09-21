# Tidy up the map overlays

Fix the two problems on the Issue Map: the small Alaska/Hawaii cards colliding with the legend, and the legend itself being too crowded.

## 1. Stop the cards overlapping

- Turn the stacked AK and HI cards into a single compact side-by-side row instead of two stacked boxes.
- Anchor that row directly above the legend using one shared bottom offset, so the two never collide at any window height.
- Keep them clickable exactly as today (click to fly to the state).

## 2. Slim the legend down

Current legend has six stacked rows. New layout, top to bottom:

```text
TOTAL DONORS            [QUANTILE LINEAR LOG]
▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
0      358    3.0K    14K    26K+      top 376K
──────────────────────────────────────────────
National                                  1.3M
```

- Merge the "Top region" line into the end of the number scale row instead of its own line.
- Put the national total on one line: label left, number right.
- Drop the lone color dot when only one issue is selected (it means nothing there); keep per-issue dots and names when several issues are selected.
- Tighten padding and set a consistent width so the panel stops changing size as you switch metrics.

Mobile compact legend gets the same treatment at its smaller scale.

## Technical notes

- `src/components/issue-donor/IssueMap.tsx` — mini-card container becomes a horizontal flex row with a shared bottom offset constant.
- `src/components/issue-donor/IssueMiniCard.tsx` — slightly smaller, horizontal-friendly layout (shape + code + value inline).
- `src/components/issue-donor/IssueLegend.tsx` — restructure both full and compact variants: merge top-region into the stops row, single-line national row, hide the swatch when `selectedIssues.length === 1`, fixed `w-[260px]` (full) / `w-[200px]` (compact).
- `src/pages/admin/IssueDonorMap.tsx` — align the legend's bottom offset with the mini-card offset constant.

No data, query, or backend changes.
