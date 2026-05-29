-- Idempotent upsert keys for fundraising sync
CREATE UNIQUE INDEX IF NOT EXISTS uq_actblue_tx_org_txid
  ON public.actblue_transactions (organization_id, transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_metrics_org_campaign_date
  ON public.sms_campaign_metrics (organization_id, campaign_id, date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_campaigns_org_campaign
  ON public.meta_campaigns (organization_id, campaign_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_agg_org_date
  ON public.daily_aggregated_metrics (organization_id, date);