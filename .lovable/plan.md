# Fix off-center Refresh button

## Problem
In `src/pages/Dashboard.tsx`, the header is a single row with `items-center`. The Refresh button lives in a `flex flex-col items-end` column that also stacks the "Updated…", refresh-error, and Meta-stale status lines beneath it. When those lines appear, the column grows taller and `items-center` re-centers the whole column — pushing the button up so it no longer lines up with the OrgSwitcher and Date range picker next to it.

## Fix
Stop the status text from affecting the button's vertical position so the button stays aligned with its sibling controls regardless of whether a message is present.

Approach: anchor the status text below the button without adding to the row's measured height, by giving the button column `relative` positioning and rendering the stacked status messages in an absolutely-positioned block placed just under the button (`absolute top-full right-0`). The button itself becomes the only flow content in the column, so it aligns with the OrgSwitcher/DateRangePicker via the parent `items-center`.

```text
[ Refresh ▸ ]   [ Org ▾ ]   [ 7D | 30D | ... ]   ← all centered on button row
  Updated 1:33 PM ET                               ← floats beneath, no layout shift
  Meta Ads last synced …
```

### Technical details (file: `src/pages/Dashboard.tsx`)
- Change the button wrapper from `flex flex-col items-end` to `relative flex flex-col items-end`.
- Move the three conditional status spans (`lastUpdated`, `summaryError`, `metaStale`) into a single `absolute top-full right-0 mt-1` container (right-aligned, `flex flex-col items-end`, `whitespace-nowrap`) so they render below the button but are removed from the row's height calculation.
- No logic, data, or copy changes — purely a layout/markup adjustment.

This keeps the Refresh button vertically centered with the adjacent controls whether or not the "Updated…" message (or the stale/error warnings) is showing.