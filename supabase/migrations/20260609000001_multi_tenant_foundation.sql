-- ============================================================
-- Smart Procurement — Multi-Tenant Foundation
-- Created: 2026-06-09
-- Purpose: Add multi-tenant support with Super Admin role,
--          tenant management, and per-tenant module/role access.
-- ============================================================

-- ============================================================
-- SECTION 1: ADD super_admin TO app_role ENUM
-- ============================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- ============================================================
-- SECTION 2: TENANTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  is_active   BOOLEAN DEFAULT true,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 3: TENANT MODULES — which modules enabled per tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  is_enabled  BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, module_key)
);

ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 4: TENANT ROLE MODULES — which roles see which modules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_role_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL,
  module_key  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, role, module_key)
);

ALTER TABLE public.tenant_role_modules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 5: HELPER FUNCTIONS
-- ============================================================

-- 5a. Get user's tenant_id from profiles
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM profiles WHERE id = _user_id
$$;

-- 5b. Check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- ============================================================
-- SECTION 6: SEED DEFAULT TENANT (backward compatibility)
-- ============================================================
INSERT INTO public.tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'NSL Foods PLC', 'nsl-foods')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SECTION 7: ADD tenant_id TO ALL BUSINESS TABLES
-- ============================================================

-- profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- suppliers
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.suppliers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.suppliers ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_contacts
ALTER TABLE public.supplier_contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_contacts SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_contacts ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_documents
ALTER TABLE public.supplier_documents ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_documents SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_documents ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_tiers
ALTER TABLE public.supplier_tiers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_tiers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_tiers ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_risk_assessments
ALTER TABLE public.supplier_risk_assessments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_risk_assessments SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_risk_assessments ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_certificates
DO $$ BEGIN
  ALTER TABLE public.supplier_certificates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.supplier_certificates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
  ALTER TABLE public.supplier_certificates ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- supplier_evaluations
ALTER TABLE public.supplier_evaluations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_evaluations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_evaluations ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_evaluation_scores
ALTER TABLE public.supplier_evaluation_scores ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_evaluation_scores SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_evaluation_scores ALTER COLUMN tenant_id SET NOT NULL;

-- supplier_score_summary
ALTER TABLE public.supplier_score_summary ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.supplier_score_summary SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.supplier_score_summary ALTER COLUMN tenant_id SET NOT NULL;

-- price_lists
ALTER TABLE public.price_lists ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.price_lists SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.price_lists ALTER COLUMN tenant_id SET NOT NULL;

-- price_list_items
ALTER TABLE public.price_list_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.price_list_items SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.price_list_items ALTER COLUMN tenant_id SET NOT NULL;

-- price_list_item_suppliers
DO $$ BEGIN
  ALTER TABLE public.price_list_item_suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.price_list_item_suppliers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
  ALTER TABLE public.price_list_item_suppliers ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- price_list_quotation_history
DO $$ BEGIN
  ALTER TABLE public.price_list_quotation_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.price_list_quotation_history SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
  ALTER TABLE public.price_list_quotation_history ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- rfqs
ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.rfqs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.rfqs ALTER COLUMN tenant_id SET NOT NULL;

-- rfq_items
ALTER TABLE public.rfq_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.rfq_items SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.rfq_items ALTER COLUMN tenant_id SET NOT NULL;

-- rfq_suppliers
ALTER TABLE public.rfq_suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.rfq_suppliers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.rfq_suppliers ALTER COLUMN tenant_id SET NOT NULL;

-- rfq_evaluations
DO $$ BEGIN
  ALTER TABLE public.rfq_evaluations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.rfq_evaluations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
  ALTER TABLE public.rfq_evaluations ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- quotations
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.quotations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.quotations ALTER COLUMN tenant_id SET NOT NULL;

-- quotation_items
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.quotation_items SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.quotation_items ALTER COLUMN tenant_id SET NOT NULL;

-- bidding_events
ALTER TABLE public.bidding_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.bidding_events SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.bidding_events ALTER COLUMN tenant_id SET NOT NULL;

-- bid_entries
ALTER TABLE public.bid_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.bid_entries SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.bid_entries ALTER COLUMN tenant_id SET NOT NULL;

