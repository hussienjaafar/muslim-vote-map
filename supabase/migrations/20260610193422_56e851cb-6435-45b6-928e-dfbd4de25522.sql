ALTER TABLE public.sms_campaign_metrics
  ADD COLUMN IF NOT EXISTS link_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_target_url text;

-- Existing rows that already have a non-null link_refcode were resolved under the
-- old logic; mark them resolved so we don't re-resolve (and overwrite) them.
UPDATE public.sms_campaign_metrics
  SET link_resolved = true
  WHERE link_refcode IS NOT NULL;