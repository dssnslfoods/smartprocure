-- ============================================================
-- SPR Migration 001: Schema + Read Functions
-- Supplier Performance Review module — isolated in schema `spr`
-- ============================================================

-- 1) Create dedicated schema
CREATE SCHEMA IF NOT EXISTS spr;

-- 2) Grant usage to Supabase roles (needed for API exposure)
GRANT USAGE ON SCHEMA spr TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA spr
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA spr
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA spr
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
GRANT ALL ON SCHEMA spr TO service_role;

-- 3) Read functions (plpgsql, no view dependency)
--    These return data from public tables without creating DDL dependencies.

-- 3a) Read suppliers
CREATE OR REPLACE FUNCTION spr.fn_read_suppliers(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, company_name text, supplier_code text, supplier_name text,
  status public.supplier_status, risk_level public.risk_level_enum,
  brc_grade text, brc_percent numeric, brc_assessed_at timestamptz,
  brc_supplier_type text, is_blacklisted boolean, category text,
  qa_approval_status public.qa_approval_status_enum,
  tenant_id uuid, email text, phone text, country text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT s.id, s.company_name, s.supplier_code, s.supplier_name,
           s.status, s.risk_level,
           s.brc_grade, s.brc_percent, s.brc_assessed_at,
           s.brc_supplier_type, s.is_blacklisted, s.category,
           s.qa_approval_status,
           s.tenant_id, s.email, s.phone, s.country,
           s.created_at, s.updated_at
    FROM public.suppliers s
    WHERE (p_tenant_id IS NULL OR s.tenant_id = p_tenant_id);
END;
$$;

-- 3b) Read supplier certificates
CREATE OR REPLACE FUNCTION spr.fn_read_certificates(p_supplier_id uuid DEFAULT NULL, p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, supplier_id uuid, certificate_type text, certificate_no text,
  issued_by text, issued_date date, expiry_date date,
  file_url text, file_name text, is_primary boolean, tenant_id uuid
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT sc.id, sc.supplier_id, sc.certificate_type, sc.certificate_no,
           sc.issued_by, sc.issued_date, sc.expiry_date,
           sc.file_url, sc.file_name, sc.is_primary, sc.tenant_id
    FROM public.supplier_certificates sc
    WHERE (p_supplier_id IS NULL OR sc.supplier_id = p_supplier_id)
      AND (p_tenant_id IS NULL OR sc.tenant_id = p_tenant_id);
END;
$$;

-- 3c) Read supplier BRC types (categories assigned)
CREATE OR REPLACE FUNCTION spr.fn_read_supplier_brc_types(p_supplier_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, supplier_id uuid, supplier_type text,
  grade text, percent numeric, assessed_at timestamptz, is_primary boolean
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT sbt.id, sbt.supplier_id, sbt.supplier_type,
           sbt.grade, sbt.percent, sbt.assessed_at, sbt.is_primary
    FROM public.supplier_brc_types sbt
    WHERE (p_supplier_id IS NULL OR sbt.supplier_id = p_supplier_id);
END;
$$;

-- 3d) Read BRC supplier type lookup
CREATE OR REPLACE FUNCTION spr.fn_read_brc_supplier_types()
RETURNS TABLE(id uuid, key text, label_th text, sort_order int, active boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT bst.id, bst.key, bst.label_th, bst.sort_order, bst.active
    FROM public.brc_supplier_types bst
    WHERE bst.active = true
    ORDER BY bst.sort_order;
END;
$$;

-- 3e) Read NCRs for KPI collection
CREATE OR REPLACE FUNCTION spr.fn_read_ncrs(
  p_supplier_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE(
  id uuid, supplier_id uuid, ncr_number text,
  severity text, status text, category text,
  detected_date date, corrective_action text,
  capa_due_date date, closed_date date, tenant_id uuid
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT n.id, n.supplier_id, n.ncr_number,
           n.severity::text, n.status::text, n.category,
           n.detected_date, n.corrective_action,
           n.capa_due_date, n.closed_date, n.tenant_id
    FROM public.supplier_ncrs n
    WHERE n.supplier_id = p_supplier_id
      AND (p_from IS NULL OR n.detected_date >= p_from)
      AND (p_to IS NULL OR n.detected_date <= p_to);
END;
$$;

-- 3f) Read risk assessments
CREATE OR REPLACE FUNCTION spr.fn_read_risk_assessments(p_supplier_id uuid)
RETURNS TABLE(
  id uuid, supplier_id uuid, total_risk_score numeric,
  food_safety_risk numeric, quality_risk numeric,
  assessed_by uuid, assessed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT ra.id, ra.supplier_id, ra.total_risk_score,
           ra.food_safety_risk, ra.quality_risk,
           ra.assessed_by, ra.assessed_at
    FROM public.supplier_risk_assessments ra
    WHERE ra.supplier_id = p_supplier_id
    ORDER BY ra.assessed_at DESC;
END;
$$;

-- 3g) Read user profile + roles
CREATE OR REPLACE FUNCTION spr.fn_read_user_info(p_user_id uuid)
RETURNS TABLE(
  user_id uuid, email text, full_name text,
  tenant_id uuid, roles text[]
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT p.id, p.email, p.full_name, p.tenant_id,
           ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id)
    FROM public.profiles p
    WHERE p.id = p_user_id;
END;
$$;

-- 3h) Read supplier documents
CREATE OR REPLACE FUNCTION spr.fn_read_supplier_documents(p_supplier_id uuid)
RETURNS TABLE(
  id uuid, supplier_id uuid, document_name text,
  document_type text, file_url text
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT sd.id, sd.supplier_id, sd.document_name,
           sd.document_type, sd.file_url
    FROM public.supplier_documents sd
    WHERE sd.supplier_id = p_supplier_id;
END;
$$;

-- 4) Audit log table (module-only)
CREATE TABLE spr.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text NOT NULL,
  record_id   uuid,
  action      text NOT NULL, -- INSERT / UPDATE / DELETE
  old_values  jsonb,
  new_values  jsonb,
  changed_by  uuid,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_spr_audit_log_record ON spr.audit_log(record_id);
CREATE INDEX idx_spr_audit_log_table  ON spr.audit_log(table_name);
CREATE INDEX idx_spr_audit_log_time   ON spr.audit_log(changed_at DESC);

ALTER TABLE spr.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read audit log"
  ON spr.audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "System insert audit log"
  ON spr.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- 5) Generic audit trigger function
CREATE OR REPLACE FUNCTION spr.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO spr.audit_log(table_name, record_id, action, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO spr.audit_log(table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO spr.audit_log(table_name, record_id, action, old_values, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
