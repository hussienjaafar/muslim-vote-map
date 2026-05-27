
-- =========================================================
-- Phase 2 — Fundraising data schema (org-scoped)
-- =========================================================

-- ---- API credentials (sensitive — owner/admin + service role only) ----
CREATE TABLE public.client_api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta','switchboard','actblue')),
  encrypted_credentials jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_api_credentials TO authenticated;
GRANT ALL ON public.client_api_credentials TO service_role;
ALTER TABLE public.client_api_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage api credentials"
  ON public.client_api_credentials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org owners/admins manage api credentials"
  ON public.client_api_credentials FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

CREATE TRIGGER trg_client_api_credentials_updated_at
  BEFORE UPDATE ON public.client_api_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Meta Ads campaigns ----
CREATE TABLE public.meta_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  campaign_name text,
  status text,
  objective text,
  daily_budget numeric(12,2),
  lifetime_budget numeric(12,2),
  start_date date,
  end_date date,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_campaigns TO authenticated;
GRANT ALL ON public.meta_campaigns TO service_role;
ALTER TABLE public.meta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage meta campaigns"
  ON public.meta_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org members view meta campaigns"
  ON public.meta_campaigns FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
CREATE POLICY "Org owners/admins manage meta campaigns"
  ON public.meta_campaigns FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- ---- Meta Ads daily metrics ----
CREATE TABLE public.meta_ad_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  ad_set_id text,
  ad_id text,
  date date NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  spend numeric(12,2) NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  cpc numeric(12,4),
  cpm numeric(12,4),
  ctr numeric(12,4),
  conversions integer NOT NULL DEFAULT 0,
  conversion_value numeric(12,2) NOT NULL DEFAULT 0,
  roas numeric(12,4),
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX meta_ad_metrics_unique
  ON public.meta_ad_metrics (organization_id, campaign_id, COALESCE(ad_set_id,''), COALESCE(ad_id,''), date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_metrics TO authenticated;
GRANT ALL ON public.meta_ad_metrics TO service_role;
ALTER TABLE public.meta_ad_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage meta ad metrics"
  ON public.meta_ad_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org members view meta ad metrics"
  ON public.meta_ad_metrics FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
CREATE POLICY "Org owners/admins manage meta ad metrics"
  ON public.meta_ad_metrics FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- ---- SMS (Switchboard) campaign metrics ----
CREATE TABLE public.sms_campaign_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  campaign_name text,
  date date NOT NULL,
  messages_sent integer NOT NULL DEFAULT 0,
  messages_delivered integer NOT NULL DEFAULT 0,
  messages_failed integer NOT NULL DEFAULT 0,
  opt_outs integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  amount_raised numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, campaign_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_campaign_metrics TO authenticated;
GRANT ALL ON public.sms_campaign_metrics TO service_role;
ALTER TABLE public.sms_campaign_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage sms metrics"
  ON public.sms_campaign_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org members view sms metrics"
  ON public.sms_campaign_metrics FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
CREATE POLICY "Org owners/admins manage sms metrics"
  ON public.sms_campaign_metrics FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- ---- ActBlue transactions ----
CREATE TABLE public.actblue_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  transaction_id text NOT NULL,
  donor_email text,
  donor_name text,
  amount numeric(12,2) NOT NULL,
  refcode text,
  source_campaign text,
  transaction_type text NOT NULL DEFAULT 'donation' CHECK (transaction_type IN ('donation','refund','cancellation')),
  is_recurring boolean NOT NULL DEFAULT false,
  transaction_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transaction_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actblue_transactions TO authenticated;
GRANT ALL ON public.actblue_transactions TO service_role;
ALTER TABLE public.actblue_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage actblue transactions"
  ON public.actblue_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org members view actblue transactions"
  ON public.actblue_transactions FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
CREATE POLICY "Org owners/admins manage actblue transactions"
  ON public.actblue_transactions FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- ---- Daily aggregated metrics (roll-up) ----
CREATE TABLE public.daily_aggregated_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_ad_spend numeric(12,2) NOT NULL DEFAULT 0,
  total_sms_cost numeric(12,2) NOT NULL DEFAULT 0,
  total_funds_raised numeric(12,2) NOT NULL DEFAULT 0,
  total_donations integer NOT NULL DEFAULT 0,
  new_donors integer NOT NULL DEFAULT 0,
  roi_percentage numeric(12,2),
  meta_impressions integer NOT NULL DEFAULT 0,
  meta_clicks integer NOT NULL DEFAULT 0,
  sms_sent integer NOT NULL DEFAULT 0,
  sms_conversions integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_aggregated_metrics TO authenticated;
GRANT ALL ON public.daily_aggregated_metrics TO service_role;
ALTER TABLE public.daily_aggregated_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage daily aggregated metrics"
  ON public.daily_aggregated_metrics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org members view daily aggregated metrics"
  ON public.daily_aggregated_metrics FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
CREATE POLICY "Org owners/admins manage daily aggregated metrics"
  ON public.daily_aggregated_metrics FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- ---- Campaign attribution ----
CREATE TABLE public.campaign_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  refcode text,
  meta_campaign_id text,
  switchboard_campaign_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_attribution TO authenticated;
GRANT ALL ON public.campaign_attribution TO service_role;
ALTER TABLE public.campaign_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage campaign attribution"
  ON public.campaign_attribution FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Org members view campaign attribution"
  ON public.campaign_attribution FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(auth.uid(), organization_id));
CREATE POLICY "Org owners/admins manage campaign attribution"
  ON public.campaign_attribution FOR ALL TO authenticated
  USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
  WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- ---- Indexes ----
CREATE INDEX idx_meta_campaigns_org ON public.meta_campaigns(organization_id);
CREATE INDEX idx_meta_metrics_org_date ON public.meta_ad_metrics(organization_id, date DESC);
CREATE INDEX idx_meta_metrics_campaign ON public.meta_ad_metrics(campaign_id, date DESC);
CREATE INDEX idx_sms_metrics_org_date ON public.sms_campaign_metrics(organization_id, date DESC);
CREATE INDEX idx_actblue_org_date ON public.actblue_transactions(organization_id, transaction_date DESC);
CREATE INDEX idx_actblue_refcode ON public.actblue_transactions(refcode);
CREATE INDEX idx_aggregated_org_date ON public.daily_aggregated_metrics(organization_id, date DESC);
CREATE INDEX idx_attribution_org ON public.campaign_attribution(organization_id);
