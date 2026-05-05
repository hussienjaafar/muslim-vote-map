-- 1. Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- 2. Update handle_new_user to copy email + full_name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  );
  UPDATE public.invited_emails
  SET accepted_at = now()
  WHERE email = NEW.email AND accepted_at IS NULL;
  RETURN NEW;
END;
$$;

-- 3. Backfill existing profiles
UPDATE public.profiles p
SET email = u.email,
    full_name = COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name')
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;