# Password recovery — unblock + permanent fix

## Part A — Immediate unblock (one-shot)

Goal: get `hussein@molitico.com` a working recovery link without going through email (where scanners are pre-consuming the token).

1. Create a temporary edge function `admin-generate-recovery-link`:
   - Uses `SUPABASE_SERVICE_ROLE_KEY` (already in secrets).
   - Requires header `x-admin-secret` matching a new secret `ADMIN_TOOLS_SECRET` (one-shot, deleted after use).
   - Accepts `{ email }`, calls `supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://campaigndata.solutions/reset-password' } })`.
   - Returns `{ action_link }`.
2. Deploy it, invoke once for `hussein@molitico.com`, post the link in chat for a single click.
3. Delete the function and `ADMIN_TOOLS_SECRET` immediately after success.

## Part B — Permanent fix: OTP-code recovery (no clickable link to prefetch)

Replace the link-only recovery with a 6-digit OTP code so email scanners can't consume the token.

### 1. Email template
- File: `supabase/functions/_shared/email-templates/recovery.tsx`
- Show `{token}` prominently (large monospace 6-digit code).
- Keep the link as a small secondary fallback ("or click here").
- Subject stays "Reset your password".

### 2. Auth hook
- File: `supabase/functions/auth-email-hook/index.ts`
- Pass `token: payload.data.token` into `RecoveryEmail` props (already wired).
- Redeploy `auth-email-hook`.

### 3. Reset password UX
- `src/pages/Login.tsx` (Forgot flow):
  - After `resetPasswordForEmail`, navigate to `/reset-password?email=<email>` with toast "Check your email for a 6-digit code".
- `src/pages/Account.tsx`: same redirect after self-initiated reset.
- `src/pages/ResetPassword.tsx` rewrite:
  - Read `?email=` from query.
  - Step 1: input 6-digit code → `supabase.auth.verifyOtp({ email, token, type: 'recovery' })`.
  - Step 2 (after verifyOtp success → user is now authenticated): show new-password form → `supabase.auth.updateUser({ password })`.
  - Keep legacy hash-based path (`type=recovery` in hash) working as a fallback for any in-flight email links.

### 4. Auth settings
- Bump recovery OTP TTL from 1h → 24h via `configure_auth` (defense in depth).

## Technical notes

- `auth.admin.generateLink` with `type: 'recovery'` returns a single-use link that bypasses email — same token mechanism, just delivered through the agent.
- OTP codes from Supabase are 6 digits, valid for the recovery TTL, single-use, and not consumable by URL prefetchers.
- `verifyOtp({ type: 'recovery' })` establishes a session, after which `updateUser({ password })` works exactly like today.
- No DB schema changes.

## Files touched
- New (temporary): `supabase/functions/admin-generate-recovery-link/index.ts`
- `supabase/functions/_shared/email-templates/recovery.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/Login.tsx`
- `src/pages/Account.tsx`

## Out of scope
- Migrating signup / magic-link / email-change to OTP (only recovery is broken).
- Domain/branding changes.
