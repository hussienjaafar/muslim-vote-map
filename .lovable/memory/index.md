# Memory: index.md
Updated: now

Campaign Data Solutions (CDS) — issue-based donor intelligence platform. Rebrand of the legacy Muslim Voter Project.

## Domain
- Production: campaigndatasolutions.com (planned; not yet wired)
- Email sender: notify.muslimvoterproject.com (deferred rebrand — DNS still on legacy domain)
- Email logo: https://muslimvoterproject.com/logo-icon.png (deferred)

## Product Catalog (issue-scoped, quote-only)
All SKUs use price_per_record = 0 — Request Quote model. No public pricing or subtotals.
- Issue Donors — Gold (source: gold_donors)
- Issue Donors — Silver (source: silver_donors)
- Cell Phones — Gold (source: gold_cell_phones)
- Cell Phones — Silver (source: silver_cell_phones)
- Mailing Addresses — Gold (source: gold_addresses)
- Mailing Addresses — Silver (source: silver_addresses)

## Key Decisions
- Invite-only signup (whitelist in `invited_emails` table)
- Issue Map is the single primary product; legacy Voter Impact Map removed
- `voter_impact_districts/states` retained read-only as election context (winner, margin, turnout) shown in Issue Map sidebar
- Manual fulfillment, admin notified via email + dashboard on quote requests
- Saved regions (bookmarks) + saved lists (cart configs)

## Routes
- `/` → Landing page (public)
- `/login`, `/signup`, `/request-access` → Auth (public)
- `/map` → Issue Map (auth-gated, primary product)
- `/home` → User dashboard (issue-driven)
- `/account` → Profile, quote requests, saved regions
- `/admin/*` → Admin console (admin role)

## Brand & Design
- Brand: Campaign Data Solutions (CDS)
- Tagline: "Issue-based donor intelligence, district by district."
- Surgical-glass dark theme #0e0e0e; teal primary #0ea5c9
- Space Grotesk (display) + Manrope (body)

## Terminology
- NEVER: purchase, download, CSV, "Muslim voter"
- ALWAYS: activate, reach, campaign, audience, quote request
