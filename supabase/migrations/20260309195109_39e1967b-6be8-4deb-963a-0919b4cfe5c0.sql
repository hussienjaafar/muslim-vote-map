
-- Add new columns to data_products
ALTER TABLE public.data_products ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE public.data_products ADD COLUMN IF NOT EXISTS source_field text;
ALTER TABLE public.data_products ADD COLUMN IF NOT EXISTS price_per_record numeric DEFAULT 0;
ALTER TABLE public.data_products ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add new columns to data_cart_items
ALTER TABLE public.data_cart_items ADD COLUMN IF NOT EXISTS geo_name text;
ALTER TABLE public.data_cart_items ADD COLUMN IF NOT EXISTS record_count integer DEFAULT 1;

-- Create data_orders table
CREATE TABLE IF NOT EXISTS public.data_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_amount numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders" ON public.data_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own orders" ON public.data_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Create data_order_items table
CREATE TABLE IF NOT EXISTS public.data_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.data_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.data_products(id),
  geo_type text NOT NULL,
  geo_code text NOT NULL,
  geo_name text,
  record_count integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own order items" ON public.data_order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.data_orders WHERE id = order_id AND user_id = auth.uid())
  );

-- Add unique constraint on cart items for upsert
ALTER TABLE public.data_cart_items DROP CONSTRAINT IF EXISTS data_cart_items_user_product_geo_unique;
ALTER TABLE public.data_cart_items ADD CONSTRAINT data_cart_items_user_product_geo_unique 
  UNIQUE (user_id, product_id, geo_type, geo_code);
