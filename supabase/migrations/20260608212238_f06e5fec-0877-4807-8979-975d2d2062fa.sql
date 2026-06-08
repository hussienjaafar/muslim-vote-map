CREATE TABLE public.meta_ad_hourly_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  campaign_id text NOT NULL,
  date date NOT NULL,
  hour integer NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT meta_ad_hourly_hour_range CHECK (hour >= 0 AND hour <= 23),
  CONSTRAINT meta_ad_hourly_unique UNIQUE (organization_id, campaign_id, date, hour)
);

CREATE INDEX idx_meta_ad_hourly_org_date ON public.meta_ad_hourly_metrics (organization_id, date);

GRANT SELECT ON public.meta_ad_hourly_metrics TO authenticated;
GRANT ALL ON public.meta_ad_hourly_metrics TO service_role;

ALTER TABLE public.meta_ad_hourly_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view hourly ad metrics"
ON public.meta_ad_hourly_metrics
FOR SELECT
TO authenticated
USING (public.can_access_organization_data(auth.uid(), organization_id));

CREATE TRIGGER update_meta_ad_hourly_updated_at
BEFORE UPDATE ON public.meta_ad_hourly_metrics
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.meta_hourly_rollup(_org_id uuid, _day date)
RETURNS TABLE(hour integer, spend numeric, impressions bigint, clicks bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    h.hour,
    coalesce(sum(h.spend), 0) AS spend,
    coalesce(sum(h.impressions), 0)::bigint AS impressions,
    coalesce(sum(h.clicks), 0)::bigint AS clicks
  FROM public.meta_ad_hourly_metrics h
  WHERE h.organization_id = _org_id
    AND h.date = _day
    AND public.can_access_organization_data(auth.uid(), _org_id)
  GROUP BY h.hour
$function$;