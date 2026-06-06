## Goal

Surface issue management directly on the **Data Management** page (`/admin/data`) so admins can rename, reorder, publish/unpublish, and delete issues without hunting for the gear icon on the map.

## What I'll build

Add a new **"Issues"** tab to `DataManagement.tsx`, alongside the existing States / Districts / Import tabs. The tab shows a table of all issues with inline controls — reusing the exact same logic already proven in `ManageIssuesDrawer.tsx`.

Each issue row will have:
- **Name** — inline editable text field
- **Order** — inline editable number (display_order)
- **Slug** — read-only reference
- **Donor records** — count of `issue_donor_districts` rows for that issue, so admins see how much data a delete will remove
- **Status toggle** — Live / Draft switch (`is_published`)
- **Save** — appears when a row has unsaved name/order edits
- **Delete** — opens an `AlertDialog` confirming removal of the issue and all its donor data

### Behavior
- Loads issues via the existing `useIssues()` hook (already returns all issues for admins).
- Mutations mirror `ManageIssuesDrawer`: update `issues` for rename/reorder/publish, delete from `issues` for removal (donor rows cascade as they already do today).
- On success, invalidate the `['issues']` query so the map and this table stay in sync.
- Delete uses the page's existing `AlertDialog` pattern (consistent with the States/Districts "Reset" confirmations) instead of the browser `confirm()` used in the drawer.

### Tab label
The Issues tab shows a live count: `Issues (N)`.

## Notes
- This is purely additive — the map's gear-icon drawer stays exactly as-is.
- All styling uses the page's existing surgical-glass tokens and table components; no new design tokens.
- No database or backend changes — the `issues` table already has RLS allowing admin writes (the map drawer already performs these same operations).

## Technical detail
- New `useIssueDonorCounts()` query: `select issue_id` from `issue_donor_districts` grouped/counted client-side (or a lightweight count per issue), used only to display the "Donor records" column.
- All edits kept in local `edits` state keyed by issue id, identical to the drawer's approach.
