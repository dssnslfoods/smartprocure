-- ============================================================
-- SPR Migration 003: Review Tables
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Main review record
CREATE TABLE spr.supplier_review (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid NOT NULL, -- no FK to public.suppliers
  review_year       int NOT NULL,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  due_date          date,
  risk_level_at_review text,
  supplier_category text, -- BRC category at review time
  status            text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','SUBMITTED','REVIEWED','APPROVED','RETURNED')),
  final_score       numeric(5,2),
  grade             text,
  outcome           text, -- Approved / Conditionally Approved / Suspended / Disapproved
  knockout_failed   boolean NOT NULL DEFAULT false,
  reviewer_id       uuid,
  approver_id       uuid,
  purchasing_input_by uuid,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  approved_at       timestamptz,
  returned_at       timestamptz,
  return_comment    text,
  revision_no       int NOT NULL DEFAULT 1,
  parent_review_id  uuid REFERENCES spr.supplier_review(id),
  locked            boolean NOT NULL DEFAULT false,
  risk_adjusted     boolean NOT NULL DEFAULT false,
  risk_adjustment_reason text,
  new_risk_level    text,
  tenant_id         uuid,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_period CHECK (period_start < period_end)
);

CREATE INDEX idx_spr_review_supplier ON spr.supplier_review(supplier_id);
CREATE INDEX idx_spr_review_status   ON spr.supplier_review(status);
CREATE INDEX idx_spr_review_year     ON spr.supplier_review(review_year);
CREATE INDEX idx_spr_review_due      ON spr.supplier_review(due_date);
CREATE INDEX idx_spr_review_tenant   ON spr.supplier_review(tenant_id);

ALTER TABLE spr.supplier_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read reviews" ON spr.supplier_review FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write reviews" ON spr.supplier_review FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_supplier_review
  AFTER INSERT OR UPDATE OR DELETE ON spr.supplier_review
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 2) KPI snapshot (stored with each review)
CREATE TABLE spr.supplier_review_kpi_snapshot (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES spr.supplier_review(id) ON DELETE CASCADE,
  data          jsonb NOT NULL DEFAULT '{}',
  collected_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id)
);

ALTER TABLE spr.supplier_review_kpi_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read kpi" ON spr.supplier_review_kpi_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write kpi" ON spr.supplier_review_kpi_snapshot FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Per-criterion scores
CREATE TABLE spr.supplier_review_score (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        uuid NOT NULL REFERENCES spr.supplier_review(id) ON DELETE CASCADE,
  criterion_id     uuid NOT NULL REFERENCES spr.review_criteria(id),
  auto_score       numeric(5,2),
  final_score      numeric(5,2),
  override_comment text,
  weight_snapshot  numeric(5,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id, criterion_id)
);

ALTER TABLE spr.supplier_review_score ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read scores" ON spr.supplier_review_score FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write scores" ON spr.supplier_review_score FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_review_score
  AFTER INSERT OR UPDATE OR DELETE ON spr.supplier_review_score
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 4) Knockout check results
CREATE TABLE spr.supplier_review_knockout (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid NOT NULL REFERENCES spr.supplier_review(id) ON DELETE CASCADE,
  rule_id    uuid NOT NULL REFERENCES spr.knockout_rule(id),
  passed     boolean NOT NULL,
  detail     text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id, rule_id)
);

ALTER TABLE spr.supplier_review_knockout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read ko" ON spr.supplier_review_knockout FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write ko" ON spr.supplier_review_knockout FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5) Follow-up actions
CREATE TABLE spr.supplier_review_action (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    uuid NOT NULL REFERENCES spr.supplier_review(id) ON DELETE CASCADE,
  action_type  text NOT NULL, -- CAPA / IMPROVEMENT / REISSUE_QUESTIONNAIRE / TRACEABILITY_VERIFY / OTHER
  description  text NOT NULL,
  owner_id     uuid,
  due_date     date,
  status       text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','CLOSED','CANCELLED')),
  closed_at    timestamptz,
  tenant_id    uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spr.supplier_review_action ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read actions" ON spr.supplier_review_action FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write actions" ON spr.supplier_review_action FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_review_action
  AFTER INSERT OR UPDATE OR DELETE ON spr.supplier_review_action
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 6) Evidence attachments
CREATE TABLE spr.supplier_review_attachment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id    uuid NOT NULL REFERENCES spr.supplier_review(id) ON DELETE CASCADE,
  doc_type     text NOT NULL, -- CERT / DIRECTORY_SCREENSHOT / AUDIT_REPORT / QUESTIONNAIRE / TRACEABILITY / MEETING_MINUTES / OTHER
  file_path    text NOT NULL,
  file_name    text,
  file_size    bigint,
  uploaded_by  uuid,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spr.supplier_review_attachment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read attach" ON spr.supplier_review_attachment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write attach" ON spr.supplier_review_attachment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7) Module-owned supplier review status (summary / ASL)
CREATE TABLE spr.supplier_review_status (
  supplier_id          uuid PRIMARY KEY,
  risk_level           text,
  last_review_id       uuid REFERENCES spr.supplier_review(id),
  grade                text,
  outcome              text,
  next_review_due_date date,
  tenant_id            uuid,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spr.supplier_review_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read status" ON spr.supplier_review_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write status" ON spr.supplier_review_status FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8) Status history
CREATE TABLE spr.supplier_status_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      uuid NOT NULL,
  old_status       text,
  new_status       text NOT NULL,
  old_grade        text,
  new_grade        text,
  source_review_id uuid REFERENCES spr.supplier_review(id),
  changed_by       uuid,
  changed_at       timestamptz NOT NULL DEFAULT now(),
  reason           text,
  tenant_id        uuid
);

CREATE INDEX idx_spr_status_hist_supplier ON spr.supplier_status_history(supplier_id);

ALTER TABLE spr.supplier_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read hist" ON spr.supplier_status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth write hist" ON spr.supplier_status_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_audit_status_history
  AFTER INSERT OR UPDATE OR DELETE ON spr.supplier_status_history
  FOR EACH ROW EXECUTE FUNCTION spr.fn_audit_trigger();

-- 9) Module-owned notifications
CREATE TABLE spr.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  title       text NOT NULL,
  message     text,
  type        text, -- REVIEW_DUE / REVIEW_OVERDUE / REVIEW_SUBMITTED / REVIEW_APPROVED / etc
  is_read     boolean NOT NULL DEFAULT false,
  entity_type text, -- supplier_review / supplier_review_action
  entity_id   uuid,
  tenant_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_spr_notif_user ON spr.notifications(user_id);
CREATE INDEX idx_spr_notif_read ON spr.notifications(is_read) WHERE NOT is_read;

ALTER TABLE spr.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications"
  ON spr.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "System insert notifications"
  ON spr.notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users update own notifications"
  ON spr.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
