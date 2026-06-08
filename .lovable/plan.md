# Faster admin ↔ org dashboard navigation

## Problem
As a platform admin you regularly check different orgs' fundraising dashboards, then jump back to the admin panel. Today the only flow is: `/admin/orgs` → open one org → "View dashboard as org" → "Exit" → back to `/admin/orgs` → open the next org. Switching between orgs means three clicks and a full round-trip every time. The impersonation banner only offers an "Exit" button.

## Goal
While impersonating, give a single always-visible control bar that lets you:
- Switch directly to any other org's dashboard (no return trip to the orgs list)
- Jump straight back to the system admin dashboard
- Exit impersonation entirely

## Approach
Upgrade the existing `ImpersonationBanner` (already global, renders on every page while impersonating) into a compact navigation bar with three controls.

```text
 ┌──────────────────────────────────────────────────────────────┐
 │ 👁 Viewing as [ Hamawy For NJ ▾ ]      [ ⚙ Admin ]   [ ✕ Exit ]│
 └──────────────────────────────────────────────────────────────┘
```

### 1. Org dropdown (the core improvement)
- Replace the static "Viewing as <name>" text with a dropdown trigger showing the current org name.
- Populate it from `useAdminOrganizations()` (already exists in `src/queries/useAdminOrgQueries.ts`), with a small search box for long lists.
- Selecting an org calls `startImpersonation({ id, name, logo_url })` for that org and navigates to `/dashboard` (or stays on `/dashboard` if already there). The Dashboard re-reads `activeOrg` from `OrgContext`, so KPIs refresh automatically.
- Only fetch the org list when the dropdown opens (lazy) to avoid loading it for non-admins.

### 2. "Admin" button
- Adds a quick button that navigates to `/admin` **without** stopping impersonation, so the banner stays available and you can dive back into another org immediately.

### 3. "Exit" button
- Keep current behavior: `stopImpersonation()` + navigate to `/admin/orgs`.

### Optional convenience (low effort, include unless you object)
- On `/admin/orgs`, add an inline "View dashboard" (eye) action on each row/card so you can start impersonating any org in one click straight from the list, instead of opening the detail page first.

## Files to change
- `src/components/org/ImpersonationBanner.tsx` — main rework: add org dropdown (Command/Popover), "Admin" button, keep "Exit". Use `useAdminOrganizations` + `useOrg().startImpersonation`.
- `src/pages/admin/Organizations.tsx` — (optional) add one-click "View dashboard" action per org row/card.

No backend, schema, or data changes. Impersonation security is unchanged — the banner and org list only render for confirmed platform admins via existing `isAdmin` gating in `OrgContext`.

## Notes
- The banner is `sticky top-0 z-50` and already accounts for layout on all pages; the added controls keep the same single-row height and collapse labels to icons on mobile (`hidden sm:inline`).
- Reuse the existing `OrgPicker`/Command dialog styling for visual consistency where practical.
