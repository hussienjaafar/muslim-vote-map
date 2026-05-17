
-- 1. Restore trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Backfill profiles for any auth users missing one
INSERT INTO public.profiles (id, email, full_name, organization)
SELECT u.id, u.email, u.raw_user_meta_data ->> 'full_name',
  (SELECT organization FROM public.access_requests ar WHERE ar.email = u.email ORDER BY ar.created_at DESC LIMIT 1)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 3. Mark Mo's invite accepted
UPDATE public.invited_emails
SET accepted_at = now()
WHERE email = 'mo@molitico.com' AND accepted_at IS NULL;

-- 4. Grant Mo admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('ecdcb787-47bc-4d0a-a2a5-e6a75d3f8f90', 'admin')
ON CONFLICT DO NOTHING;
