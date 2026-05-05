
-- Issues catalog
CREATE TABLE public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_published boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published issues"
  ON public.issues FOR SELECT
  USING (is_published = true);

CREATE POLICY "Admins can view all issues"
  ON public.issues FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert issues"
  ON public.issues FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update issues"
  ON public.issues FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete issues"
  ON public.issues FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_issues_updated_at
  BEFORE UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- District-level donor stats per issue
CREATE TABLE public.issue_donor_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  cd_code text NOT NULL,
  state_code text NOT NULL,
  district_num integer NOT NULL,
  gold_donors integer NOT NULL DEFAULT 0,
  gold_addresses integer NOT NULL DEFAULT 0,
  gold_cell_phones integer NOT NULL DEFAULT 0,
  silver_donors integer NOT NULL DEFAULT 0,
  silver_addresses integer NOT NULL DEFAULT 0,
  silver_cell_phones integer NOT NULL DEFAULT 0,
  total_donors integer GENERATED ALWAYS AS (gold_donors + silver_donors) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, cd_code)
);

CREATE INDEX idx_issue_donor_districts_issue ON public.issue_donor_districts(issue_id);
CREATE INDEX idx_issue_donor_districts_state ON public.issue_donor_districts(state_code);

ALTER TABLE public.issue_donor_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view districts for published issues"
  ON public.issue_donor_districts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.issues i
    WHERE i.id = issue_donor_districts.issue_id AND i.is_published = true
  ));

CREATE POLICY "Admins can view all donor districts"
  ON public.issue_donor_districts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert donor districts"
  ON public.issue_donor_districts FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update donor districts"
  ON public.issue_donor_districts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete donor districts"
  ON public.issue_donor_districts FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_issue_donor_districts_updated_at
  BEFORE UPDATE ON public.issue_donor_districts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- State-level rollups per issue
CREATE TABLE public.issue_donor_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  state_code text NOT NULL,
  gold_donors integer NOT NULL DEFAULT 0,
  gold_addresses integer NOT NULL DEFAULT 0,
  gold_cell_phones integer NOT NULL DEFAULT 0,
  silver_donors integer NOT NULL DEFAULT 0,
  silver_addresses integer NOT NULL DEFAULT 0,
  silver_cell_phones integer NOT NULL DEFAULT 0,
  total_donors integer GENERATED ALWAYS AS (gold_donors + silver_donors) STORED,
  district_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issue_id, state_code)
);

CREATE INDEX idx_issue_donor_states_issue ON public.issue_donor_states(issue_id);

ALTER TABLE public.issue_donor_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view states for published issues"
  ON public.issue_donor_states FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.issues i
    WHERE i.id = issue_donor_states.issue_id AND i.is_published = true
  ));

CREATE POLICY "Admins can view all donor states"
  ON public.issue_donor_states FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert donor states"
  ON public.issue_donor_states FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update donor states"
  ON public.issue_donor_states FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete donor states"
  ON public.issue_donor_states FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_issue_donor_states_updated_at
  BEFORE UPDATE ON public.issue_donor_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
