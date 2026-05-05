
-- 1. Let users read their own activity log
CREATE POLICY "Users can view own activity"
  ON public.user_activity_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. RPC for toggling email suppression
CREATE OR REPLACE FUNCTION public.toggle_email_suppression(suppress boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF suppress THEN
    INSERT INTO suppressed_emails (email, reason)
    VALUES (auth.email(), 'user_opt_out')
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM suppressed_emails WHERE email = auth.email();
  END IF;
END;
$$;

-- 3. RPC to check own suppression status
CREATE OR REPLACE FUNCTION public.is_email_suppressed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM suppressed_emails WHERE email = auth.email()
  );
$$;

-- 4. Self-delete account RPC
CREATE OR REPLACE FUNCTION public.self_delete_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  DELETE FROM public.invited_emails WHERE email = (
    SELECT email FROM auth.users WHERE id = auth.uid()
  );
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
