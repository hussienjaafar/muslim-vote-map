ALTER TABLE public.sms_campaign_metrics
  ADD COLUMN IF NOT EXISTS has_actblue_link boolean NOT NULL DEFAULT true;

DROP FUNCTION IF EXISTS public.sms_broadcast_roi(uuid, date, date);
DROP FUNCTION IF EXISTS public.sms_broadcast_detail(uuid, uuid);

CREATE OR REPLACE FUNCTION public.sms_broadcast_roi(_org_id uuid, _start date, _end date)
 RETURNS TABLE(id uuid, campaign_name text, date date, sent_at timestamp with time zone, refcode text, cost numeric, messages_sent integer, messages_delivered integer, messages_failed integer, opt_outs integer, clicks integer, conversions integer, raised numeric, donations bigint, donors bigint, has_actblue_link boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.campaign_name,
    s.date,
    s.sent_at,
    s.refcode,
    coalesce(s.cost, 0) AS cost,
    coalesce(s.messages_sent, 0) AS messages_sent,
    coalesce(s.messages_delivered, 0) AS messages_delivered,
    coalesce(s.messages_failed, 0) AS messages_failed,
    coalesce(s.opt_outs, 0) AS opt_outs,
    coalesce(s.clicks, 0) AS clicks,
    coalesce(s.conversions, 0) AS conversions,
    coalesce(agg.raised, 0) AS raised,
    coalesce(agg.donations, 0) AS donations,
    coalesce(agg.donors, 0) AS donors,
    coalesce(s.has_actblue_link, true) AS has_actblue_link
  FROM public.sms_campaign_metrics s
  LEFT JOIN LATERAL (
    SELECT
      sum(t.amount) AS raised,
      count(*) AS donations,
      count(DISTINCT t.donor_email) AS donors
    FROM public.actblue_transactions t
    WHERE t.organization_id = _org_id
      AND t.attributed_channel = 'sms'
      AND t.transaction_type = 'donation'
      AND t.attributed_campaign IS NOT NULL
      AND lower(t.attributed_campaign) = lower(s.campaign_name)
  ) agg ON true
  WHERE s.organization_id = _org_id
    AND s.date BETWEEN _start AND _end
    AND coalesce(s.messages_delivered, 0) > 0
    AND public.can_access_organization_data(auth.uid(), _org_id)
  ORDER BY coalesce(agg.raised, 0) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.sms_broadcast_detail(_org_id uuid, _broadcast_id uuid)
 RETURNS TABLE(id uuid, campaign_name text, date date, sent_at timestamp with time zone, refcode text, cost numeric, messages_sent integer, messages_delivered integer, messages_failed integer, opt_outs integer, clicks integer, conversions integer, raised numeric, donations bigint, donors bigint, has_actblue_link boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.campaign_name,
    s.date,
    s.sent_at,
    s.refcode,
    coalesce(s.cost, 0) AS cost,
    coalesce(s.messages_sent, 0) AS messages_sent,
    coalesce(s.messages_delivered, 0) AS messages_delivered,
    coalesce(s.messages_failed, 0) AS messages_failed,
    coalesce(s.opt_outs, 0) AS opt_outs,
    coalesce(s.clicks, 0) AS clicks,
    coalesce(s.conversions, 0) AS conversions,
    coalesce(agg.raised, 0) AS raised,
    coalesce(agg.donations, 0) AS donations,
    coalesce(agg.donors, 0) AS donors,
    coalesce(s.has_actblue_link, true) AS has_actblue_link
  FROM public.sms_campaign_metrics s
  LEFT JOIN LATERAL (
    SELECT
      sum(t.amount) AS raised,
      count(*) AS donations,
      count(DISTINCT t.donor_email) AS donors
    FROM public.actblue_transactions t
    WHERE t.organization_id = _org_id
      AND t.attributed_channel = 'sms'
      AND t.transaction_type = 'donation'
      AND t.attributed_campaign IS NOT NULL
      AND lower(t.attributed_campaign) = lower(s.campaign_name)
  ) agg ON true
  WHERE s.organization_id = _org_id
    AND s.id = _broadcast_id
    AND public.can_access_organization_data(auth.uid(), _org_id);
$function$;