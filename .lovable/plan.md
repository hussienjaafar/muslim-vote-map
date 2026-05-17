## Issue

The auth-email-hook (password reset, magic link, etc.) was rebranded to `notify.campaigndata.solutions`, but the **invite + admin notification + invite-reminder** flows were missed. They still send from `noreply@notify.muslimvoterproject.com`, link to `https://muslimvoterproject.com/signup?...`, and embed a logo from `https://muslimvoterproject.com/logo-icon.png`. That's the MVP branding the user is seeing in invite emails.

A few shared `_shared/email-templates/*.tsx` files (signup, magic-link, invite, email-change, reauthentication) also still reference the MVP logo URL, though most aren't actively sent (recovery.tsx was already updated). Cleaning them up keeps the codebase consistent.

## Files to update

**Active senders (must change — these are what the user sees):**
1. `supabase/functions/send-invite-email/index.ts`
   - `SITE_URL` default → `https://campaigndata.solutions`
   - Logo `<img src>` → `https://campaigndata.solutions/logo-icon.png`
   - `from` → `Campaign Data Solutions <noreply@notify.campaigndata.solutions>`
   - `sender_domain` → `notify.campaigndata.solutions`
2. `supabase/functions/notify-admins/index.ts` — same four changes (two `from`/`sender_domain` blocks)
3. `supabase/functions/process-invite-reminders/index.ts` — same four changes
4. `supabase/functions/auth-email-hook/index.ts` — update `SAMPLE_PROJECT_URL` constant for consistency

**Shared templates (cosmetic — update logo URL only):**
5. `_shared/email-templates/signup.tsx`
6. `_shared/email-templates/magic-link.tsx`
7. `_shared/email-templates/invite.tsx`
8. `_shared/email-templates/email-change.tsx`
9. `_shared/email-templates/reauthentication.tsx`

## Deploy

Redeploy: `send-invite-email`, `notify-admins`, `process-invite-reminders`, `auth-email-hook`.

## Verify

Re-send a test invite from the admin panel and confirm the From address, logo, and signup link all show `campaigndata.solutions`.

## Out of scope

- `public/robots.txt` sitemap line (separate concern — points to `campaigndatasolutions.com` without dot, may also be wrong but not invite-related).
- No DB or RLS changes.
