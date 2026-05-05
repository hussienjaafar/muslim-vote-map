DROP POLICY IF EXISTS "Users can check their own invite" ON public.invited_emails;

CREATE POLICY "Users can check their own invite"
  ON public.invited_emails
  FOR SELECT
  TO authenticated
  USING (email = lower(trim((auth.email())::text)));