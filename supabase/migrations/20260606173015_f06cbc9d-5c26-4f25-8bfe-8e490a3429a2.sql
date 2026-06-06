-- 1. Lock down access_requests: remove permissive anon policies
DROP POLICY IF EXISTS "Anyone can check status by token" ON public.access_requests;
DROP POLICY IF EXISTS "Anyone can submit an application" ON public.access_requests;

-- Secure submission via SECURITY DEFINER function (returns only the status token)
CREATE OR REPLACE FUNCTION public.submit_access_request(
  _email text,
  _full_name text,
  _organization text,
  _use_case text,
  _title text DEFAULT NULL,
  _website text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token uuid;
BEGIN
  IF coalesce(trim(_email), '') = '' OR coalesce(trim(_full_name), '') = ''
     OR coalesce(trim(_organization), '') = '' OR coalesce(trim(_use_case), '') = '' THEN
    RAISE EXCEPTION 'Missing required fields';
  END IF;

  INSERT INTO public.access_requests (email, full_name, organization, use_case, title, website)
  VALUES (
    lower(trim(_email)),
    trim(_full_name),
    trim(_organization),
    trim(_use_case),
    nullif(trim(_title), ''),
    nullif(trim(_website), '')
  )
  RETURNING status_token INTO _token;

  RETURN _token;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_access_request(text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_access_request(text, text, text, text, text, text) TO anon, authenticated;

-- 2. Set fixed search_path on validation trigger function
CREATE OR REPLACE FUNCTION public.validate_access_request_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'more_info') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: pending, approved, rejected, more_info', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Email queue helpers: fixed search_path + restrict execution to backend only
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;