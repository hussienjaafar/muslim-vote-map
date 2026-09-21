# National Total for Selected Issues

Add a national rollup to the Issue Map that shows the total donors for each selected issue, nationwide, following the currently selected metric.

## What you'll see

- A **"National"** section at the bottom of the map legend card (bottom-left on desktop, compact legend on mobile).
- For a single selected issue: one row — issue color dot, "National Total Donors" (or the active metric's label), and the nationwide number.
- For multiple selected issues: one row per issue, each with its color dot, issue name, and its national total.
- The number updates instantly when you switch metrics (Total Donors / Gold / Silver / Gold Cells / Silver Cells) and when you add or remove issues.

## Technical details

- **Data source:** the state-level rows (`issue_donor_states`) already loaded on the page via `useIssueDonorStates` — the national total is a client-side sum per issue of the active metric. No new queries or migrations.
- **Changes:**
  - `src/components/issue-donor/IssueLegend.tsx` — new optional `nationalTotals?: { issueId, name, value }[]` prop; renders a bordered "National" block below the ramp in both full and compact variants.
  - `src/pages/admin/IssueDonorMap.tsx` — compute the per-issue sums from `stateData` with a `useMemo` keyed on `stateData`, `selectedIssues`, and `metric`; pass into both legend instances.
- Reuses the legend's existing `formatNum` compact formatting (e.g. 12.4K / 1.2M) and issue palette dots, keeping the surgical-glass styling consistent.
