-- ============================================================
-- SPR Migration 002: Configuration Tables
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Review frequency per risk level
CREATE TABLE spr.review_frequency_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_level   text NOT NULL UNIQUE, -- low / medium / high / critical
  months       int NOT NULL DEFAULT 12 CHECK (months >= 1 AND months <= 36),
  max_months   int NOT NULL DEFAULT 24 CHECK (max_months >= 1 AND max_months <= 36),
  tenant_id    uuid,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_months_le_max CHECK (months <= max_months)
);

ALTER TABLE spr.review_frequency_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read freq config" ON spr.review_frequency_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write freq config" ON spr.review_frequency_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_review_freq
  AFTER INSERT OR UPDATE OR DELETE ON spr.review_frequency_config
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 2) Review criteria (per supplier category)
CREATE TABLE spr.review_criteria (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_category   text NOT NULL, -- key from brc_supplier_types
  code                text NOT NULL,
  name_th             text NOT NULL,
  name_en             text NOT NULL,
  criterion_group     text NOT NULL CHECK (criterion_group IN ('SAFETY_QUALITY', 'COMMERCIAL')),
  bsaq_tags           text[] NOT NULL DEFAULT '{}', -- safety / authenticity / legality / quality
  weight              numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  scale_max           int NOT NULL DEFAULT 4 CHECK (scale_max >= 1),
  auto_rule           jsonb, -- e.g. {"field":"reject_rate","operator":"<=","threshold":1,"score":4}
  score_descriptors   jsonb, -- e.g. [{"score":0,"label":"..."},{"score":4,"label":"..."}]
  active              boolean NOT NULL DEFAULT true,
  sort_order          int NOT NULL DEFAULT 0,
  tenant_id           uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_spr_criteria_cat ON spr.review_criteria(supplier_category);

ALTER TABLE spr.review_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read criteria" ON spr.review_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write criteria" ON spr.review_criteria FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_review_criteria
  AFTER INSERT OR UPDATE OR DELETE ON spr.review_criteria
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 3) Knockout (gate) rules
CREATE TABLE spr.knockout_rule (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,
  description_th        text NOT NULL,
  description_en        text NOT NULL,
  applies_to_categories text[] NOT NULL DEFAULT '{}', -- empty = all
  check_function        text, -- name of spr function to call
  active                boolean NOT NULL DEFAULT true,
  sort_order            int NOT NULL DEFAULT 0,
  tenant_id             uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spr.knockout_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read ko rules" ON spr.knockout_rule FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write ko rules" ON spr.knockout_rule FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_knockout_rule
  AFTER INSERT OR UPDATE OR DELETE ON spr.knockout_rule
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 4) Grade thresholds
CREATE TABLE spr.grade_threshold (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_category     text, -- NULL = default for all
  grade                 text NOT NULL, -- A / B / C / D
  min_score             numeric(5,2) NOT NULL,
  outcome               text NOT NULL, -- Approved / Conditionally Approved / Suspended / Disapproved
  next_review_months    int,
  actions               jsonb, -- e.g. {"require_capa": true, "increase_inspection": true}
  sort_order            int NOT NULL DEFAULT 0,
  tenant_id             uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spr.grade_threshold ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read grade" ON spr.grade_threshold FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write grade" ON spr.grade_threshold FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_grade_threshold
  AFTER INSERT OR UPDATE OR DELETE ON spr.grade_threshold
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 5) Role mapping (maps existing app_role to SPR workflow roles)
CREATE TABLE spr.role_mapping (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_role    text NOT NULL, -- admin / procurement_officer / approver
  spr_role    text NOT NULL, -- qa_manager / qa_officer / purchasing / viewer
  tenant_id   uuid,
  UNIQUE(app_role, tenant_id)
);

ALTER TABLE spr.role_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read role map" ON spr.role_mapping FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write role map" ON spr.role_mapping FOR ALL TO authenticated USING (true) WITH CHECK (true);
