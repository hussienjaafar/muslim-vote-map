DROP INDEX IF EXISTS data_cart_items_unique_line;

CREATE UNIQUE INDEX IF NOT EXISTS data_cart_items_unique_line
  ON public.data_cart_items (user_id, product_id, geo_type, geo_code, issue_id);