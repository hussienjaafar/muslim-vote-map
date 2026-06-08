CREATE TABLE public.actblue_csv_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  csv_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  since_days INTEGER NOT NULL DEFAULT 30,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_actblue_csv_jobs_status ON public.actblue_csv_jobs (status);
CREATE INDEX idx_actblue_csv_jobs_org ON public.actblue_csv_jobs (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actblue_csv_jobs TO authenticated;
GRANT ALL ON public.actblue_csv_jobs TO service_role;

ALTER TABLE public.actblue_csv_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members and admins can view actblue jobs"
  ON public.actblue_csv_jobs FOR SELECT
  TO authenticated
  USING (public.can_access_organization_data(auth.uid(), organization_id));

CREATE TRIGGER update_actblue_csv_jobs_updated_at
  BEFORE UPDATE ON public.actblue_csv_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();