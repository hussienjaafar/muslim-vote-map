ALTER TABLE public.meta_ad_metrics REPLICA IDENTITY FULL;
ALTER TABLE public.sms_campaign_metrics REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_ad_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_campaign_metrics;