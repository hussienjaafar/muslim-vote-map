ALTER TABLE public.data_cart_items
  ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES public.issues(id),
  ADD COLUMN IF NOT EXISTS issue_name text;

ALTER TABLE public.data_order_items
  ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES public.issues(id),
  ADD COLUMN IF NOT EXISTS issue_name text;

ALTER TABLE public.data_cart_items
  DROP CONSTRAINT IF EXISTS data_cart_items_user_id_product_id_geo_type_geo_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS data_cart_items_unique_line
  ON public.data_cart_items (user_id, product_id, geo_type, geo_code, COALESCE(issue_id, '00000000-0000-0000-0000-000000000000'::uuid));