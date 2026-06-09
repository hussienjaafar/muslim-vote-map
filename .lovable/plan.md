# Fix: Fundraising tab missing during admin impersonation

## Problem
On `/home`, the combined shell decides whether to show the **Fundraising** tab using `organizations.length > 0` (real memberships only). When a platform admin uses "View as org" (impersonation), they have no membership row, so `hasOrg` is `false` — the tab bar and Fundraising view never render, and `?tab=fundraising` is ignored. This is why "Viewing as Hamawy For NJ" shows only the Data & Issues dashboard.

## Fix (`src/pages/Workspace.tsx`)
- Pull `activeOrg` (and `isImpersonating`) from `useOrg()` in addition to `organizations`.
- Change the gate from `organizations.length > 0` to `!!activeOrg` so it's true for both real org members **and** admins impersonating an org.
- Keep the default-tab logic unchanged: when an org context exists, default to Fundraising; non-org users still see only Data & Issues with no tab bar.

## Verify
- Reload `/home?tab=fundraising` while impersonating "Hamawy For NJ": Fundraising tab is visible and active, showing the org's metrics; switching to Data & Issues works.
- A regular org member still lands on Fundraising with both tabs.
- A user with no org (and not impersonating) still sees only the data dashboard, no tab bar.

## Notes
- Frontend-only, one file. No backend/query changes.
