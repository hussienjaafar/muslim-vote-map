ALTER TABLE public.meta_ad_metrics
  ADD CONSTRAINT meta_ad_metrics_org_campaign_date_key
  UNIQUE (organization_id, campaign_id, date);