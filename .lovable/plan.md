## Problem

On `/map` (the Issue Map for regular users), the back button takes the user to `/home`. There's no way for a system admin viewing `/map` to jump to `/admin`. They have to manually edit the URL.

## Fix

In `src/pages/admin/IssueDonorMap.tsx`, when `isAdminView` is `false` (i.e., user-facing `/map`), check `useAuth().isAdmin`. If true, render a small **"Admin"** shortcut button in the top header that navigates to `/admin`.

Placement: in the existing top-bar action row, just before the "Upload Data" slot (which is admin-only on the admin view). Use the same `variant="outline" size="sm"` styling as the Upload Data button for visual consistency. Icon: `Shield` from lucide-react. Label hidden on mobile (`hidden sm:inline`) to match the existing pattern.

No behavior change for non-admins or for the admin route `/admin/issue-map` (which already has sidebar nav).

## Files

- `src/pages/admin/IssueDonorMap.tsx` — import `useAuth`, import `Shield` icon, add conditional button.

## Out of scope

Nothing else. No route changes, no auth changes, no styling overhaul.
