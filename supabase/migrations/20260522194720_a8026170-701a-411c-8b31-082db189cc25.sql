
-- =========================================================
-- Phase 1: Multi-tenant foundation
-- =========================================================

-- 1. New tables -------------------------------------------------------------

CREATE TABLE public.client_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  seat_limit integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_memberships_user ON public.organization_memberships(user_id);
CREATE INDEX idx_org_memberships_org ON public.organization_memberships(organization_id);

CREATE TABLE public.seat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requested_seats integer NOT NULL,
  current_seat_limit integer NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.seat_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.client_organizations(id) ON DELETE CASCADE,
  changed_by uuid,
  delta integer NOT NULL,
  previous_limit integer NOT NULL,
  new_limit integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Helper functions (SECURITY DEFINER) -----------------------------------

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = _user_id AND organization_id = _org_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_role(_user_id uuid, _org_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.organization_memberships
  WHERE user_id = _user_id AND organization_id = _org_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_organization_data(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.user_belongs_to_org(_user_id, _org_id);
$$;

-- 3. Triggers --------------------------------------------------------------

CREATE TRIGGER trg_client_organizations_updated_at
BEFORE UPDATE ON public.client_organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_seat_requests_updated_at
BEFORE UPDATE ON public.seat_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS on new tables -----------------------------------------------------

ALTER TABLE public.client_organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_change_log         ENABLE ROW LEVEL SECURITY;

-- client_organizations
CREATE POLICY "Platform admins manage organizations"
ON public.client_organizations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members can view their organizations"
ON public.client_organizations FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), id));

CREATE POLICY "Org owners/admins can update their organization"
ON public.client_organizations FOR UPDATE TO authenticated
USING (public.user_org_role(auth.uid(), id) IN ('owner','admin'));

-- organization_memberships
CREATE POLICY "Platform admins manage all memberships"
ON public.organization_memberships FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own memberships"
ON public.organization_memberships FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Members can view memberships of their orgs"
ON public.organization_memberships FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org owners/admins can manage their org memberships"
ON public.organization_memberships FOR ALL TO authenticated
USING (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'))
WITH CHECK (public.user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

-- seat_requests
CREATE POLICY "Platform admins manage all seat requests"
ON public.seat_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members can view their org seat requests"
ON public.seat_requests FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org owners/admins can create seat requests"
ON public.seat_requests FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND public.user_org_role(auth.uid(), organization_id) IN ('owner','admin')
);

-- seat_change_log
CREATE POLICY "Platform admins manage seat change log"
ON public.seat_change_log FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Org members can view their org seat changes"
ON public.seat_change_log FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

-- 5. Additive columns on existing tables ----------------------------------

ALTER TABLE public.data_orders     ADD COLUMN organization_id uuid REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.data_cart_items ADD COLUMN organization_id uuid REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.saved_regions   ADD COLUMN organization_id uuid REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.saved_lists     ADD COLUMN organization_id uuid REFERENCES public.client_organizations(id) ON DELETE SET NULL;
ALTER TABLE public.access_requests ADD COLUMN organization_id uuid REFERENCES public.client_organizations(id) ON DELETE SET NULL;

CREATE INDEX idx_data_orders_org     ON public.data_orders(organization_id);
CREATE INDEX idx_data_cart_items_org ON public.data_cart_items(organization_id);
CREATE INDEX idx_saved_regions_org   ON public.saved_regions(organization_id);
CREATE INDEX idx_saved_lists_org     ON public.saved_lists(organization_id);

-- 6. Additive RLS for org-scoped access on existing tables ---------------

CREATE POLICY "Org members can view org orders"
ON public.data_orders FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can view org cart items"
ON public.data_cart_items FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can view org saved regions"
ON public.saved_regions FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can view org saved lists"
ON public.saved_lists FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND public.user_belongs_to_org(auth.uid(), organization_id));

-- 7. Backfill -------------------------------------------------------------

-- Create one org per distinct profile.organization value
WITH normalized AS (
  SELECT
    id AS user_id,
    btrim(organization) AS name,
    regexp_replace(lower(btrim(organization)), '[^a-z0-9]+', '-', 'g') AS slug
  FROM public.profiles
  WHERE organization IS NOT NULL AND btrim(organization) <> ''
),
distinct_orgs AS (
  SELECT DISTINCT ON (lower(name)) name, slug FROM normalized
),
inserted AS (
  INSERT INTO public.client_organizations (name, slug)
  SELECT name, slug FROM distinct_orgs
  ON CONFLICT (slug) DO NOTHING
  RETURNING id, name
)
SELECT 1;

-- Add owners
INSERT INTO public.organization_memberships (organization_id, user_id, role)
SELECT co.id, p.id, 'owner'
FROM public.profiles p
JOIN public.client_organizations co
  ON lower(co.name) = lower(btrim(p.organization))
WHERE p.organization IS NOT NULL AND btrim(p.organization) <> ''
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Backfill organization_id on existing user-scoped tables (best-effort:
-- pick the user's first owned/admin org)
WITH first_org AS (
  SELECT DISTINCT ON (user_id) user_id, organization_id
  FROM public.organization_memberships
  ORDER BY user_id, created_at ASC
)
UPDATE public.data_orders o
SET organization_id = f.organization_id
FROM first_org f
WHERE o.organization_id IS NULL AND o.user_id = f.user_id;

WITH first_org AS (
  SELECT DISTINCT ON (user_id) user_id, organization_id
  FROM public.organization_memberships
  ORDER BY user_id, created_at ASC
)
UPDATE public.data_cart_items o
SET organization_id = f.organization_id
FROM first_org f
WHERE o.organization_id IS NULL AND o.user_id = f.user_id;

WITH first_org AS (
  SELECT DISTINCT ON (user_id) user_id, organization_id
  FROM public.organization_memberships
  ORDER BY user_id, created_at ASC
)
UPDATE public.saved_regions o
SET organization_id = f.organization_id
FROM first_org f
WHERE o.organization_id IS NULL AND o.user_id = f.user_id;

WITH first_org AS (
  SELECT DISTINCT ON (user_id) user_id, organization_id
  FROM public.organization_memberships
  ORDER BY user_id, created_at ASC
)
UPDATE public.saved_lists o
SET organization_id = f.organization_id
FROM first_org f
WHERE o.organization_id IS NULL AND o.user_id = f.user_id;