-- final_quotations
ALTER TABLE public.final_quotations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.final_quotations SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.final_quotations ALTER COLUMN tenant_id SET NOT NULL;

-- awards
ALTER TABLE public.awards ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.awards SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.awards ALTER COLUMN tenant_id SET NOT NULL;

-- award_approvals
DO $$ BEGIN
  ALTER TABLE public.award_approvals ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
  UPDATE public.award_approvals SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
  ALTER TABLE public.award_approvals ALTER COLUMN tenant_id SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- approval_logs
ALTER TABLE public.approval_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.approval_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.approval_logs ALTER COLUMN tenant_id SET NOT NULL;

-- audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.audit_logs SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.audit_logs ALTER COLUMN tenant_id SET NOT NULL;

-- evaluation_templates
ALTER TABLE public.evaluation_templates ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.evaluation_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.evaluation_templates ALTER COLUMN tenant_id SET NOT NULL;

-- evaluation_criteria
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.evaluation_criteria SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.evaluation_criteria ALTER COLUMN tenant_id SET NOT NULL;

-- notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.notifications SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.notifications ALTER COLUMN tenant_id SET NOT NULL;

-- system_settings
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.system_settings SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE public.system_settings ALTER COLUMN tenant_id SET NOT NULL;

-- ============================================================
-- SECTION 8: INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant       ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_tenant            ON public.rfqs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotations_tenant      ON public.quotations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bidding_events_tenant   ON public.bidding_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_awards_tenant           ON public.awards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_price_lists_tenant      ON public.price_lists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant         ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant    ON public.notifications(tenant_id);

-- ============================================================
-- SECTION 9: RLS POLICIES FOR TENANT TABLES
-- ============================================================

-- tenants: super_admin full access; tenant admin read own
CREATE POLICY "super_admin_tenants_all" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_users_read_own" ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id(auth.uid()));

-- tenant_modules: super_admin full access; tenant users read own
CREATE POLICY "super_admin_tenant_modules_all" ON public.tenant_modules
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_users_read_own_modules" ON public.tenant_modules
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- tenant_role_modules: super_admin full access; tenant users read own
CREATE POLICY "super_admin_tenant_role_modules_all" ON public.tenant_role_modules
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_users_read_own_role_modules" ON public.tenant_role_modules
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ============================================================
-- SECTION 10: SEED DEFAULT TENANT MODULES & ROLE MAPPINGS
-- ============================================================

-- All modules for default tenant
INSERT INTO public.tenant_modules (tenant_id, module_key, is_enabled) VALUES
  ('00000000-0000-0000-0000-000000000001', 'dashboard', true),
  ('00000000-0000-0000-0000-000000000001', 'supplier_portal', true),
  ('00000000-0000-0000-0000-000000000001', 'suppliers', true),
  ('00000000-0000-0000-0000-000000000001', 'vendor_risk', true),
  ('00000000-0000-0000-0000-000000000001', 'price_lists', true),
  ('00000000-0000-0000-0000-000000000001', 'rfq', true),
  ('00000000-0000-0000-0000-000000000001', 'e_bidding', true),
  ('00000000-0000-0000-0000-000000000001', 'final_quotations', true),
  ('00000000-0000-0000-0000-000000000001', 'awards', true),
  ('00000000-0000-0000-0000-000000000001', 'reports', true),
  ('00000000-0000-0000-0000-000000000001', 'admin_settings', true),
  ('00000000-0000-0000-0000-000000000001', 'supplier_approvals', true)
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- Default role→module mappings (matching current AppSidebar hardcoded roles)
-- admin: all modules
INSERT INTO public.tenant_role_modules (tenant_id, role, module_key)
SELECT '00000000-0000-0000-0000-000000000001', 'admin', m.module_key
FROM public.tenant_modules m WHERE m.tenant_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT (tenant_id, role, module_key) DO NOTHING;

-- procurement_officer
INSERT INTO public.tenant_role_modules (tenant_id, role, module_key) VALUES
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'dashboard'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'suppliers'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'vendor_risk'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'price_lists'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'rfq'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'e_bidding'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'final_quotations'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'awards'),
  ('00000000-0000-0000-0000-000000000001', 'procurement_officer', 'reports')
