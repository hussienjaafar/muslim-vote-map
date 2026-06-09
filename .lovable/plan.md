# Combine the user + org dashboards into one tabbed page

## Goal
Users who are both data users and members of a signed-up org should see a single page with two tabs:
- **Fundraising** — the current org dashboard (Meta ads + ActBlue metrics)
- **Data & Issues** — the current `/home` data dashboard (issues, districts, orders, map)

Org members land on **Fundraising** by default. Users with no org never see the Fundraising tab or any org sections — they see only the Data & Issues content (unchanged from today).

## Behavior

```text
 Login (non-admin)
        |
        v
   /home  (combined shell)
   ┌───────────────────────────────────────────┐
   │  Header: logo · [Fundraising][Data&Issues] │  <- tabs only show Fundraising if hasOrg
   │          OrgSwitcher · account menu        │
   ├───────────────────────────────────────────┤
   │  active tab content                         │
   └───────────────────────────────────────────┘

 hasOrg === true   -> default tab = Fundraising
 hasOrg === false  -> no Fundraising tab; render Data & Issues only (no tab bar)
```

## Plan

1. **Create a combined shell page** (`src/pages/Workspace.tsx`, mounted at `/home`).
   - Reads `hasOrg` from `useOrg()` (`organizations.length > 0`).
   - Renders one shared header (logo, OrgSwitcher, account dropdown — moved up from the two existing pages so it isn't duplicated).
   - When `hasOrg`: render a tab bar (shadcn `Tabs`) with **Fundraising** (default) and **Data & Issues**; tab state synced to a `?tab=fundraising|data` query param so links/refresh are stable.
   - When `!hasOrg`: render only the Data & Issues body, no tab bar, no Fundraising — identical to today's experience.

2. **Refactor `Home.tsx` into a body component** (`HomeContent`) that renders only the data/issues content (everything below the current header). The header markup (logo, Dashboard button, OrgSwitcher, account menu) moves into the shell. Remove the now-redundant "Dashboard" button.

3. **Refactor `Dashboard.tsx` into a body component** (`FundraisingContent`) that renders only the fundraising content (below its current header). Its header/back-link/OrgSwitcher move into the shell. The recent Refresh-button + Meta-stale layout stays intact inside the body.

4. **Routing (`src/App.tsx`)**
   - `/home` → combined shell (`Workspace`).
   - Keep `/dashboard` working by redirecting it to `/home?tab=fundraising` (preserves existing internal links and bookmarks). The standalone `FundraisingDashboard` route is replaced by the shell.

5. **Login redirect (`Login.tsx`)** — unchanged target `/home`. The shell itself picks the default tab (Fundraising when the user has an org), so org members effectively land on fundraising without special login logic.

6. **Verify**: org member sees both tabs, lands on Fundraising, can switch to Data & Issues; non-org user sees only the data dashboard with no tab bar and no org UI; `/dashboard` and `/account` deep links still resolve.

## Technical notes
- No backend, schema, or query changes — purely a frontend restructure of two existing pages plus routing.
- Both bodies keep their existing hooks (`useOrg`, `useFundraisingSummary`, `useIssueDonorData`, etc.); the fundraising hooks already no-op when `orgId` is null, so mounting is safe.
- Tab state via `useSearchParams` (`?tab=`) keeps refresh/deep-linking predictable and lets `/dashboard` redirect map cleanly to the Fundraising tab.
- Shared header avoids duplicate OrgSwitcher/account menus and keeps a single consistent top bar across tabs.
