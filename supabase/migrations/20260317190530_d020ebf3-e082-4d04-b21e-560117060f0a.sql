
-- ============================================================
-- Phase 1: Database Schema Migration
-- ============================================================

-- 1. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  organization TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  
  -- Mark invite as accepted
  UPDATE public.invited_emails
  SET accepted_at = now()
  WHERE email = NEW.email AND accepted_at IS NULL;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger for profiles
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. INVITED_EMAILS TABLE
CREATE TABLE public.invited_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

ALTER TABLE public.invited_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invites"
  ON public.invited_emails FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can check their own invite"
  ON public.invited_emails FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Function to check invite status (for use in app, avoids direct auth.users query)
CREATE OR REPLACE FUNCTION public.is_invited(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invited_emails
    WHERE email = lower(trim(check_email))
  );
$$;

-- 3. SAVED_REGIONS TABLE
CREATE TABLE public.saved_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region_type TEXT NOT NULL CHECK (region_type IN ('state', 'district')),
  region_code TEXT NOT NULL,
  region_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, region_type, region_code)
);

ALTER TABLE public.saved_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved regions"
  ON public.saved_regions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. SAVED_LISTS TABLE
CREATE TABLE public.saved_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved lists"
  ON public.saved_lists FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. ALTER data_products: add data_fields column
ALTER TABLE public.data_products
  ADD COLUMN IF NOT EXISTS data_fields TEXT[] DEFAULT '{}';

-- 6. ALTER data_orders: add Stripe + fulfillment columns
ALTER TABLE public.data_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_email TEXT;

-- Admin policy for orders (view all, update status)
CREATE POLICY "Admins can view all orders"
  ON public.data_orders FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update orders"
  ON public.data_orders FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin policy for order items
CREATE POLICY "Admins can view all order items"
  ON public.data_order_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert order items"
  ON public.data_order_items FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow authenticated users to insert order items for their own orders
CREATE POLICY "Users can insert their own order items"
  ON public.data_order_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM data_orders
    WHERE data_orders.id = order_id AND data_orders.user_id = auth.uid()
  ));

-- 7. Add donor tier columns to voter_impact_states
ALTER TABLE public.voter_impact_states
  ADD COLUMN IF NOT EXISTS donor_platinum_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donor_gold_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donor_silver_count INTEGER DEFAULT 0;

-- 8. Add donor tier columns to voter_impact_districts
ALTER TABLE public.voter_impact_districts
  ADD COLUMN IF NOT EXISTS donor_platinum_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donor_gold_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS donor_silver_count INTEGER DEFAULT 0;

-- 9. Add unique constraint on data_cart_items for upsert support
-- First check if it exists, use DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_cart_items_user_product_geo_unique'
  ) THEN
    ALTER TABLE public.data_cart_items
      ADD CONSTRAINT data_cart_items_user_product_geo_unique
      UNIQUE (user_id, product_id, geo_type, geo_code);
  END IF;
END $$;
