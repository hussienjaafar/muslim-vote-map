ALTER TABLE public.sms_campaign_metrics ADD COLUMN IF NOT EXISTS sent_at timestamptz;

DROP FUNCTION IF EXISTS public.sms_broadcast_roi(uuid, date, date);

CREATE FUNCTION public.sms_broadcast_roi(_org_id uuid, _start date, _end date)
 RETURNS TABLE(
   id uuid,
   campaign_name text,
   date date,
   sent_at timestamptz,
   refcode text,
   cost numeric,
   messages_sent integer,
   messages_delivered integer,
   messages_failed integer,
   opt_outs integer,
   clicks integer,
   conversions integer,
   raised numeric,
   donations bigint,
   donors bigint
 )
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
    coalesce(agg.donors, 0) AS donors
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
 RETURNS TABLE(
   id uuid,
   campaign_name text,
   date date,
   sent_at timestamptz,
   refcode text,
   cost numeric,
   messages_sent integer,
   messages_delivered integer,
   messages_failed integer,
   opt_outs integer,
   clicks integer,
   conversions integer,
   raised numeric,
   donations bigint,
   donors bigint
 )
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
    coalesce(agg.donors, 0) AS donors
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

CREATE OR REPLACE FUNCTION public.sms_broadcast_donations(_org_id uuid, _broadcast_id uuid)
 RETURNS TABLE(
   id uuid,
   donor_name text,
   amount numeric,
   is_recurring boolean,
   transaction_date timestamptz,
   refcode text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.donor_name,
    t.amount,
    t.is_recurring,
    t.transaction_date,
    t.refcode
  FROM public.actblue_transactions t
  JOIN public.sms_campaign_metrics s
    ON s.id = _broadcast_id
   AND s.organization_id = _org_id
   AND lower(t.attributed_campaign) = lower(s.campaign_name)
  WHERE t.organization_id = _org_id
    AND t.attributed_channel = 'sms'
    AND t.transaction_type = 'donation'
    AND t.attributed_campaign IS NOT NULL
    AND public.can_access_organization_data(auth.uid(), _org_id)
  ORDER BY t.transaction_date DESC
  LIMIT 500;
$function$;

GRANT EXECUTE ON FUNCTION public.sms_broadcast_roi(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sms_broadcast_detail(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sms_broadcast_donations(uuid, uuid) TO authenticated, service_role;