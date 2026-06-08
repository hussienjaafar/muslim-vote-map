# Fix: "View dashboard as org" shows "No organization yet"

## Problem
When an admin clicks **View dashboard as org** for an organization (e.g. "Hamawy For NJ"), the Dashboard can show the "No organization yet" empty state instead of the org's dashboard.

The org record exists and is valid. The bug is timing inside `src/contexts/OrgContext.tsx`:

```ts
useEffect(() => {
  if (!isAdmin && impersonatedOrg) stopImpersonation();
}, [isAdmin, impersonatedOrg, stopImpersonation]);
```

`useAuth()` determines `isAdmin` asynchronously — it is `false` until a database lookup completes. On a fresh load of `/dashboard` (page reload, or navigating in before the role check settles), `OrgProvider` restores the impersonated org from sessionStorage while `isAdmin` is momentarily `false`, so this effect immediately clears the impersonation. The computed `activeOrg` then becomes `null` and the Dashboard renders its empty state.

## Fix
Only clear impersonation once we actually know the user is not an admin — i.e. after the auth/role check has finished loading.

In `src/contexts/OrgContext.tsx`:
1. Pull `loading` out of `useAuth()` (rename to `authLoading`) alongside `user` and `isAdmin`.
2. Guard the cleanup effect so it only runs when auth has finished loading:

```ts
const { user, isAdmin, loading: authLoading } = useAuth();

// Only platform admins may impersonate; clear stale state for confirmed non-admins.
useEffect(() => {
  if (!authLoading && !isAdmin && impersonatedOrg) stopImpersonation();
}, [authLoading, isAdmin, impersonatedOrg, stopImpersonation]);
```

This keeps the security behavior (non-admins can never impersonate) while preventing the false-negative clear during the brief window when the admin role is still being verified.

## Verification
- Reload `/admin/orgs/<id>`, click **View dashboard as org** → Dashboard shows the org's data and the amber impersonation banner.
- Reload `/dashboard` while impersonating → impersonation persists (no longer drops to "No organization yet").
- Confirm a non-admin user still cannot impersonate (effect still clears once `authLoading` is false).

No backend, schema, or data changes — this is a single client-side context fix.