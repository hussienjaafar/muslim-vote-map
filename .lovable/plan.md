# Admin button fully exits impersonation

## Decision
Per industry standards, the "Viewing as <client>" banner should only appear while you're actually looking at a client-facing view — not over your own system admin tooling. So the "Admin" button in the banner will **end the impersonation session** and return you to `/admin`, making the banner disappear.

## Change
`src/components/org/ImpersonationBanner.tsx`
- Update the "Admin" button handler from `navigate('/admin')` to: call `stopImpersonation()` first, then `navigate('/admin')`. This clears the impersonation state (and its sessionStorage), so the banner unmounts immediately.
- The button keeps its current label/icon; only the behavior changes. (Functionally it becomes "exit to admin," parallel to the existing "Exit" button which goes to `/admin/orgs`.)

## Result / mental model
- Banner visible = you're viewing a client's dashboard.
- No banner = you're yourself (admin or normal browsing).
- Org → org switching stays instant via the banner's org dropdown (unchanged).
- Admin → client re-entry stays one click via the "View dashboard" action on the `/admin/orgs` list (already built).

No backend, schema, or routing changes. Impersonation security/gating is unchanged.
