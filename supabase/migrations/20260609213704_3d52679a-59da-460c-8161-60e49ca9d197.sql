ALTER TABLE public.campaign_attribution
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS campaign_attribution_org_pattern_uniq
  ON public.campaign_attribution (organization_id, lower(pattern))
  WHERE pattern IS NOT NULL;