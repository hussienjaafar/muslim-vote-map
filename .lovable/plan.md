# Phase status

- **Phase 0** — Mapping doc ✅
- **Phase 1** — Multi-tenant foundation ✅ (orgs, memberships, seats, OrgContext, OrgSwitcher)
- **Phase 2** — Fundraising data schema ✅
- **Phase 3** — Dashboard UI ✅ (client fundraising dashboard at `/dashboard`)
- **Phase 4** — Admin org management UI ✅ (`/admin/orgs` list + detail: members, roles, seats, seat requests)
- **Phase 5** — Sync edge functions (skipped per user — A: skip)
- **Phase 6** — Impersonation + cross-org admin — next

---

# Phase 2 — Fundraising data schema (shipped)

One additive migration created the org-scoped fundraising tables ported from Molitico:

| Table | Purpose |
|---|---|
| `client_api_credentials` | Per-org encrypted ActBlue/Meta/Switchboard creds. Owner/admin + service role only — members cannot read. |
| `meta_campaigns` | Meta Ads campaign metadata (campaign_id unique per org). |
| `meta_ad_metrics` | Daily Meta Ads metrics — spend, impressions, clicks, conversions, ROAS. Uniqueness on (org, campaign, ad_set, ad, date) via UNIQUE INDEX with COALESCE so null ad_set/ad still dedup. |
| `sms_campaign_metrics` | Switchboard SMS daily metrics — sends, deliveries, opt-outs, clicks, conversions, amount raised, cost. |
| `actblue_transactions` | Individual ActBlue donations — donor, amount, refcode, recurring flag. |
| `daily_aggregated_metrics` | Daily roll-up across all sources — ad spend, SMS cost, funds raised, donations, ROI. |
| `campaign_attribution` | UTM ↔ refcode ↔ Meta/Switchboard campaign mappings. |

### Access model (consistent across all tables)
- **Platform admins** — full ALL.
- **Org members** — SELECT via `user_belongs_to_org(auth.uid(), organization_id)`.
- **Org owners/admins** — ALL via `user_org_role(...) IN ('owner','admin')`.
- **Service role** — full ALL (for background syncs in later phase).
- **API credentials exception** — no member SELECT; only owner/admin + service role can read.

### Indexes
Standard org+date DESC indexes on all time-series tables; refcode index on `actblue_transactions`.

### Adapter notes vs. Molitico source
- Replaced Molitico's `client_users` / `get_user_organization_id()` with CDS's `organization_memberships` + `user_belongs_to_org` / `user_org_role`.
- Added explicit `GRANT` statements (required for CDS Cloud).
- `FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()` reused on `client_api_credentials`.
- Did NOT port the `is_client_admin()` function — superseded by `user_org_role`.

### Intentionally not done in Phase 2
- No sync edge functions (Phase 5 — skipped per user direction).
- No dashboard UI (Phase 3).
- No admin org pages (Phase 4).
- No webhook endpoints.
- Issue Donor Map untouched.

Reply "continue" to start **Phase 3 — Fundraising dashboard UI** (client-facing dashboard at `/dashboard` reading the new tables, scoped by `useOrg().activeOrg`).
