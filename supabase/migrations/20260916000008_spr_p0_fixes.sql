-- ============================================================
-- SPR Migration 008: P0 Fixes — BRCGS compliance, scoring, knockouts
-- ============================================================
SET search_path = spr, pg_temp;

-- ────────────────────────────────────────────────────────────
-- P0-2 / P0-3: Fix seed criteria weights to total 100
--   and add missing BRCGS dimensions (authenticity/food fraud,
--   legality/regulatory, customer complaints, response to changes)
-- ────────────────────────────────────────────────────────────

-- Rebalance existing rm_primary_pk criteria
UPDATE spr.review_criteria SET weight = 12 WHERE code = 'SQ01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 10 WHERE code = 'SQ02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 12 WHERE code = 'SQ03' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8  WHERE code = 'SQ04' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 6  WHERE code = 'SQ05' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8  WHERE code = 'SQ06' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8  WHERE code = 'CM01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 4  WHERE code = 'CM02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 4  WHERE code = 'CM03' AND supplier_category = 'rm_primary_pk';

-- Add new BRCGS-required dimensions
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, score_descriptors, sort_order) VALUES
  ('rm_primary_pk', 'SQ07', 'ความถูกต้องแท้จริงของวัตถุดิบ / Food Fraud', 'Authenticity / Food Fraud Vulnerability', 'SAFETY_QUALITY',
   ARRAY['authenticity'], 8, 4,
   '[{"score":4,"label":"มีระบบควบคุม + หลักฐานยืนยัน"},{"score":3,"label":"มีระบบควบคุมแต่หลักฐานบางส่วน"},{"score":2,"label":"ควบคุมบางส่วน"},{"score":1,"label":"มีแผนแต่ยังไม่ปฏิบัติ"},{"score":0,"label":"ไม่มีระบบควบคุม"}]'::jsonb,
   7),
  ('rm_primary_pk', 'SQ08', 'การปฏิบัติตามกฎหมาย / อย. / ใบอนุญาต', 'Legality / Regulatory Compliance (FDA/อย.)', 'SAFETY_QUALITY',
   ARRAY['legality'], 8, 4,
   '[{"score":4,"label":"ครบถ้วน ไม่มีปัญหา"},{"score":3,"label":"ครบถ้วน มี minor gap"},{"score":2,"label":"มีช่องว่างที่ต้องแก้ไข"},{"score":1,"label":"มีการฝ่าฝืนเล็กน้อย"},{"score":0,"label":"ไม่ถูกต้อง / มีการฝ่าฝืน"}]'::jsonb,
   8),
  ('rm_primary_pk', 'SQ09', 'ข้อร้องเรียนจากลูกค้าที่เกี่ยวข้องกับผู้จัดจำหน่าย', 'Customer Complaints Attributable to Supplier', 'SAFETY_QUALITY',
   ARRAY['quality'], 6, 4,
   '[{"score":4,"label":"ไม่มีข้อร้องเรียน"},{"score":3,"label":"1 เรื่อง (minor)"},{"score":2,"label":"2-3 เรื่อง"},{"score":1,"label":"4+ เรื่อง หรือ 1 serious"},{"score":0,"label":"ข้อร้องเรียนร้ายแรง / recall"}]'::jsonb,
   9),
  ('rm_primary_pk', 'SQ10', 'การตอบสนองต่อการเปลี่ยนแปลง / ความเสี่ยงใหม่ (3.5.1.3)', 'Response to Changes & Emerging Risks', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 6, 4,
   '[{"score":4,"label":"แจ้งทุกการเปลี่ยนแปลงตรงเวลา"},{"score":3,"label":"แจ้งส่วนใหญ่ตรงเวลา"},{"score":2,"label":"แจ้งล่าช้าบ่อย"},{"score":1,"label":"ไม่แจ้งบางรายการ"},{"score":0,"label":"ไม่แจ้งการเปลี่ยนแปลง"}]'::jsonb,
   10)
