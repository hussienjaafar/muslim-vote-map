-- Access request / application system
-- Allows public users to apply for platform access.
-- Admins review, approve (auto-triggers invite), reject, or request more info.

CREATE TABLE public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Applicant info
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  organization TEXT NOT NULL,
  title TEXT,
  website TEXT,
  use_case TEXT NOT NULL,

  -- Review
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'more_info')),
  reviewer_id UUID REFERENCES auth.users(id),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Tracking token for applicant status check
  status_token UUID NOT NULL DEFAULT gen_random_uuid(),

  UNIQUE(email)
);

-- Indexes
CREATE INDEX idx_access_requests_status ON public.access_requests(status);
CREATE INDEX idx_access_requests_token ON public.access_requests(status_token);

-- RLS
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can submit an application
CREATE POLICY "Anyone can submit an application"
  ON public.access_requests FOR INSERT
  WITH CHECK (true);

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON public.access_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update applications (approve/reject/more_info)
CREATE POLICY "Admins can update applications"
  ON public.access_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- RPC: Public status check by token (no auth required)
CREATE OR REPLACE FUNCTION public.check_application_status(check_token UUID)
RETURNS TABLE (
  status TEXT,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT
) SECURITY DEFINER AS $$
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
$$ LANGUAGE sql;
