
CREATE TABLE public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  organization TEXT NOT NULL,
  title TEXT,
  website TEXT,
  use_case TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_id UUID,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  status_token UUID NOT NULL DEFAULT gen_random_uuid(),
  UNIQUE(email)
);

CREATE INDEX idx_access_requests_status ON public.access_requests(status);
CREATE INDEX idx_access_requests_token ON public.access_requests(status_token);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_access_request_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected', 'more_info') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of: pending, approved, rejected, more_info', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_access_request_status
  BEFORE INSERT OR UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_access_request_status();

-- Updated_at trigger
CREATE TRIGGER trg_access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an application"
  ON public.access_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all applications"
  ON public.access_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update applications"
  ON public.access_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Public status check needs its own SELECT policy via the function
CREATE POLICY "Anyone can check status by token"
  ON public.access_requests FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION public.check_application_status(check_token UUID)
RETURNS TABLE (
  status TEXT,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT
) LANGUAGE sql SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT
    ar.status,
    ar.email,
    ar.full_name,
    ar.created_at,
    ar.reviewed_at,
    CASE WHEN ar.status = 'more_info' THEN ar.reviewer_notes ELSE NULL END
  FROM public.access_requests ar
  WHERE ar.status_token = check_token
  LIMIT 1;
$$;
