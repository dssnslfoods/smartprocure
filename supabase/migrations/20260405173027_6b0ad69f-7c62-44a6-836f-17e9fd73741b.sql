-- Additional enums
DO $$ BEGIN CREATE TYPE public.supplier_status AS ENUM ('draft', 'submitted', 'review', 'approved', 'rejected', 'suspended'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.supplier_tier AS ENUM ('critical_tier_1', 'non_critical_tier_1'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.rfq_status AS ENUM ('draft', 'published', 'closed', 'evaluation', 'awarded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.bidding_status AS ENUM ('scheduled', 'active', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.award_status AS ENUM ('pending', 'approved', 'rejected', 'revise'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.price_list_status AS ENUM ('draft', 'submitted', 'active', 'expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, full_name TEXT, phone TEXT, avatar_url TEXT,
  is_active BOOLEAN DEFAULT true, supplier_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL, tax_id TEXT, address TEXT, city TEXT, country TEXT,
  phone TEXT, email TEXT, website TEXT, status supplier_status DEFAULT 'draft',
  tier supplier_tier, notes TEXT, is_preferred BOOLEAN DEFAULT false,
  is_blacklisted BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id), approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Supplier Contacts
CREATE TABLE IF NOT EXISTS public.supplier_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL, position TEXT, email TEXT, phone TEXT,
  is_primary BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

-- Supplier Documents
CREATE TABLE IF NOT EXISTS public.supplier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL, document_type TEXT, file_url TEXT, file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

-- Supplier Tiers
CREATE TABLE IF NOT EXISTS public.supplier_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name TEXT NOT NULL UNIQUE, description TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_tiers ENABLE ROW LEVEL SECURITY;

-- Supplier ESG
CREATE TABLE IF NOT EXISTS public.supplier_esg_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE UNIQUE,
  esg_score NUMERIC(5,2) DEFAULT 0, compliance_status TEXT DEFAULT 'pending',
  risk_level TEXT DEFAULT 'low', environmental_score NUMERIC(5,2),
  social_score NUMERIC(5,2), governance_score NUMERIC(5,2), notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_esg_profiles ENABLE ROW LEVEL SECURITY;

-- Price Lists
CREATE TABLE IF NOT EXISTS public.price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  title TEXT NOT NULL, version INTEGER DEFAULT 1, status price_list_status DEFAULT 'draft',
  valid_from DATE, valid_until DATE, payment_terms TEXT, notes TEXT, attachment_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES public.price_lists(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL, description TEXT, unit TEXT, unit_price NUMERIC(15,2) NOT NULL,
  moq INTEGER, lead_time_days INTEGER, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

-- RFQs
CREATE TABLE IF NOT EXISTS public.rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number TEXT UNIQUE, title TEXT NOT NULL, description TEXT,
  status rfq_status DEFAULT 'draft', deadline TIMESTAMPTZ, notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rfqs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rfq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL, description TEXT, quantity NUMERIC(15,2), unit TEXT,
  specifications TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rfq_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rfq_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  invited_at TIMESTAMPTZ DEFAULT now(), responded BOOLEAN DEFAULT false,
  UNIQUE (rfq_id, supplier_id)
);
ALTER TABLE public.rfq_suppliers ENABLE ROW LEVEL SECURITY;

-- Quotations
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  total_amount NUMERIC(15,2), currency TEXT DEFAULT 'USD', payment_terms TEXT,
  delivery_terms TEXT, validity_days INTEGER, notes TEXT, attachment_url TEXT,
  submitted_at TIMESTAMPTZ, revised_at TIMESTAMPTZ, version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  rfq_item_id UUID REFERENCES public.rfq_items(id),
  item_name TEXT NOT NULL, quantity NUMERIC(15,2), unit TEXT,
  unit_price NUMERIC(15,2) NOT NULL, total_price NUMERIC(15,2), notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Bidding
CREATE TABLE IF NOT EXISTS public.bidding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT, status bidding_status DEFAULT 'scheduled',
  start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, max_rounds INTEGER,
  current_round INTEGER DEFAULT 1, created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bidding_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bid_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bidding_event_id UUID NOT NULL REFERENCES public.bidding_events(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  round_number INTEGER DEFAULT 1, bid_amount NUMERIC(15,2) NOT NULL,
  notes TEXT, submitted_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bid_entries ENABLE ROW LEVEL SECURITY;

-- Final Quotations
CREATE TABLE IF NOT EXISTS public.final_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES public.quotations(id),
  bidding_event_id UUID REFERENCES public.bidding_events(id),
  total_amount NUMERIC(15,2), currency TEXT DEFAULT 'USD', payment_terms TEXT,
  delivery_terms TEXT, attachment_url TEXT, status TEXT DEFAULT 'pending',
  is_selected BOOLEAN DEFAULT false, ready_for_po BOOLEAN DEFAULT false,
  notes TEXT, created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.final_quotations ENABLE ROW LEVEL SECURITY;

-- Awards
CREATE TABLE IF NOT EXISTS public.awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  final_quotation_id UUID REFERENCES public.final_quotations(id),
  amount NUMERIC(15,2), status award_status DEFAULT 'pending',
  recommendation TEXT, decision_reason TEXT, ready_for_po BOOLEAN DEFAULT false,
  awarded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

-- Approval Logs
CREATE TABLE IF NOT EXISTS public.approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, entity_id UUID NOT NULL, action TEXT NOT NULL,
  status TEXT, comment TEXT, approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.approval_logs ENABLE ROW LEVEL SECURITY;

-- Evaluations
CREATE TABLE IF NOT EXISTS public.evaluation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL, is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id), created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.evaluation_templates(id) ON DELETE CASCADE,
  criteria_name TEXT NOT NULL, description TEXT, weight NUMERIC(5,2) DEFAULT 1.0,
  sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supplier_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.evaluation_templates(id),
  evaluator_id UUID REFERENCES auth.users(id), evaluation_period TEXT,
  total_score NUMERIC(5,2), status TEXT DEFAULT 'draft', notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_evaluations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supplier_evaluation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.supplier_evaluations(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES public.evaluation_criteria(id) ON DELETE CASCADE,
  score NUMERIC(3,1) NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_evaluation_scores ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supplier_score_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE UNIQUE,
  service_score NUMERIC(5,2) DEFAULT 0, esg_score NUMERIC(5,2) DEFAULT 0,
  commercial_score NUMERIC(5,2) DEFAULT 0, reliability_score NUMERIC(5,2) DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0, risk_flag TEXT DEFAULT 'low',
  recommendation TEXT, last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supplier_score_summary ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, message TEXT, type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false, link TEXT, entity_type TEXT, entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, entity_id UUID, action TEXT NOT NULL,
  old_values JSONB, new_values JSONB,
  performed_by UUID REFERENCES auth.users(id), ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- FK: profiles.supplier_id -> suppliers
ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_supplier
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- Trigger: Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System inserts profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Internal users read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'approver') OR public.has_role(auth.uid(), 'executive') OR (public.has_role(auth.uid(), 'supplier') AND created_by = auth.uid()));
CREATE POLICY "Admin/proc create suppliers" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));
CREATE POLICY "Admin/proc update suppliers" ON public.suppliers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read supplier contacts" ON public.supplier_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage supplier contacts" ON public.supplier_contacts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));
CREATE POLICY "Suppliers insert own contacts" ON public.supplier_contacts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read supplier docs" ON public.supplier_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage supplier docs" ON public.supplier_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read tiers" ON public.supplier_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage tiers" ON public.supplier_tiers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Read ESG" ON public.supplier_esg_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage ESG" ON public.supplier_esg_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read price lists" ON public.price_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage price lists" ON public.price_lists FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read price list items" ON public.price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage price list items" ON public.price_list_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read RFQs" ON public.rfqs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage RFQs" ON public.rfqs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read RFQ items" ON public.rfq_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage RFQ items" ON public.rfq_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read RFQ suppliers" ON public.rfq_suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage RFQ suppliers" ON public.rfq_suppliers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read quotations" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage quotations" ON public.quotations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read quotation items" ON public.quotation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage quotation items" ON public.quotation_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read bidding events" ON public.bidding_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage bidding events" ON public.bidding_events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read bid entries" ON public.bid_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Submit bids" ON public.bid_entries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'supplier'));

