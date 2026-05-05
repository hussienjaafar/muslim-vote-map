
-- Create voter_impact_states table
CREATE TABLE public.voter_impact_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state_code TEXT UNIQUE NOT NULL,
  state_name TEXT NOT NULL,
  muslim_voters INTEGER NOT NULL DEFAULT 0,
  households INTEGER DEFAULT 0,
  cell_phones INTEGER DEFAULT 0,
  registered INTEGER DEFAULT 0,
  registered_pct NUMERIC DEFAULT 0,
  vote_2024 INTEGER DEFAULT 0,
  vote_2024_pct NUMERIC DEFAULT 0,
  vote_2022 INTEGER DEFAULT 0,
  vote_2022_pct NUMERIC DEFAULT 0,
  political_donors INTEGER DEFAULT 0,
  political_activists INTEGER DEFAULT 0
);

ALTER TABLE public.voter_impact_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for states" ON public.voter_impact_states
  FOR SELECT USING (true);

-- Create voter_impact_districts table
CREATE TABLE public.voter_impact_districts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cd_code TEXT UNIQUE NOT NULL,
  state_code TEXT NOT NULL,
  district_num INTEGER NOT NULL,
  winner TEXT,
  winner_party TEXT,
  winner_votes INTEGER,
  runner_up TEXT,
  runner_up_party TEXT,
  runner_up_votes INTEGER,
  margin_votes INTEGER,
  margin_pct NUMERIC,
  total_votes INTEGER,
  muslim_voters INTEGER NOT NULL DEFAULT 0,
  muslim_registered INTEGER DEFAULT 0,
  muslim_unregistered INTEGER DEFAULT 0,
  voted_2024 INTEGER DEFAULT 0,
  didnt_vote_2024 INTEGER DEFAULT 0,
  turnout_pct NUMERIC DEFAULT 0,
  can_impact BOOLEAN DEFAULT false,
  votes_needed INTEGER,
  cost_estimate NUMERIC,
  cell_phones INTEGER DEFAULT 0,
  households INTEGER DEFAULT 0
);

ALTER TABLE public.voter_impact_districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for districts" ON public.voter_impact_districts
  FOR SELECT USING (true);

-- Create data_products table
CREATE TABLE public.data_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  product_type TEXT NOT NULL,
  active BOOLEAN DEFAULT true
);

ALTER TABLE public.data_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for data products" ON public.data_products
  FOR SELECT USING (true);

-- Create data_cart_items table
CREATE TABLE public.data_cart_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.data_products(id) ON DELETE CASCADE,
  geo_type TEXT NOT NULL,
  geo_code TEXT NOT NULL,
  geo_label TEXT,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, product_id, geo_type, geo_code)
);

ALTER TABLE public.data_cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cart items" ON public.data_cart_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cart items" ON public.data_cart_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cart items" ON public.data_cart_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cart items" ON public.data_cart_items
  FOR DELETE USING (auth.uid() = user_id);

-- Create user_roles table for admin access
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Admin policies for data management
CREATE POLICY "Admins can insert states" ON public.voter_impact_states
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update states" ON public.voter_impact_states
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert districts" ON public.voter_impact_districts
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update districts" ON public.voter_impact_districts
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage products" ON public.data_products
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