ON CONFLICT (tenant_id, role, module_key) DO NOTHING;

-- approver
INSERT INTO public.tenant_role_modules (tenant_id, role, module_key) VALUES
  ('00000000-0000-0000-0000-000000000001', 'approver', 'dashboard'),
  ('00000000-0000-0000-0000-000000000001', 'approver', 'suppliers'),
  ('00000000-0000-0000-0000-000000000001', 'approver', 'vendor_risk'),
  ('00000000-0000-0000-0000-000000000001', 'approver', 'final_quotations'),
  ('00000000-0000-0000-0000-000000000001', 'approver', 'awards')
ON CONFLICT (tenant_id, role, module_key) DO NOTHING;

-- executive
INSERT INTO public.tenant_role_modules (tenant_id, role, module_key) VALUES
  ('00000000-0000-0000-0000-000000000001', 'executive', 'dashboard'),
  ('00000000-0000-0000-0000-000000000001', 'executive', 'suppliers'),
  ('00000000-0000-0000-0000-000000000001', 'executive', 'awards'),
  ('00000000-0000-0000-0000-000000000001', 'executive', 'reports')
ON CONFLICT (tenant_id, role, module_key) DO NOTHING;

-- supplier
INSERT INTO public.tenant_role_modules (tenant_id, role, module_key) VALUES
  ('00000000-0000-0000-0000-000000000001', 'supplier', 'dashboard'),
  ('00000000-0000-0000-0000-000000000001', 'supplier', 'supplier_portal'),
  ('00000000-0000-0000-0000-000000000001', 'supplier', 'price_lists'),
  ('00000000-0000-0000-0000-000000000001', 'supplier', 'rfq'),
  ('00000000-0000-0000-0000-000000000001', 'supplier', 'e_bidding')
ON CONFLICT (tenant_id, role, module_key) DO NOTHING;

-- ============================================================
-- SECTION 11: UPDATE handle_new_user TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(
      (NEW.raw_user_meta_data->>'tenant_id')::UUID,
      '00000000-0000-0000-0000-000000000001'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
  RETURN NEW;
END;
$$;

-- ============================================================
-- SECTION 12: RPC — CREATE TENANT (for super admin)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_tenant(
  _name TEXT,
  _slug TEXT,
  _modules TEXT[] DEFAULT ARRAY[
    'dashboard','supplier_portal','suppliers','vendor_risk','price_lists',
    'rfq','e_bidding','final_quotations','awards','reports','admin_settings','supplier_approvals'
  ]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _module TEXT;
  _role public.app_role;
  _default_role_modules JSONB := '{
    "admin": ["dashboard","supplier_portal","suppliers","vendor_risk","price_lists","rfq","e_bidding","final_quotations","awards","reports","admin_settings","supplier_approvals"],
    "procurement_officer": ["dashboard","suppliers","vendor_risk","price_lists","rfq","e_bidding","final_quotations","awards","reports"],
    "approver": ["dashboard","suppliers","vendor_risk","final_quotations","awards"],
    "executive": ["dashboard","suppliers","awards","reports"],
    "supplier": ["dashboard","supplier_portal","price_lists","rfq","e_bidding"]
  }'::JSONB;
BEGIN
  -- Only super_admin can call
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super_admin can create tenants';
  END IF;

  -- Create tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (_name, _slug)
  RETURNING id INTO _tenant_id;

  -- Seed modules
  FOREACH _module IN ARRAY _modules LOOP
    INSERT INTO public.tenant_modules (tenant_id, module_key, is_enabled)
    VALUES (_tenant_id, _module, true)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Seed role→module mappings for enabled modules
  FOR _role IN SELECT unnest(ARRAY['admin','procurement_officer','approver','executive','supplier']::public.app_role[]) LOOP
    INSERT INTO public.tenant_role_modules (tenant_id, role, module_key)
    SELECT _tenant_id, _role, m.value::TEXT
    FROM jsonb_array_elements_text(_default_role_modules->(_role::TEXT)) m(value)
    WHERE m.value::TEXT = ANY(_modules)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN _tenant_id;
END;
$$;
