# Memory: index.md
Updated: now

# Project Memory

## Core
Brand: Campaign Data Solutions (CDS). Tagline: "Issue-based donor intelligence, district by district."
Primary product: Issue Map at `/map` (issue-scoped donor/activist data per congressional district). The legacy Voter Impact Map is removed; `voter_impact_districts/states` are kept only as read-only election context (winner, margin, turnout) in the Issue Map sidebar.
Surgical-glass dark theme (#0e0e0e). Space Grotesk (headings), Manrope (body). Teal primary (#0ea5c9).
Terminology: NEVER use purchase, download, CSV, or "Muslim voter" framing. ALWAYS use activate, reach, campaign, audience, quote request.
Request Quote model: All public pricing and subtotals must be hidden. SKUs use price_per_record = 0 (quote-only).
Routing: Admins to `/admin`, regular users to `/home`.
Issue Map metric colors: tier-based (gold, silver) per selected issue palette.
Async tasks: Use Supabase Edge Functions and PGMQ for system alerts and emails.
Email sender domain: notify.campaigndata.solutions (DNS verification pending).

## Memories
- [Access Management](mem://features/access-management) — Access vetting flow, status tokens, and bulk approvals
- [Issue Map Data](mem://data/issue-map) — issues, issue_donor_districts/states tables and metric definitions
- [UX Audit](mem://features/ux-audit) — Map color ramps, responsive layout rules, and error states
- [Map Layout](mem://style/map-layout) — Overlay positioning to avoid native control overlap
- [Data Cart](mem://features/data-cart) — Request Quote model, cart grouping, and order processing
- [User Management](mem://admin/user-management) — User sync triggers, suspension, and cascade deletion
- [Design System](mem://style/design-system) — Surgical-glass aesthetic, typography, and token usage
- [Order Management](mem://admin/order-management) — Order fulfillment, cancellation tracking, and totals
- [Activity Tracking](mem://admin/activity-tracking) — Real-time user logs, IP geolocation, and active users
- [User Home Dashboard](mem://features/user-home) — Issue selector, top districts sidebar, recommended districts
- [Performance Optimization](mem://tech/performance-optimization) — Pre-fetching, parallel GeoJSON, and query slimming
- [Invitation Reminders](mem://admin/invitation-reminders) — 3-touch reminder sequence via pg_cron
- [Announcements](mem://features/announcements) — Database-backed notifications with expiration and dismissal
- [Guided Tour](mem://features/guided-tour) — Two-phase onboarding walkthrough with handoff
- [Business Model](mem://project/business-model) — Data Activation constraints and terminology
- [Marketing Integration](mem://tech/marketing-integration) — Meta Pixel + CAPI with Advanced Matching
