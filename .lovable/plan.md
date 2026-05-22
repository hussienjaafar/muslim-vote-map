
# Phase 1 — Multi-tenant foundation

Goal: CDS gains organizations, memberships, seats, and an active-org context that downstream phases can rely on. Additive only — no destructive changes.

## 1. Schema migration (one atomic migration)

### New tables (all with RLS on)
- `client_organizations` — id, name, slug unique, logo_url, settings jsonb default '{}', created_at, updated_at.
- `organization_memberships` — id, organization_id fk → client_organizations on delete cascade, user_id uuid, role text check in (`'owner','admin','member','viewer'`), created_at, **unique (organization_id, user_id)**.
- `seat_requests` — ported 1:1 from Molitico (organization_id, requested_by, status, notes, created_at, decided_at, decided_by, seats_requested int).
- `seat_change_log` — ported 1:1 (organization_id, changed_by, delta int, reason text, created_at).
- `organization_profiles`, `organization_quotas`, `organization_meta_settings`, `org_activity_log`, `org_onboarding_state` — column shapes copied from Molitico. Skip rows that no ported code touches; final list confirmed when we read Molitico's migrations.

### Additive columns on existing CDS tables
- `data_orders`, `data_cart_items`, `saved_regions`, `saved_lists`, `access_requests`: + `organization_id uuid NULL` (nullable; backfilled below; never required for legacy rows).

### `user_roles` / `has_role`
- CDS's `app_role` enum currently only has `admin`. Extend with `member`. (Owner/admin/viewer live on memberships, not app_role; app_role stays the platform-level admin flag.)
- Keep CDS's existing `has_role(_user_id uuid, _role app_role)` SECURITY DEFINER — already correct.

### New helper functions (SECURITY DEFINER, `SET search_path = public`)
- `user_belongs_to_org(_user_id uuid, _org_id uuid) returns boolean` — exists in organization_memberships.
- `user_org_role(_user_id uuid, _org_id uuid) returns text` — returns membership role or null.
- `can_access_organization_data(_user_id uuid, _org_id uuid) returns boolean` — true if admin OR member of org.

### Triggers
- Reuse `update_updated_at_column()` for `client_organizations` `updated_at`.

### Backfill (in same migration)
For every `profiles` row where `organization` is non-null and non-empty:
1. Upsert one `client_organizations` row (name = profiles.organization, slug = lower kebab-cased name, dedup by name).
2. Insert one `organization_memberships` row (org_id, user_id = profiles.id, role = 'owner') on conflict do nothing.

Then for each table with the new `organization_id` column, backfill: set `organization_id` to the owner's first organization where possible (`data_orders.user_id` → membership). Rows whose user has no org stay NULL.

### RLS policies
**New tables.** Every new table gets:
- Admin all: `using/with check ( has_role(auth.uid(),'admin') )`.
- Member read: `using ( user_belongs_to_org(auth.uid(), organization_id) )`.
- Owner/admin write (on membership-managing tables): `using ( user_org_role(auth.uid(), organization_id) in ('owner','admin') )`.

**Existing tables — additive policies only.** For `data_orders`, `data_cart_items`, `saved_regions`, `saved_lists`:
- Keep existing `auth.uid() = user_id` policies.
- ADD `"Org members can view org rows"` SELECT policy with `( organization_id is not null and user_belongs_to_org(auth.uid(), organization_id) )`.
- ADD matching INSERT/UPDATE/DELETE policies scoped by org so org admins/owners can manage shared records.

`access_requests` keeps current policies; the org column is informational.

## 2. Frontend changes

### New files
- `src/contexts/OrgContext.tsx` — `OrgProvider` + `useOrg()`. Loads memberships via `organization_memberships` join with `client_organizations`. Persists active-org id to `localStorage` key `cds:activeOrgId` and exposes `{ activeOrg, organizations, setActiveOrg, isLoading, isOrgAdmin, isOrgOwner }`. No Molitico `proxyQuery` — use `@/integrations/supabase/client` directly.
- `src/hooks/useClientOrganization.tsx` — thin port adapted to CDS: returns `{ organizationId, isLoading }` reading from `OrgContext` (no impersonation yet — that lands in Phase 6). Keeps the export shape Molitico code expects.
- `src/hooks/useUserRoles.tsx` — port adapted to read from `organization_memberships` instead of `client_users`, returns `{ isAdmin, isClientUser, organizations, hasMultipleRoles, loading, refresh }`.
- `src/components/org/OrgPicker.tsx` — ported from Molitico's `OrganizationPicker.tsx`, retheming CSS vars from `--portal-*` to CDS tokens (`--background`, `--card`, `--border`, `--primary`, etc.).
- `src/components/org/OrgSwitcher.tsx` — small trigger button (current org name + chevron) that opens `OrgPicker`. Hidden when user has 0 or 1 orgs.

### Wired in
- `src/App.tsx`: wrap `<BrowserRouter>` children with `<OrgProvider>` (inside `AuthGuard` so it has a user).
- Header mount: CDS doesn't have a single global header — `AdminLayout` has the admin sidebar, and `/map`, `/home`, `/account` each have their own top bar. Phase 1 mounts `OrgSwitcher` in two places:
  - `src/pages/admin/AdminLayout.tsx` top bar (next to the existing user menu).
  - `src/pages/Home.tsx` top bar.
  Other surfaces gain it in Phase 4 when the new shell lands.
- `src/pages/admin/IssueDonorMap.tsx`: no UI change (Issue Map is org-agnostic per non-negotiable rules). Skipped intentionally.

### Writes scoped to active org
- `src/components/voter-impact/DataCart.tsx` (and any cart insert paths): include `organization_id: activeOrg?.id ?? null` on insert.
- Order creation (Orders flow): same.
- Saved regions / saved lists inserts: same.

If `activeOrg` is null (legacy single-tenant user), inserts pass null and policies still allow because the existing `user_id` policy stays in place.

## 3. What is intentionally not done in Phase 1
- No impersonation (Phase 6 brings ImpersonationContext).
- No seat-request UI — table exists, UI later.
- No new admin pages for orgs — Phase 6.
- No data_orders/cart UI changes besides the hidden `organization_id` field.
- Issue Donor Map untouched.

## 4. Migration ordering / safety
- Single migration file. All `CREATE TABLE` + enum extension + helper functions + RLS first; ALTER TABLE columns next; backfill last so policies are in place before data lands.
- Backfill uses `ON CONFLICT DO NOTHING`. No destructive ops. No DROP/RENAME.
- After migration: run `supabase--linter`, fix anything new it flags.

## 5. Acceptance for Phase 1
- A signed-in user with a profile organization sees one org auto-created and is its owner.
- New users created later via the existing signup flow won't get an org until they're invited to one or one is created for them — that's expected (covered in Phase 6 admin UI).
- `OrgSwitcher` renders for admins (who can see all orgs via RLS admin policy is **not** what we want — admins still see only orgs they're members of in the switcher; cross-org admin browsing is Phase 6).
- CDS preview still loads `/`, `/login`, `/map`, `/home`, `/admin` with no regressions.

Reply "continue" to ship Phase 1.
