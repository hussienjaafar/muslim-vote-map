## Goal
Let admins publish a Draft issue directly from the Issues panel, without opening the Manage drawer.

## What changes
Add an inline **Publish** button on each Draft issue card in the Issues selector (the panel shown at top-left of the Issue Map). Live issues keep showing the "Live" badge as-is; Draft issues get a small clickable "Publish" control next to (or replacing) the Draft badge.

Clicking it flips `is_published` to `true` for that issue, shows a success toast, and refreshes the list so the badge updates to "Live" immediately. This only appears for admins.

## Technical details
- File: `src/components/issue-donor/IssueSelector.tsx`
  - Add a `useMutation` (mirroring `togglePublish` in `ManageIssuesDrawer.tsx`) that updates `issues.is_published = true` via `supabase.from('issues').update(...)`, invalidates the `['issues']` query, and toasts "Issue published".
  - Gate the control behind admin status using `useAuth()` (`isAdmin`) so regular users never see it.
  - In the selected-issue card row, when `!issue.is_published`, render a compact "Publish" button (instead of/next to the amber Draft badge) wired to the mutation; show a Live badge otherwise.
- No DB/schema changes; reuses existing RLS-allowed update path already used by the Manage drawer.

## Out of scope
- Auto-publish on import (separate option, not requested).
- Un-publishing from this panel (stays in the Manage drawer).
