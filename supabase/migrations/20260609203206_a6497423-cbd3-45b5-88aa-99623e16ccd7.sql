
CREATE OR REPLACE FUNCTION public.org_channel_breakdown(_org_id uuid, _start date, _end date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH access AS (
    SELECT public.can_access_organization_data(auth.uid(), _org_id) AS ok
  ),
  channels AS (
    SELECT
      coalesce(attributed_channel, 'other') AS channel,
      count(*) FILTER (WHERE transaction_type = 'donation') AS donations,
      count(DISTINCT donor_email) FILTER (WHERE transaction_type = 'donation') AS donors,
      coalesce(sum(amount) FILTER (WHERE transaction_type = 'donation'), 0) AS raised,
      coalesce(max(attribution_confidence), null) AS confidence
    FROM public.actblue_transactions t
    WHERE t.organization_id = _org_id
      AND (SELECT ok FROM access)
      AND (t.transaction_date AT TIME ZONE 'America/New_York')::date BETWEEN _start AND _end
    GROUP BY 1
  ),
  meta_spend AS (
    SELECT coalesce(sum(spend), 0) AS spend
    FROM public.meta_ad_metrics
    WHERE organization_id = _org_id
      AND (SELECT ok FROM access)
      AND date BETWEEN _start AND _end
  ),
  sms_spend AS (
    SELECT coalesce(sum(cost), 0) AS cost
    FROM public.sms_campaign_metrics
    WHERE organization_id = _org_id
      AND (SELECT ok FROM access)
      AND date BETWEEN _start AND _end
  )
  SELECT jsonb_build_object(
    'channels', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'channel', channel,
        'donations', donations,
        'donors', donors,
        'raised', raised,
        'confidence', confidence
      ) ORDER BY raised DESC) FROM channels), '[]'::jsonb),
    'meta_spend', (SELECT spend FROM meta_spend),
    'sms_cost', (SELECT cost FROM sms_spend)
  );
$$;

GRANT EXECUTE ON FUNCTION public.org_channel_breakdown(uuid, date, date) TO authenticated, service_role;
