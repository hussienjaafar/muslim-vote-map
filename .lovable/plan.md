## Diagnosis

Mo Maraqa (`mo@molitico.com`, auth user `ecdcb787-47bc-4d0a-a2a5-e6a75d3f8f90`) successfully signed up and confirmed his email at 22:28 UTC, but he doesn't appear in the Users list because:

1. **No `profiles` row exists for him.** The `public.handle_new_user()` function is defined, but the trigger that fires it on `auth.users INSERT` is missing (the schema shows "There are no triggers in the database"). So no signup since the trigger was lost has been backfilled into `profiles`.
2. **`invited_emails.accepted_at` is still NULL** for the same reason.
3. He has no row in `user_roles`, so he isn't an admin.

The admin UI lists users from `profiles`, which is why he's invisible.

## Plan

One migration that does all of the following:

1. **Backfill Mo's profile**
   - `INSERT INTO public.profiles (id, email, full_name) VALUES ('ecdcb787-…', 'mo@molitico.com', 'Mo Maraqa') ON CONFLICT (id) DO NOTHING;`
2. **Mark his invite accepted**
   - `UPDATE public.invited_emails SET accepted_at = now() WHERE email = 'mo@molitico.com' AND accepted_at IS NULL;`
3. **Grant admin role**
   - `INSERT INTO public.user_roles (user_id, role) VALUES ('ecdcb787-…', 'admin') ON CONFLICT DO NOTHING;`
4. **Restore the missing trigger** so future signups auto-create profiles and mark invites accepted:
   ```sql
   CREATE TRIGGER on_auth_user_created
   AFTER INSERT ON auth.users
   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
   ```
   (Also backfill any other auth.users without a profile in the same migration, so we don't have to chase other ghost signups.)

## Out of scope

- No UI changes.
- No edits to the existing `handle_new_user` function body.
- No email re-send.

After the migration, Mo will appear in `/admin/users`, show as an Admin, and can hit `/admin` directly. Future signups will work without manual backfill.