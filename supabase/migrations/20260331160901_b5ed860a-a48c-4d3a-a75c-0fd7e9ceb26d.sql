
-- 1. Update handle_new_user to copy organization from access_requests
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, organization)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    (SELECT organization FROM public.access_requests
     WHERE email = NEW.email ORDER BY created_at DESC LIMIT 1)
  );
  UPDATE public.invited_emails
  SET accepted_at = now()
  WHERE email = NEW.email AND accepted_at IS NULL;
  RETURN NEW;
END;
$$;

-- 2. Backfill existing profiles with missing organization
UPDATE public.profiles p
SET organization = ar.organization
FROM public.access_requests ar
WHERE p.email = ar.email
  AND (p.organization IS NULL OR p.organization = '')
  AND ar.organization IS NOT NULL;
