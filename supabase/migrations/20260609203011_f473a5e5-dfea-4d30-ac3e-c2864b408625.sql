
-- 1. Attribution columns on transactions
ALTER TABLE public.actblue_transactions
  ADD COLUMN IF NOT EXISTS attributed_channel text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS attributed_campaign text,
  ADD COLUMN IF NOT EXISTS attribution_method text,
  ADD COLUMN IF NOT EXISTS attribution_confidence text;

CREATE INDEX IF NOT EXISTS idx_actblue_tx_attributed_channel
  ON public.actblue_transactions(organization_id, attributed_channel);

-- 2. Extend campaign_attribution into the deterministic mapping store
ALTER TABLE public.campaign_attribution
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS campaign_label text,
  ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS pattern text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

-- 3. Per-form channel overrides (Priority 0)
CREATE TABLE IF NOT EXISTS public.org_form_channel_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  contribution_form text NOT NULL,
  attributed_channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, contribution_form)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_form_channel_overrides TO authenticated;
GRANT ALL ON public.org_form_channel_overrides TO service_role;

ALTER TABLE public.org_form_channel_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view form overrides" ON public.org_form_channel_overrides
  FOR SELECT TO authenticated
  USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org owners/admins manage form overrides" ON public.org_form_channel_overrides
  FOR ALL TO authenticated
  USING (user_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner','admin']))
  WITH CHECK (user_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner','admin']));

CREATE POLICY "Platform admins manage form overrides" ON public.org_form_channel_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_org_form_channel_overrides_updated_at
  BEFORE UPDATE ON public.org_form_channel_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Recompute function (single source of truth for the priority chain)
CREATE OR REPLACE FUNCTION public.recompute_attribution(_org_id uuid, _since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Priority 1: exact refcode mapping.
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT m.channel, m.campaign_label
        FROM public.campaign_attribution m
        WHERE m.organization_id = _org_id
          AND coalesce(m.match_type,'exact') = 'exact'
          AND m.channel IS NOT NULL
          AND coalesce(m.pattern, m.refcode) IS NOT NULL
          AND t.refcode IS NOT NULL
          AND lower(t.refcode) = lower(coalesce(m.pattern, m.refcode))
        ORDER BY m.priority ASC NULLS LAST
        LIMIT 1
      ),
      attribution_method = 'mapping',
      attribution_confidence = 'high'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND t.refcode IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.campaign_attribution m
      WHERE m.organization_id = _org_id
        AND coalesce(m.match_type,'exact') = 'exact'
        AND m.channel IS NOT NULL
        AND coalesce(m.pattern, m.refcode) IS NOT NULL
        AND lower(t.refcode) = lower(coalesce(m.pattern, m.refcode))
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 2: prefix/contains pattern mapping.
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT m.channel, m.campaign_label
        FROM public.campaign_attribution m
        WHERE m.organization_id = _org_id
          AND m.match_type IN ('prefix','contains')
          AND m.channel IS NOT NULL AND m.pattern IS NOT NULL
          AND t.refcode IS NOT NULL
          AND (
            (m.match_type = 'prefix'   AND lower(t.refcode) LIKE lower(m.pattern) || '%')
            OR (m.match_type = 'contains' AND lower(t.refcode) LIKE '%' || lower(m.pattern) || '%')
          )
        ORDER BY m.priority ASC NULLS LAST
        LIMIT 1
      ),
      attribution_method = 'pattern_mapping',
      attribution_confidence = 'medium'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND t.refcode IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.campaign_attribution m
      WHERE m.organization_id = _org_id
        AND m.match_type IN ('prefix','contains')
        AND m.channel IS NOT NULL AND m.pattern IS NOT NULL
        AND (
          (m.match_type = 'prefix'   AND lower(t.refcode) LIKE lower(m.pattern) || '%')
          OR (m.match_type = 'contains' AND lower(t.refcode) LIKE '%' || lower(m.pattern) || '%')
        )
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 3: SMS campaign match (refcode contains campaign id, or form contains campaign name).
  UPDATE public.actblue_transactions t
  SET (attributed_channel, attributed_campaign) = (
        SELECT 'sms', s.campaign_name
        FROM public.sms_campaign_metrics s
        WHERE s.organization_id = _org_id
          AND (
            (t.refcode IS NOT NULL AND s.campaign_id IS NOT NULL
              AND lower(t.refcode) LIKE '%' || lower(s.campaign_id) || '%')
            OR (t.form_name IS NOT NULL AND s.campaign_name IS NOT NULL
              AND lower(t.form_name) LIKE '%' || lower(s.campaign_name) || '%')
          )
        ORDER BY s.date DESC
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
          OR (t.form_name IS NOT NULL AND s.campaign_name IS NOT NULL
            AND lower(t.form_name) LIKE '%' || lower(s.campaign_name) || '%')
        )
    )
    AND (_since IS NULL OR t.transaction_date >= _since);

  -- Priority 4: keyword patterns on refcode + form name.
  UPDATE public.actblue_transactions t
  SET attributed_channel = CASE
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.form_name,'')) ~ '(facebook|instagram|\mfb\M|\mig\M|meta)' THEN 'meta'
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.form_name,'')) ~ '(sms|text|txt)' THEN 'sms'
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.form_name,'')) ~ '(email|newsletter|\mem\M)' THEN 'email'
        WHEN lower(coalesce(t.refcode,'') || ' ' || coalesce(t.form_name,'')) ~ '(organic|direct)' THEN 'organic'
        ELSE 'other'
      END,
      attribution_method = 'keyword',
      attribution_confidence = 'low'
  WHERE t.organization_id = _org_id AND t.attribution_method IS NULL
    AND lower(coalesce(t.refcode,'') || ' ' || coalesce(t.form_name,'')) ~ '(facebook|instagram|\mfb\M|\mig\M|meta|sms|text|txt|email|newsletter|\mem\M|organic|direct)'
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
$$;

GRANT EXECUTE ON FUNCTION public.recompute_attribution(uuid, timestamptz) TO authenticated, service_role;