CREATE POLICY "Read final quotations" ON public.final_quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage final quotations" ON public.final_quotations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read awards" ON public.awards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage awards" ON public.awards FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer') OR public.has_role(auth.uid(), 'approver'));

CREATE POLICY "Read approval logs" ON public.approval_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert approval logs" ON public.approval_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Read eval templates" ON public.evaluation_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage eval templates" ON public.evaluation_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Read eval criteria" ON public.evaluation_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage eval criteria" ON public.evaluation_criteria FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Read evaluations" ON public.supplier_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage evaluations" ON public.supplier_evaluations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read eval scores" ON public.supplier_evaluation_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage eval scores" ON public.supplier_evaluation_scores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Read score summary" ON public.supplier_score_summary FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage score summary" ON public.supplier_score_summary FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));

CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'procurement_officer'));
CREATE POLICY "Insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('supplier-documents', 'supplier-documents', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Anyone can read supplier docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'supplier-documents');
CREATE POLICY "Authenticated upload supplier docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'supplier-documents');

-- Seed data
INSERT INTO public.supplier_tiers (tier_name, description) VALUES
  ('Critical Tier 1', 'Strategic suppliers critical to operations'),
  ('Non-Critical Tier 1', 'Important but non-critical suppliers')
ON CONFLICT DO NOTHING;