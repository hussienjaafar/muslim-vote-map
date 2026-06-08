CREATE TABLE public.webhook_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'actblue',
  event_type text NOT NULL DEFAULT 'incoming',
  payload jsonb,
  headers jsonb,
  source_ip text,
  user_agent text,
  entity_ids_found text[],
  matched_organization_id uuid,
  processing_status text NOT NULL DEFAULT 'pending',
  response_status integer,
  error_detail text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook deliveries"
ON public.webhook_deliveries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_webhook_deliveries_received_at ON public.webhook_deliveries (received_at DESC);
CREATE INDEX idx_webhook_deliveries_org ON public.webhook_deliveries (matched_organization_id);