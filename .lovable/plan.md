
# Phase 0 — Molitico → CDS port mapping

No code changes in this phase. This is the inventory and reconciliation document. Approve to move to Phase 1.

## 1. What gets ported (by area)

### Pages (Molitico → CDS route)
| Molitico file | CDS route after port | Notes |
|---|---|---|
| `src/pages/ClientDashboard.tsx` | `/dashboard` | Replaces nothing visible today; CDS has `/home`. `/home` stays in Phase 1–6, evaluated for removal in Phase 7. |
| `src/pages/Integrations.tsx` | `/integrations` | New |
| `src/pages/MetaOAuthCallback.tsx` | `/meta-oauth-callback` | New |
| `src/pages/ClientSettings.tsx` | **skip** | CDS already has `/account` |
| `src/pages/admin/OrganizationDetail.tsx` | `/admin/organizations/:organizationId` | New + `/admin/organizations` list page (new, built in Phase 6) |
| `src/pages/admin/UserDetail.tsx` | merged INTO existing CDS `/admin/users/:userId` | Phase 6 — add Molitico tabs (sessions, login history, location), keep CDS invite/application controls |
| `src/pages/admin/OnboardingV2.tsx` | `/admin/onboarding` | New |
| `src/pages/Admin.tsx`, `Auth.tsx`, `Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `AcceptInvitation.tsx`, `AccessDenied.tsx`, `Unsubscribe.tsx`, `PrivacyPolicy.tsx`, `NotFound.tsx` | **skip** | CDS owns auth + chrome |

### Components (port verbatim, preserve paths)
- `src/components/v3/*` (29 files) — design system the dashboard depends on. Lives at `src/components/v3/` in CDS.
- `src/components/client/*` — all except `OrganizationPicker.tsx` and `OrganizationSelector.tsx` (Phase 1 → `src/components/org/OrgPicker.tsx`) and `AppSidebar.tsx` (sidebar merged into CDS's AdminLayout/ClientLayout, not copied).
- `src/components/dashboard/*` (PerformanceControlsToolbar, DashboardHeader, widgets/, …)
- `src/components/integrations/*` (MetaAuthOptions, MetaOAuthFlow)
- `src/components/portal/*`, `src/components/notifications/*`, `src/components/charts/*`
- `src/components/admin/organization/*`, `src/components/admin/onboarding-cds/*`, `src/components/admin/integrations/*`, `src/components/admin/security/*`, `src/components/admin/PlatformAdminsManager.tsx` — Phase 6.
- `src/contexts/ImpersonationContext.tsx`, `src/components/ImpersonationBanner.tsx`, `RoleSwitcher` — Phase 6.

### Hooks (port to `src/hooks/`)
Port: `useClientOrganization`, `useUserRoles`, `useDashboardMetricsV2`, `useActBlueMetrics`, `useIntegrationHealth`, `useIsAdmin`, `usePIIAccess`, `useActivityTracker`, `useAnomalyDetection`, `useAutoRefreshOnSync`, `useBackfillStatus`, `useChannelSummaries`, `useClientDashboardHealth`, `useClientOnboardingSummary`, `useDataFreshness`, `useDebounce(d)`, `useFilterOptions`, `useHourlyMetrics`, `useInactivityReset`, `useIntegrationSummary`, `useIntersectionObserver`, `useKeyboardShortcut`, `useLocalStorage`, `useMetaDataFreshness`, `useMetaReconnect`, `useOnboardingTasks`, `useOnboardingWizard`, `useOrgAttributionConfig`, `usePipelineFreshness`, `useRealtimeMetrics(.tsx)`, `useReducedMotion`, `useResponsiveDateFormat`, `useSessionManager`, `useSingleDay*Metrics`, `useSmartRefresh`, `useSwipeGesture`.
**Skip duplicates** — CDS keeps its own `use-toast`, `use-mobile`, `useAuth`.

### Edge functions (Phase 3)
Port these 40 functions verbatim, deploy in one batch:
`actblue-webhook, backfill-actblue-conversions, backfill-actblue-csv-orchestrator, process-actblue-chunk, reconcile-actblue-data, refcode-reconcile, clickid-reconcile, auto-match-attribution, match-touchpoints-to-donors, calculate-attribution, calculate-attribution-models, calculate-roi, probabilistic-attribution, run-attribution-backfill, backfill-click-attribution, backfill-daily-metrics, monitor-attribution-health, check-data-freshness, check-integration-health, detect-spikes, meta-oauth-init, meta-oauth-callback, meta-save-connection, meta-list-assets, admin-sync-meta, backfill-meta-ads, refresh-meta-tokens, reprocess-failed-webhooks, recover-stuck-chunks, cancel-backfill, geolocate-ip, get-client-ip, health-check, run-diagnostics, run-scheduled-jobs, ops-alerts, cleanup-sms-events, reconcile-sms-refcodes, backfill-sms-refcodes, db-proxy.`

**Skip (CDS owns or doesn't need):** `auth-email-hook, process-email-queue, request-password-reset, reset-admin-password, reset-client-password, accept-invitation-signup, manage-invitation, handle-email-suppression, handle-email-unsubscribe, create-client-user, batch-create-users, preview-transactional-email, send-admin-invite, send-notification-email, send-spike-alerts, send-transactional-email, send-user-invitation, request-account-deletion, export-user-data, terminate-user-sessions, unlock-account, log-user-activity, smart-alerting, data-retention-cleanup, cleanup-old-cache, ttl-cleanup, update-data-freshness, validate-attribution, validate-switchboard-data, switchboard-*, sync-actblue-csv, sync-meta-*, sync-sms-*, sync-switchboard-sms, tiered-meta-sync, test-integration, backfill-onboarding-state, revoke-admin-role (will port in Phase 6)`.

Some of the "skip" list (switchboard-*, sync-meta-*, smart-alerting, etc.) are not explicitly excluded by the brief — they implement SMS/Meta sync. **Open question A**: do you want these too, or is SMS/Meta sync triggered only by webhooks + scheduled `admin-sync-meta`? I'll default to **skip** unless you say otherwise; we can add them in a Phase 3 follow-up.

## 2. CDS routes that change
| Route | Before | After (end of port) |
|---|---|---|
| `/` | Index marketing page | unchanged in Phase 1–6; Phase 7: if signed in + member of org → redirect to `/dashboard` |
| `/dashboard` | — | new (Phase 4) |
| `/integrations` | — | new (Phase 4) |
| `/meta-oauth-callback` | — | new (Phase 4) |
| `/results` | — | new (Phase 5) |
| `/admin/organizations`, `/admin/organizations/:id` | — | new (Phase 6) |
| `/admin/onboarding` | — | new (Phase 6) |
| `/admin/integrations-health` | — | new (Phase 6) |
| `/admin/pipelines` | — | new (Phase 6) |
| `/admin/users/:userId` | CDS UserDetail | extended with Molitico tabs (Phase 6) |
| `/admin/orders/:orderId` | CDS OrderDetail | gains Attribution + Performance panels (Phase 5) |
| `/home` | CDS Home | unchanged until Phase 7 — ask before removing |

CDS's existing routes (`/map`, `/account`, `/admin`, `/admin/users`, `/admin/orders`, `/admin/products`, `/admin/data`, `/admin/live`, `/login`, `/signup`, `/reset-password`, `/request-access`, `/application-status`) are not removed or rerouted.

## 3. Naming collisions and reconciliation

### Tables that exist in both (CDS wins, additive only)
| Table | CDS columns kept | Molitico-only columns | Action |
|---|---|---|---|
| `profiles` | id, email, full_name, organization, phone, suspended*, has_completed_tour | varies | Add columns only if a ported feature needs them; never replace. |
| `email_send_log` | CDS schema | Molitico variant | **Do not port.** Keep CDS. |
| `email_send_state` | CDS schema | Molitico variant | Keep CDS. |
| `suppressed_emails` | CDS schema | Molitico variant | Keep CDS. |
| `email_unsubscribe_tokens` | CDS schema | Molitico variant | Keep CDS. |
| `user_roles` + `has_role()` | CDS app_role enum (`admin`), SECURITY DEFINER func | Molitico may add `member`/`platform_admin` | Phase 1: extend enum with `member` (and any roles Molitico uses); reuse CDS `has_role`. Never store roles on profiles. |

### Membership model — important divergence
Molitico uses a single-org-per-user table called **`client_users`** (each user belongs to one org via `client_users.organization_id`). You asked for a true many-to-many **`organization_memberships`** with roles owner/admin/member/viewer. **Open question B**: confirm we go with `organization_memberships` (your spec) and treat Molitico's `client_users` as a legacy shape — ported hooks like `useClientOrganization` will be rewritten to read from `organization_memberships` instead of `client_users`. I assume yes.

### New tables (no collisions)
`client_organizations`, `organization_memberships`, `seat_requests`, `seat_change_log`, `organization_profiles`, `organization_quotas`, `organization_meta_settings`, `org_activity_log`, `org_onboarding_state` — plus all Phase 2 fundraising tables (actblue_*, meta_*, sms_*, attribution_*, pipeline_*, webhook_*, client_api_credentials, notifications, etc.). All net-new, no collisions.

### Additive columns to existing CDS tables (Phase 1 & 5)
- `data_orders`: + `organization_id uuid`, `refcode text`, `meta_campaign_ids text[]`, `sms_campaign_ids text[]`
- `data_cart_items`: + `organization_id uuid`
- `saved_regions`, `saved_lists`, `access_requests`: + `organization_id uuid` (nullable)

### Helper functions
Port from Molitico verbatim if present: `is_admin`, `can_access_organization_data`, `check_org_membership`, `user_belongs_to_org`, `has_pii_access`. Keep CDS's existing `has_role`.

### Imports / framework
- `ThemeProvider` from Molitico — **skip**, CDS owns theming.
- `supabase` client — Molitico uses `proxyQuery`/`proxyRpc` via `db-proxy` edge function. We port `db-proxy` and `src/lib/supabaseProxy.ts` so ported hooks resolve, but new CDS code keeps using `@/integrations/supabase/client` directly.
- `lazy` + `Suspense` route loading — adopt for the new heavy pages (`/dashboard`, `/integrations`, `/results`).

## 4. Risks called out now
1. `proxyQuery`/`db-proxy` exists because Molitico hit a CORS edge case. Bringing it in adds an indirection layer for ported code. Acceptable, but flagged.
2. Molitico's V3 components are dark-theme tuned. CDS is already dark (surgical-glass #0e0e0e); spot-check tokens in Phase 4.
3. Many ported hooks pull from tables that don't exist yet — Phase 4 cannot start before Phase 2 migration runs.
4. Edge functions referencing email/auth utilities will fail to import — Phase 3 will need small adapter shims (or call CDS's existing `enqueue_email`).

## 5. Two questions before Phase 1
- **A.** Switchboard / `sync-meta-*` / `sync-sms-*` / `smart-alerting` edge functions — port them or skip? (Defaulting to skip.)
- **B.** Confirm `organization_memberships` (many-to-many w/ roles) is the model — Molitico's `client_users` (single org per user) is treated as legacy and not ported.

Reply "continue" (with answers to A/B) and I'll execute Phase 1.
