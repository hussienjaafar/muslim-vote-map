ALTER TABLE public.sms_campaign_metrics
  ADD COLUMN IF NOT EXISTS link_refcode text;

CREATE OR REPLACE FUNCTION public.assign_sms_refcodes(_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Start from the deterministic refcode extracted from each broadcast's
  -- message link (link_refcode). Date-based guessing only fills the gaps.
  UPDATE public.sms_campaign_metrics
  SET refcode = nullif(lower(trim(link_refcode)), '')
  WHERE organization_id = _org_id;

  WITH rc AS (
    SELECT lower(t.refcode) AS refcode,
           min((t.transaction_date AT TIME ZONE 'America/New_York')::date) AS first_d,
           count(*) AS cnt
    FROM public.actblue_transactions t
    WHERE t.organization_id = _org_id
      AND t.refcode IS NOT NULL
      AND (t.form_name ILIKE '%sms%' OR t.form_name ILIKE '%text%')
    GROUP BY lower(t.refcode)
  ),
  matched AS (
    SELECT j.metric_id, j.refcode,
           row_number() OVER (PARTITION BY j.metric_id ORDER BY j.cnt DESC, j.refcode) AS rn
    FROM (
      SELECT rc.refcode, rc.cnt, b.metric_id
      FROM rc
      CROSS JOIN LATERAL (
        SELECT s.id AS metric_id
        FROM public.sms_campaign_metrics s
        WHERE s.organization_id = _org_id
          AND s.refcode IS NULL
          AND rc.first_d >= s.date
          AND rc.first_d <= s.date + 1
        ORDER BY abs(rc.first_d - s.date) ASC, s.date DESC
        LIMIT 1
      ) b
    ) j
  )
  UPDATE public.sms_campaign_metrics s
  SET refcode = m.refcode
  FROM matched m
  WHERE m.metric_id = s.id AND m.rn = 1 AND s.refcode IS NULL;
END;
$function$;