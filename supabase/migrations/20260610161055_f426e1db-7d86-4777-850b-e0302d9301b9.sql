ALTER TABLE public.actblue_transactions ADD COLUMN IF NOT EXISTS refcode2 text;

CREATE OR REPLACE FUNCTION public.recompute_attribution(_org_id uuid, _since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _affected integer;
BEGIN
  -- Authorization: backend jobs (no auth.uid), platform admins, or org owners/admins.
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND public.user_org_role(auth.uid(), _org_id) NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Not authorized to recompute attribution for this organization';
  END IF;

  -- Reset target rows so recompute is idempotent.
  UPDATE public.actblue_transactions t
  SET attributed_channel = 'other', attributed_campaign = NULL,
      attribution_method = NULL, attribution_confidence = NULL
  WHERE t.organization_id = _org_id
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 0: form-channel override (substring match on form name).
  UPDATE public.actblue_transactions t
  SET attributed_channel = o.attributed_channel,
      attribution_method = 'form_override',
      attribution_confidence = 'high'
  FROM public.org_form_channel_overrides o
  WHERE t.organization_id = _org_id AND o.organization_id = _org_id
    AND t.attribution_method IS NULL
    AND t.form_name IS NOT NULL AND o.contribution_form IS NOT NULL
    AND lower(t.form_name) LIKE '%' || lower(o.contribution_form) || '%'
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 1: exact refcode mapping (match on either refcode or refcode2).
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT m.channel, m.campaign_label
        FROM public.campaign_attribution m
        WHERE m.organization_id = _org_id
          AND coalesce(m.match_type,'exact') = 'exact'
          AND m.channel IS NOT NULL
          AND coalesce(m.pattern, m.refcode) IS NOT NULL
          AND (
            (t.refcode  IS NOT NULL AND lower(t.refcode)  = lower(coalesce(m.pattern, m.refcode)))
            OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) = lower(coalesce(m.pattern, m.refcode)))
          )
        ORDER BY m.priority ASC NULLS LAST
        LIMIT 1
      ),
      attribution_method = 'mapping',
      attribution_confidence = 'high'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND (t.refcode IS NOT NULL OR t.refcode2 IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM public.campaign_attribution m
      WHERE m.organization_id = _org_id
        AND coalesce(m.match_type,'exact') = 'exact'
        AND m.channel IS NOT NULL
        AND coalesce(m.pattern, m.refcode) IS NOT NULL
        AND (
          (t.refcode  IS NOT NULL AND lower(t.refcode)  = lower(coalesce(m.pattern, m.refcode)))
          OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) = lower(coalesce(m.pattern, m.refcode)))
        )
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 2: prefix/contains pattern mapping (match on either refcode or refcode2).
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT m.channel, m.campaign_label
        FROM public.campaign_attribution m
        WHERE m.organization_id = _org_id
          AND m.match_type IN ('prefix','contains')
          AND m.channel IS NOT NULL AND m.pattern IS NOT NULL
          AND (
            (m.match_type = 'prefix' AND (
              (t.refcode  IS NOT NULL AND lower(t.refcode)  LIKE lower(m.pattern) || '%')
              OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) LIKE lower(m.pattern) || '%')
            ))
            OR (m.match_type = 'contains' AND (
              (t.refcode  IS NOT NULL AND lower(t.refcode)  LIKE '%' || lower(m.pattern) || '%')
              OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) LIKE '%' || lower(m.pattern) || '%')
            ))
          )
        ORDER BY m.priority ASC NULLS LAST
        LIMIT 1
      ),
      attribution_method = 'pattern_mapping',
      attribution_confidence = 'medium'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND (t.refcode IS NOT NULL OR t.refcode2 IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM public.campaign_attribution m
      WHERE m.organization_id = _org_id
        AND m.match_type IN ('prefix','contains')
        AND m.channel IS NOT NULL AND m.pattern IS NOT NULL
        AND (
          (m.match_type = 'prefix' AND (
            (t.refcode  IS NOT NULL AND lower(t.refcode)  LIKE lower(m.pattern) || '%')
            OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) LIKE lower(m.pattern) || '%')
          ))
          OR (m.match_type = 'contains' AND (
            (t.refcode  IS NOT NULL AND lower(t.refcode)  LIKE '%' || lower(m.pattern) || '%')
            OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) LIKE '%' || lower(m.pattern) || '%')
          ))
        )
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 3: SMS campaign match. Refcode contains campaign id, or form contains
  -- campaign name. When several campaigns match, pick the one whose send date is
  -- closest to the donation date (proximity tiebreaker, Molitico-style).
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT 'sms', s.campaign_name
        FROM public.sms_campaign_metrics s
        WHERE s.organization_id = _org_id
          AND (
            (t.refcode IS NOT NULL AND s.campaign_id IS NOT NULL
              AND lower(t.refcode) LIKE '%' || lower(s.campaign_id) || '%')
            OR (t.refcode2 IS NOT NULL AND s.campaign_id IS NOT NULL
              AND lower(t.refcode2) LIKE '%' || lower(s.campaign_id) || '%')
            OR (t.form_name IS NOT NULL AND s.campaign_name IS NOT NULL
              AND lower(t.form_name) LIKE '%' || lower(s.campaign_name) || '%')
          )
        ORDER BY abs(extract(epoch FROM ((t.transaction_date AT TIME ZONE 'America/New_York')::date - s.date))) ASC NULLS LAST
        LIMIT 1
      ),
      attribution_method = 'sms_match',
      attribution_confidence = 'medium'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND EXISTS (
      SELECT 1 FROM public.sms_campaign_metrics s
      WHERE s.organization_id = _org_id
        AND (
          (t.refcode IS NOT NULL AND s.campaign_id IS NOT NULL
            AND lower(t.refcode) LIKE '%' || lower(s.campaign_id) || '%')
          OR (t.refcode2 IS NOT NULL AND s.campaign_id IS NOT NULL
            AND lower(t.refcode2) LIKE '%' || lower(s.campaign_id) || '%')
          OR (t.form_name IS NOT NULL AND s.campaign_name IS NOT NULL
            AND lower(t.form_name) LIKE '%' || lower(s.campaign_name) || '%')
        )
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 4: keyword patterns on refcode + refcode2 + form name.
  UPDATE public.actblue_transactions t
  SET attributed_channel = CASE
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.refcode2,'') || ' ' || coalesce(t.form_name,'')) ~ '(facebook|instagram|\mfb\M|\mig\M|meta)' THEN 'meta'
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.refcode2,'') || ' ' || coalesce(t.form_name,'')) ~ '(sms|text|txt)' THEN 'sms'
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.refcode2,'') || ' ' || coalesce(t.form_name,'')) ~ '(email|newsletter|\mem\M)' THEN 'email'
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.refcode2,'') || ' ' || coalesce(t.form_name,'')) ~ '(organic|direct)' THEN 'organic'
        ELSE 'other'
      END,
      attribution_method = 'keyword',
      attribution_confidence = 'low'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND lower(coalesce(t.refcode,'') || ' ' || coalesce(t.refcode2,'') || ' ' || coalesce(t.form_name,'')) ~ '(facebook|instagram|\mfb\M|\mig\M|meta|sms|text|txt|email|newsletter|\mem\M|organic|direct)'
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Remainder: explicitly mark as none/other.
  UPDATE public.actblue_transactions t
  SET attributed_channel = 'other',
      attribution_method = 'none',
      attribution_confidence = 'low'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND (_since IS NULL OR t.transaction_date >= _since);

  GET DIAGNOSTICS _affected = ROW_COUNT;

  RETURN jsonb_build_object('organization_id', _org_id, 'recomputed_at', now());
END;
$function$;