ON CONFLICT DO NOTHING;

-- Final weights for rm_primary_pk:
--   Safety & Quality: 12+10+12+8+6+8+8+8+6+6 = 84
--   Commercial:       8+4+4 = 16
--   Total: 100, Safety ≥ 60% ✓

-- ────────────────────────────────────────────────────────────
-- P0-2: Weight validation function — block save if total ≠ 100
--   or Safety & Quality < 60%
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION spr.fn_validate_criteria_weights(p_category text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_total numeric := 0;
  v_safety numeric := 0;
  v_commercial numeric := 0;
  v_safety_pct numeric;
  v_errors text[] := '{}';
BEGIN
  SELECT
    COALESCE(SUM(weight), 0),
    COALESCE(SUM(CASE WHEN criterion_group = 'SAFETY_QUALITY' THEN weight ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN criterion_group = 'COMMERCIAL' THEN weight ELSE 0 END), 0)
  INTO v_total, v_safety, v_commercial
  FROM spr.review_criteria
  WHERE supplier_category = p_category AND active = true;

  IF v_total != 100 THEN
    v_errors := array_append(v_errors,
      'Total weight must equal 100% (currently ' || v_total || '%)');
  END IF;

  IF v_total > 0 THEN
    v_safety_pct := (v_safety / v_total) * 100;
    IF v_safety_pct < 60 THEN
      v_errors := array_append(v_errors,
        'Safety & Quality weight must be ≥ 60% (currently ' || ROUND(v_safety_pct, 1) || '%)');
    END IF;
  END IF;

  -- Check BSAQ coverage
  DECLARE
    v_bsaq_result jsonb;
  BEGIN
    v_bsaq_result := spr.fn_check_bsaq_coverage(p_category);
    IF NOT (v_bsaq_result->>'valid')::boolean THEN
      v_errors := array_append(v_errors, v_bsaq_result->>'message');
    END IF;
  END;

  IF array_length(v_errors, 1) > 0 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'total', v_total,
      'safety_quality', v_safety,
      'commercial', v_commercial,
      'safety_pct', CASE WHEN v_total > 0 THEN ROUND((v_safety / v_total) * 100, 1) ELSE 0 END,
      'errors', to_jsonb(v_errors)
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'total', v_total,
    'safety_quality', v_safety,
    'commercial', v_commercial,
    'safety_pct', ROUND((v_safety / v_total) * 100, 1)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- P0-4 / P0-5 / P0-7 / P0-8: Enhanced knockout evaluation
--   - Computed knock-out flags (not manual checkboxes)
--   - N/A support for non-applicable rules
--   - Reject rate auto-calculation
--   - Detail text with evidence values
--   - Approval method drives applicability
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION spr.fn_evaluate_knockouts(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_review   spr.supplier_review;
  v_kpi      jsonb;
  v_rule     record;
  v_passed   boolean;
  v_detail   text;
  v_na       boolean;
  v_any_fail boolean := false;
  v_approval_method text;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  SELECT data INTO v_kpi
  FROM spr.supplier_review_kpi_snapshot
  WHERE review_id = p_review_id;

  IF v_kpi IS NULL THEN v_kpi := '{}'::jsonb; END IF;

  v_approval_method := COALESCE(v_kpi->>'approval_method', '');

  -- P0-7: Auto-calculate reject rate if lots data is present
  IF (v_kpi->>'lots_received') IS NOT NULL
     AND (v_kpi->>'lots_received')::numeric > 0
     AND (v_kpi->>'lots_rejected') IS NOT NULL THEN
    v_kpi := v_kpi || jsonb_build_object(
      'reject_rate', ROUND(((v_kpi->>'lots_rejected')::numeric / (v_kpi->>'lots_received')::numeric) * 100, 2)
    );
    -- Also update the stored snapshot with computed reject_rate
    UPDATE spr.supplier_review_kpi_snapshot
    SET data = v_kpi
    WHERE review_id = p_review_id;
  END IF;

  -- P0-4: Compute derived flags from data
  -- cert_expired: cert_expiry_date < review period_end
  IF (v_kpi->>'cert_expiry_date') IS NOT NULL THEN
    IF (v_kpi->>'cert_expiry_date')::date < v_review.period_end THEN
      v_kpi := v_kpi || '{"cert_expired": true}'::jsonb;
    ELSE
      v_kpi := v_kpi || '{"cert_expired": false}'::jsonb;
    END IF;
  END IF;

  -- traceability_overdue: approval = QUESTIONNAIRE and (traceability_last_date + 3yr < period_end OR result = FAIL)
  IF v_approval_method = 'QUESTIONNAIRE' THEN
    IF (v_kpi->>'traceability_last_date') IS NOT NULL
       AND ((v_kpi->>'traceability_last_date')::date + interval '3 years' < v_review.period_end) THEN
      v_kpi := v_kpi || '{"traceability_overdue": true}'::jsonb;
    ELSIF (v_kpi->>'traceability_result') = 'FAIL' THEN
      v_kpi := v_kpi || '{"traceability_overdue": true}'::jsonb;
    ELSE
      v_kpi := v_kpi || '{"traceability_overdue": false}'::jsonb;
    END IF;
  END IF;

  -- questionnaire_over_3yr: questionnaire_issue_date + 3yr < period_end
  -- (already handled in knockout logic below)

  -- critical_incident_open_capa: ncr_critical_count > 0 AND capa_overdue > 0
  IF COALESCE((v_kpi->>'ncr_critical_count')::int, 0) > 0
     AND COALESCE((v_kpi->>'capa_overdue')::int, 0) > 0 THEN
    v_kpi := v_kpi || '{"critical_incident_open_capa": true}'::jsonb;
  ELSE
    v_kpi := v_kpi || '{"critical_incident_open_capa": false}'::jsonb;
  END IF;

  -- Update snapshot with computed values
  UPDATE spr.supplier_review_kpi_snapshot SET data = v_kpi WHERE review_id = p_review_id;

  -- Delete old results and re-evaluate
  DELETE FROM spr.supplier_review_knockout WHERE review_id = p_review_id;

  FOR v_rule IN
    SELECT * FROM spr.knockout_rule
    WHERE active = true
    ORDER BY sort_order
  LOOP
    v_passed := true;
    v_detail := NULL;
    v_na := false;

    CASE v_rule.code
      WHEN 'CERT_EXPIRED_NO_ALT' THEN
        IF (v_kpi->>'cert_expired')::boolean IS TRUE
           AND (v_kpi->>'cert_directory_verified')::boolean IS NOT TRUE THEN
          v_passed := false;
          v_detail := 'Cert expired ' || COALESCE(v_kpi->>'cert_expiry_date', 'N/A')
            || ', directory not verified';
        ELSIF (v_kpi->>'cert_expired')::boolean IS TRUE THEN
          v_detail := 'Cert expired ' || COALESCE(v_kpi->>'cert_expiry_date', 'N/A')
            || ' but directory verified';
        ELSE
          v_detail := 'Cert valid until ' || COALESCE(v_kpi->>'cert_expiry_date', 'N/A');
        END IF;

      WHEN 'QUESTIONNAIRE_3YR' THEN
        IF v_approval_method != 'QUESTIONNAIRE' THEN
          v_na := true;
          v_detail := 'N/A — approval method: ' || COALESCE(v_approval_method, 'not set');
        ELSIF v_kpi->>'questionnaire_issue_date' IS NOT NULL THEN
          DECLARE
            v_q_date date := (v_kpi->>'questionnaire_issue_date')::date;
            v_years numeric := ROUND(EXTRACT(EPOCH FROM (v_review.period_end - v_q_date)) / 86400 / 365.25, 1);
          BEGIN
            IF v_q_date + interval '3 years' < v_review.period_end THEN
              v_passed := false;
              v_detail := 'Questionnaire issued ' || v_q_date || ' → ' || v_years || ' yrs';
            ELSE
              v_detail := 'Questionnaire issued ' || v_q_date || ' → ' || v_years || ' yrs (within 3yr)';
            END IF;
          END;
        ELSE
          v_detail := 'No questionnaire issue date recorded';
        END IF;

      WHEN 'TRACEABILITY_OVERDUE' THEN
        IF v_approval_method != 'QUESTIONNAIRE' THEN
          v_na := true;
          v_detail := 'N/A — approval method: ' || COALESCE(v_approval_method, 'not set');
        ELSIF (v_kpi->>'traceability_overdue')::boolean IS TRUE THEN
          v_passed := false;
          v_detail := 'Traceability overdue: last test ' || COALESCE(v_kpi->>'traceability_last_date', 'N/A')
            || ', result: ' || COALESCE(v_kpi->>'traceability_result', 'N/A');
        ELSE
          v_detail := 'Traceability OK: last test ' || COALESCE(v_kpi->>'traceability_last_date', 'N/A')
            || ', result: ' || COALESCE(v_kpi->>'traceability_result', 'N/A');
        END IF;

      WHEN 'CRITICAL_INCIDENT_OPEN_CAPA' THEN
        IF (v_kpi->>'critical_incident_open_capa')::boolean IS TRUE THEN
          v_passed := false;
          v_detail := 'Critical NCR: ' || COALESCE(v_kpi->>'ncr_critical_count', '0')
            || ', CAPA overdue: ' || COALESCE(v_kpi->>'capa_overdue', '0');
        ELSE
          v_detail := 'Critical NCR: ' || COALESCE(v_kpi->>'ncr_critical_count', '0')
            || ', CAPA overdue: ' || COALESCE(v_kpi->>'capa_overdue', '0');
        END IF;

      WHEN 'OUTSOURCED_NO_CUSTOMER_APPROVAL' THEN
        IF v_review.supplier_category NOT IN ('outsourced_processor') THEN
          v_na := true;
          v_detail := 'N/A — category: ' || COALESCE(v_review.supplier_category, 'not set');
        ELSIF (v_kpi->>'customer_approval_obtained')::boolean IS NOT TRUE THEN
          v_passed := false;
          v_detail := 'Outsourced processor without customer approval';
        ELSE
          v_detail := 'Customer approval obtained';
        END IF;

      ELSE
        NULL;
    END CASE;

    -- For N/A rules, store as passed with N/A indicator in detail
    INSERT INTO spr.supplier_review_knockout(review_id, rule_id, passed, detail)
    VALUES (p_review_id, v_rule.id,
      CASE WHEN v_na THEN true ELSE v_passed END,
      CASE WHEN v_na THEN 'N/A' || COALESCE(' — ' || v_detail, '') ELSE v_detail END
    );

    IF NOT v_passed AND NOT v_na THEN v_any_fail := true; END IF;
  END LOOP;

  UPDATE spr.supplier_review
  SET knockout_failed = v_any_fail, updated_at = now()
  WHERE id = p_review_id;

  RETURN jsonb_build_object(
    'knockout_failed', v_any_fail,
    'results', (
      SELECT jsonb_agg(jsonb_build_object(
        'rule_code', kr.code,
        'passed', sk.passed,
        'detail', sk.detail
      ))
      FROM spr.supplier_review_knockout sk
      JOIN spr.knockout_rule kr ON kr.id = sk.rule_id
      WHERE sk.review_id = p_review_id
    )
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- P0-9: Submission gate — server-side validation
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION spr.fn_submit_review(p_review_id uuid, p_reviewer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_review       spr.supplier_review;
  v_missing      text[] := '{}';
  v_total_crit   int;
  v_scored_crit  int;
  v_has_knockouts boolean;
  v_unscored_override int;
  v_grade_cd     boolean;
  v_action_count int;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  IF v_review.status != 'DRAFT' AND v_review.status != 'RETURNED' THEN
    RETURN jsonb_build_object('error', 'Review must be in DRAFT or RETURNED status to submit');
  END IF;

  IF v_review.locked THEN
    RETURN jsonb_build_object('error', 'Review is locked');
  END IF;

  -- Check all criteria scored
  SELECT COUNT(*) INTO v_total_crit
  FROM spr.review_criteria
  WHERE supplier_category = v_review.supplier_category AND active = true;

  SELECT COUNT(*) INTO v_scored_crit
  FROM spr.supplier_review_score
  WHERE review_id = p_review_id AND final_score IS NOT NULL;

  IF v_scored_crit < v_total_crit THEN
    v_missing := array_append(v_missing,
      'ให้คะแนนยังไม่ครบ: scored ' || v_scored_crit || '/' || v_total_crit || ' criteria');
  END IF;

  -- Check scores that differ from auto_score have comments
  SELECT COUNT(*) INTO v_unscored_override
  FROM spr.supplier_review_score
  WHERE review_id = p_review_id
    AND auto_score IS NOT NULL
    AND final_score IS NOT NULL
    AND final_score != auto_score
    AND (override_comment IS NULL OR override_comment = '');

  IF v_unscored_override > 0 THEN
    v_missing := array_append(v_missing,
      'มีคะแนนที่ต่างจาก auto-score ' || v_unscored_override || ' รายการที่ยังไม่มีความคิดเห็น');
  END IF;

  -- Check score calculated
  IF v_review.final_score IS NULL THEN
    v_missing := array_append(v_missing, 'ยังไม่ได้คำนวณคะแนน');
  END IF;

  -- Check knockouts evaluated
  SELECT EXISTS(
    SELECT 1 FROM spr.supplier_review_knockout WHERE review_id = p_review_id
  ) INTO v_has_knockouts;

  IF NOT v_has_knockouts THEN
    v_missing := array_append(v_missing, 'ยังไม่ได้ตรวจสอบ Knockout');
  END IF;

  -- Check Grade C/D requires at least one action item with owner + due date
  v_grade_cd := v_review.grade IN ('C', 'D');
  IF v_grade_cd THEN
    SELECT COUNT(*) INTO v_action_count
    FROM spr.supplier_review_action
    WHERE review_id = p_review_id
      AND owner_id IS NOT NULL
      AND due_date IS NOT NULL;

    IF v_action_count = 0 THEN
      v_missing := array_append(v_missing,
        'เกรด C/D ต้องมีรายการดำเนินการอย่างน้อย 1 รายการ พร้อมผู้รับผิดชอบและวันครบกำหนด');
    END IF;
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing', to_jsonb(v_missing));
  END IF;

  -- All checks passed — submit
  UPDATE spr.supplier_review SET
    status = 'SUBMITTED',
    reviewer_id = p_reviewer_id,
    submitted_at = now(),
    updated_at = now()
  WHERE id = p_review_id;

  RETURN jsonb_build_object('valid', true, 'status', 'SUBMITTED');
END;
$$;

-- ────────────────────────────────────────────────────────────
-- P0-10: Fix approve function — accept SUBMITTED status
--   (original required REVIEWED but frontend submits from SUBMITTED)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION spr.fn_approve_review(p_review_id uuid, p_approver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_review      spr.supplier_review;
  v_grade_info  jsonb;
  v_grade       text;
  v_outcome     text;
  v_next_months int;
  v_next_due    date;
  v_old_status  record;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  IF v_review.locked THEN
    RETURN jsonb_build_object('error', 'Review is already locked/approved');
  END IF;

  -- Accept SUBMITTED status (not REVIEWED — the workflow goes DRAFT→SUBMITTED→APPROVED)
  IF v_review.status != 'SUBMITTED' THEN
    RETURN jsonb_build_object('error', 'Review must be in SUBMITTED status to approve');
  END IF;

  -- Reviewer cannot approve own review
  IF v_review.reviewer_id = p_approver_id THEN
    RETURN jsonb_build_object('error', 'Reviewer cannot approve their own review');
  END IF;

  -- Calculate final score
  PERFORM spr.fn_calc_review_score(p_review_id);
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;

  -- Evaluate knockouts
  PERFORM spr.fn_evaluate_knockouts(p_review_id);
  SELECT knockout_failed INTO v_review.knockout_failed
  FROM spr.supplier_review WHERE id = p_review_id;

  -- Determine grade
  v_grade_info := spr.fn_determine_grade(v_review.final_score, v_review.supplier_category, v_review.knockout_failed);
  v_grade := v_grade_info->>'grade';
  v_outcome := v_grade_info->>'outcome';
  v_next_months := COALESCE((v_grade_info->>'next_review_months')::int, 12);

  v_next_due := v_review.period_end + (v_next_months || ' months')::interval;

  IF v_review.risk_adjusted AND v_review.new_risk_level IS NOT NULL THEN
    SELECT months INTO v_next_months
    FROM spr.review_frequency_config
    WHERE risk_level = v_review.new_risk_level;

    IF FOUND THEN
      v_next_due := v_review.period_end + (v_next_months || ' months')::interval;
    END IF;
  END IF;

  UPDATE spr.supplier_review SET
    status = 'APPROVED',
    grade = v_grade,
    outcome = v_outcome,
    locked = true,
    approver_id = p_approver_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = p_review_id;

  SELECT grade AS old_grade, outcome AS old_outcome
  INTO v_old_status
  FROM spr.supplier_review_status
  WHERE supplier_id = v_review.supplier_id;

  INSERT INTO spr.supplier_review_status(supplier_id, risk_level, last_review_id, grade, outcome, next_review_due_date, tenant_id)
  VALUES (
    v_review.supplier_id,
    COALESCE(v_review.new_risk_level, v_review.risk_level_at_review),
    p_review_id,
    v_grade,
    v_outcome,
    v_next_due,
    v_review.tenant_id
  )
  ON CONFLICT (supplier_id) DO UPDATE SET
    risk_level = EXCLUDED.risk_level,
    last_review_id = EXCLUDED.last_review_id,
    grade = EXCLUDED.grade,
    outcome = EXCLUDED.outcome,
    next_review_due_date = EXCLUDED.next_review_due_date,
    updated_at = now();

  INSERT INTO spr.supplier_status_history(supplier_id, old_status, new_status, old_grade, new_grade, source_review_id, changed_by, reason, tenant_id)
  VALUES (
    v_review.supplier_id,
    v_old_status.old_outcome,
    v_outcome,
    v_old_status.old_grade,
    v_grade,
    p_review_id,
    p_approver_id,
    'Annual review approved: Grade ' || v_grade || ' (' || v_outcome || ')',
    v_review.tenant_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'grade', v_grade,
    'outcome', v_outcome,
    'final_score', v_review.final_score,
    'knockout_failed', v_review.knockout_failed,
    'next_review_due_date', v_next_due
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- P0-11: Add CRITICAL to frequency config (existing data has
--   risk_level = 'critical' but seed already covers it)
--   Ensure it exists with shorter default
-- ────────────────────────────────────────────────────────────
UPDATE spr.review_frequency_config
SET months = 3, max_months = 6
WHERE risk_level = 'critical';

-- If for some reason it doesn't exist yet:
INSERT INTO spr.review_frequency_config (risk_level, months, max_months)
VALUES ('critical', 3, 6)
ON CONFLICT (risk_level) DO NOTHING;
