CREATE OR REPLACE FUNCTION public.recompute_attribution(_org_id uuid, _since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _affected integer;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND public.user_org_role(auth.uid(), _org_id) NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Not authorized to recompute attribution for this organization';
  END IF;

  PERFORM public.assign_sms_refcodes(_org_id);

  UPDATE public.actblue_transactions t
  SET attributed_channel = 'other', attributed_campaign = NULL,
      attribution_method = NULL, attribution_confidence = NULL
  WHERE t.organization_id = _org_id
    AND (_since IS NULL OR t.transaction_date >= _since);

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

  -- SMS Step 1: exact refcode match -> nearest broadcast by date (prefer on/before).
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT 'sms', s.campaign_name
        FROM public.sms_campaign_metrics s
        WHERE s.organization_id = _org_id
          AND s.refcode IS NOT NULL
          AND (
            (t.refcode  IS NOT NULL AND lower(t.refcode)  = lower(s.refcode))
            OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) = lower(s.refcode))
          )
        ORDER BY
          abs((t.transaction_date AT TIME ZONE 'America/New_York')::date - s.date) ASC,
          (s.date <= (t.transaction_date AT TIME ZONE 'America/New_York')::date) DESC
        LIMIT 1
      ),
      attribution_method = 'sms_match',
      attribution_confidence = 'high'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND (t.refcode IS NOT NULL OR t.refcode2 IS NOT NULL)
    AND EXISTS (
      SELECT 1 FROM public.sms_campaign_metrics s
      WHERE s.organization_id = _org_id
        AND s.refcode IS NOT NULL
        AND (
          (t.refcode  IS NOT NULL AND lower(t.refcode)  = lower(s.refcode))
          OR (t.refcode2 IS NOT NULL AND lower(t.refcode2) = lower(s.refcode))
        )
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- SMS Step 2: form-name reference -> nearest SMS broadcast by date.
  -- A donation is SMS when its form_name contains sms/text/txt, or its form is
  -- mapped to the 'sms' channel via org_form_channel_overrides.
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT 'sms', s.campaign_name
        FROM public.sms_campaign_metrics s
        WHERE s.organization_id = _org_id
        ORDER BY
          abs((t.transaction_date AT TIME ZONE 'America/New_York')::date - s.date) ASC,
          (s.date <= (t.transaction_date AT TIME ZONE 'America/New_York')::date) DESC
        LIMIT 1
      ),
      attribution_method = 'sms_match',
      attribution_confidence = 'medium'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND (
      (t.form_name IS NOT NULL AND lower(t.form_name) ~ '(sms|text|txt)')
      OR EXISTS (
        SELECT 1 FROM public.org_form_channel_overrides o
        WHERE o.organization_id = _org_id
          AND o.attributed_channel = 'sms'
          AND t.form_name IS NOT NULL AND o.contribution_form IS NOT NULL
          AND lower(t.form_name) LIKE '%' || lower(o.contribution_form) || '%'
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.sms_campaign_metrics s
      WHERE s.organization_id = _org_id
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

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