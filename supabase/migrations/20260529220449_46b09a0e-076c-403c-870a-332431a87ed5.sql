CREATE UNIQUE INDEX IF NOT EXISTS uq_client_api_creds_org_platform
  ON public.client_api_credentials (organization_id, platform);