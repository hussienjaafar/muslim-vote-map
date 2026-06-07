## Goal
Audit every page for responsiveness and fix the concrete gaps so the app works cleanly across phone (≥320px), tablet, and desktop. The codebase already has solid responsive coverage in many areas (UsersList, Orders, Products, Organizations have mobile card variants; the map page has mobile sheets). This plan targets the remaining problem spots and verifies the whole app at multiple viewports.

## Findings (confirmed gaps)

1. **Tables that overflow on mobile** — no horizontal scroll wrapper and no mobile card fallback:
   - `OrganizationDetail.tsx` (members table, line ~210)
   - `ApplicationsList.tsx` (applicants table, line ~282; plus `grid-cols-2` detail row at 357 that stays 2-col on phones)
   - `OrderDetail.tsx` (line items table, line ~254 — parent is `overflow-hidden`, so wide rows get clipped on phone)

2. **Fixed 2-column grids that don't stack on small screens**:
   - `RequestAccess.tsx` (lines 136, 160 — `grid-cols-2` form fields stay cramped on phone)

3. **`min-h-screen` instead of `min-h-dvh`** — on mobile browsers the address bar makes `100vh` taller than the visible area, cutting off centered content:
   - `Login.tsx`, `Signup.tsx`, `RequestAccess.tsx`, `ApplicationStatus.tsx`, `Home.tsx`, `Account.tsx`

4. **Full app QA pass** at 320 / 375 / 768 / 1280 / 1920 px to catch any overflow, clipped controls, or overlapping elements not visible from static reading (especially the Index landing page, the issue map overlays, and admin dashboard widgets).

## Changes

### Tables → mobile-safe
- Wrap each unhandled `<Table>` in a `overflow-x-auto` container so it scrolls horizontally instead of breaking the layout, matching the pattern already used in `UserDetail.tsx` and `DataManagement.tsx`.
- Where a table is the primary content (OrganizationDetail members, ApplicationsList applicants), add a `md:hidden` stacked card list + `hidden md:table` table, mirroring the existing `UsersList.tsx` pattern, so phone users get readable cards rather than a wide scroll.
- Make the ApplicationsList expanded-detail grid responsive: `grid-cols-1 sm:grid-cols-2`.

### Responsive grids
- `RequestAccess.tsx`: change `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` for the two field rows.

### Viewport height
- Replace `min-h-screen` with `min-h-dvh` on the listed auth/content pages so centered cards stay within the visible viewport on mobile.

### Verification
- Use the preview/browser tool to load each route at mobile (375px) and tablet (768px) widths: `/`, `/login`, `/signup`, `/request-access`, `/application-status`, `/home`, `/account`, `/admin`, `/admin/users` (+ applications, invites, a user detail), `/admin/orders` (+ an order detail), `/admin/products`, `/admin/orgs` (+ an org detail), `/admin/data`, `/admin/issue-map`, `/admin/live`.
- Screenshot-check for horizontal overflow, clipped buttons, and overlapping map overlays; fix any additional issues surfaced.

## Technical notes
- Purely presentational (Tailwind class) changes; no business logic, data, or backend changes.
- Reuse existing responsive patterns already in the repo (`hidden md:table` / `md:hidden` card lists, `overflow-x-auto`) for consistency.
- `dvh` is supported by the project's Tailwind v3 setup (`min-h-dvh` utility).
