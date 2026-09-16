-- ============================================================
-- SPR Migration 004: Scoring, Knockout & Workflow Functions
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Calculate weighted review score
--    Single source of truth — frontend only displays the result.
CREATE OR REPLACE FUNCTION spr.fn_calc_review_score(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_total_weighted numeric := 0;
  v_total_weight   numeric := 0;
  v_safety_score   numeric := 0;
  v_safety_weight  numeric := 0;
  v_comm_score     numeric := 0;
  v_comm_weight    numeric := 0;
  v_final_pct      numeric;
  v_review         spr.supplier_review;
  rec              record;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  FOR rec IN
    SELECT s.final_score, s.weight_snapshot, c.criterion_group, c.scale_max
    FROM spr.supplier_review_score s
    JOIN spr.review_criteria c ON c.id = s.criterion_id
    WHERE s.review_id = p_review_id
      AND s.final_score IS NOT NULL
  LOOP
    -- Normalize score to 0-100 scale
    DECLARE
      v_norm numeric := (rec.final_score / rec.scale_max) * 100;
    BEGIN
      IF rec.criterion_group = 'SAFETY_QUALITY' THEN
        v_safety_score := v_safety_score + (v_norm * rec.weight_snapshot);
        v_safety_weight := v_safety_weight + rec.weight_snapshot;
      ELSE
        v_comm_score := v_comm_score + (v_norm * rec.weight_snapshot);
        v_comm_weight := v_comm_weight + rec.weight_snapshot;
      END IF;
      v_total_weighted := v_total_weighted + (v_norm * rec.weight_snapshot);
      v_total_weight := v_total_weight + rec.weight_snapshot;
    END;
  END LOOP;

  IF v_total_weight > 0 THEN
    v_final_pct := ROUND(v_total_weighted / v_total_weight, 2);
  ELSE
    v_final_pct := 0;
  END IF;

  -- Update the review record
  UPDATE spr.supplier_review
  SET final_score = v_final_pct, updated_at = now()
  WHERE id = p_review_id;

  RETURN jsonb_build_object(
    'final_score', v_final_pct,
    'safety_score', CASE WHEN v_safety_weight > 0 THEN ROUND(v_safety_score / v_safety_weight, 2) ELSE 0 END,
    'safety_weight_pct', CASE WHEN v_total_weight > 0 THEN ROUND((v_safety_weight / v_total_weight) * 100, 2) ELSE 0 END,
    'commercial_score', CASE WHEN v_comm_weight > 0 THEN ROUND(v_comm_score / v_comm_weight, 2) ELSE 0 END,
    'commercial_weight_pct', CASE WHEN v_total_weight > 0 THEN ROUND((v_comm_weight / v_total_weight) * 100, 2) ELSE 0 END
  );
END;
$$;

-- 2) Evaluate all knockout rules for a review
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
  v_any_fail boolean := false;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  -- Get KPI snapshot
  SELECT data INTO v_kpi
  FROM spr.supplier_review_kpi_snapshot
  WHERE review_id = p_review_id;

  IF v_kpi IS NULL THEN v_kpi := '{}'::jsonb; END IF;

  -- Delete old results and re-evaluate
  DELETE FROM spr.supplier_review_knockout WHERE review_id = p_review_id;

  FOR v_rule IN
    SELECT * FROM spr.knockout_rule
    WHERE active = true
      AND (applies_to_categories = '{}' OR v_review.supplier_category = ANY(applies_to_categories))
    ORDER BY sort_order
  LOOP
    v_passed := true;
    v_detail := NULL;

    -- Check each rule based on its code
    CASE v_rule.code
      WHEN 'CERT_EXPIRED_NO_ALT' THEN
        IF (v_kpi->>'cert_expired')::boolean IS TRUE
           AND (v_kpi->>'cert_directory_verified')::boolean IS NOT TRUE THEN
          v_passed := false;
          v_detail := 'GFSI/BRCGS certification expired or not directory-verified';
        END IF;

      WHEN 'QUESTIONNAIRE_3YR' THEN
        IF v_kpi->>'questionnaire_issue_date' IS NOT NULL THEN
          IF (v_kpi->>'questionnaire_issue_date')::date + interval '3 years' < CURRENT_DATE THEN
            v_passed := false;
            v_detail := 'Questionnaire approval >= 3 years old without reissue';
          END IF;
        END IF;

      WHEN 'TRACEABILITY_OVERDUE' THEN
        IF (v_kpi->>'traceability_overdue')::boolean IS TRUE THEN
          v_passed := false;
          v_detail := 'Traceability verification overdue or failed';
        END IF;

      WHEN 'CRITICAL_INCIDENT_OPEN_CAPA' THEN
        IF (v_kpi->>'critical_incident_open_capa')::boolean IS TRUE THEN
          v_passed := false;
          v_detail := 'Critical food safety incident with CAPA not closed';
        END IF;

      WHEN 'OUTSOURCED_NO_CUSTOMER_APPROVAL' THEN
        IF v_review.supplier_category IN ('outsourced_processor')
           AND (v_kpi->>'customer_approval_obtained')::boolean IS NOT TRUE THEN
          v_passed := false;
          v_detail := 'Outsourced processor without customer approval';
        END IF;

      ELSE
        -- Unknown rule code — skip (pass by default)
        NULL;
    END CASE;

    INSERT INTO spr.supplier_review_knockout(review_id, rule_id, passed, detail)
    VALUES (p_review_id, v_rule.id, v_passed, v_detail);

    IF NOT v_passed THEN v_any_fail := true; END IF;
  END LOOP;

  -- Update review
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

-- 3) Determine grade from score + thresholds
CREATE OR REPLACE FUNCTION spr.fn_determine_grade(
  p_score numeric,
  p_category text DEFAULT NULL,
  p_knockout_failed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_threshold record;
BEGIN
  -- If knockout failed, force grade D / Suspended
  IF p_knockout_failed THEN
    SELECT * INTO v_threshold
    FROM spr.grade_threshold
    WHERE grade = 'D'
      AND (supplier_category = p_category OR supplier_category IS NULL)
    ORDER BY (supplier_category IS NOT NULL) DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('grade', 'D', 'outcome', v_threshold.outcome,
        'next_review_months', v_threshold.next_review_months, 'actions', v_threshold.actions);
    ELSE
      RETURN jsonb_build_object('grade', 'D', 'outcome', 'Suspended', 'next_review_months', 6);
    END IF;
  END IF;

  -- Find matching threshold (category-specific first, then default)
  SELECT * INTO v_threshold
  FROM spr.grade_threshold
  WHERE p_score >= min_score
    AND (supplier_category = p_category OR supplier_category IS NULL)
  ORDER BY (supplier_category IS NOT NULL) DESC, min_score DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('grade', v_threshold.grade, 'outcome', v_threshold.outcome,
      'next_review_months', v_threshold.next_review_months, 'actions', v_threshold.actions);
  ELSE
    RETURN jsonb_build_object('grade', 'D', 'outcome', 'Disapproved', 'next_review_months', 6);
  END IF;
END;
$$;

-- 4) Approve review — locks it, sets grade/outcome, updates status
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

  -- Check not already locked
  IF v_review.locked THEN
    RETURN jsonb_build_object('error', 'Review is already locked/approved');
  END IF;

  -- Check status is REVIEWED
  IF v_review.status != 'REVIEWED' THEN
    RETURN jsonb_build_object('error', 'Review must be in REVIEWED status to approve');
  END IF;

  -- Reviewer cannot approve own review
  IF v_review.reviewer_id = p_approver_id THEN
    RETURN jsonb_build_object('error', 'Reviewer cannot approve their own review');
  END IF;

  -- Calculate final score
  PERFORM spr.fn_calc_review_score(p_review_id);

  -- Re-fetch after score update
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

  -- Calculate next due date
  v_next_due := v_review.period_end + (v_next_months || ' months')::interval;

  -- If risk was adjusted during review, use new risk level for frequency
  IF v_review.risk_adjusted AND v_review.new_risk_level IS NOT NULL THEN
    SELECT months INTO v_next_months
    FROM spr.review_frequency_config
    WHERE risk_level = v_review.new_risk_level;

    IF FOUND THEN
      v_next_due := v_review.period_end + (v_next_months || ' months')::interval;
    END IF;
  END IF;

  -- Lock and approve the review
  UPDATE spr.supplier_review SET
    status = 'APPROVED',
    grade = v_grade,
    outcome = v_outcome,
    locked = true,
    approver_id = p_approver_id,
    approved_at = now(),
    updated_at = now()
  WHERE id = p_review_id;

  -- Get old status for history
  SELECT grade AS old_grade, outcome AS old_outcome
  INTO v_old_status
  FROM spr.supplier_review_status
  WHERE supplier_id = v_review.supplier_id;

  -- Upsert supplier_review_status
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

  -- Record status history
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

-- 5) Create a revision of a locked review
CREATE OR REPLACE FUNCTION spr.fn_create_revision(p_review_id uuid, p_reason text, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_old     spr.supplier_review;
  v_new_id  uuid;
BEGIN
  SELECT * INTO v_old FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review not found'; END IF;
  IF NOT v_old.locked THEN RAISE EXCEPTION 'Only locked reviews can be revised'; END IF;

  INSERT INTO spr.supplier_review(
    supplier_id, review_year, period_start, period_end, due_date,
    risk_level_at_review, supplier_category, status, revision_no,
    parent_review_id, tenant_id, created_by
  ) VALUES (
    v_old.supplier_id, v_old.review_year, v_old.period_start, v_old.period_end,
    v_old.due_date, v_old.risk_level_at_review, v_old.supplier_category,
    'DRAFT', v_old.revision_no + 1, p_review_id, v_old.tenant_id, p_user_id
  ) RETURNING id INTO v_new_id;

  -- Copy scores
  INSERT INTO spr.supplier_review_score(review_id, criterion_id, auto_score, final_score, override_comment, weight_snapshot)
  SELECT v_new_id, criterion_id, auto_score, final_score, override_comment, weight_snapshot
  FROM spr.supplier_review_score WHERE review_id = p_review_id;

  -- Copy KPI snapshot
  INSERT INTO spr.supplier_review_kpi_snapshot(review_id, data, collected_at)
  SELECT v_new_id, data, collected_at
  FROM spr.supplier_review_kpi_snapshot WHERE review_id = p_review_id;

  -- Log the revision
  INSERT INTO spr.audit_log(table_name, record_id, action, new_values, changed_by)
  VALUES ('supplier_review', v_new_id, 'REVISION',
    jsonb_build_object('parent_review_id', p_review_id, 'reason', p_reason, 'revision_no', v_old.revision_no + 1),
    p_user_id);

  RETURN v_new_id;
END;
$$;

-- 6) Weight guard check function
CREATE OR REPLACE FUNCTION spr.fn_check_safety_weight(p_category text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_safety_total numeric := 0;
  v_total        numeric := 0;
  v_safety_pct   numeric;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN criterion_group = 'SAFETY_QUALITY' THEN weight ELSE 0 END), 0),
    COALESCE(SUM(weight), 0)
  INTO v_safety_total, v_total
  FROM spr.review_criteria
  WHERE supplier_category = p_category AND active = true;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('valid', true, 'safety_pct', 0, 'message', 'No criteria configured');
  END IF;

  v_safety_pct := ROUND((v_safety_total / v_total) * 100, 1);

  IF v_safety_pct < 60 THEN
    RETURN jsonb_build_object(
      'valid', false,
      'safety_pct', v_safety_pct,
      'message', 'BRCGS Clause 3.5.1.3: Safety & Quality criteria must be >= 60% (currently ' || v_safety_pct || '%)'
    );
  END IF;

  RETURN jsonb_build_object('valid', true, 'safety_pct', v_safety_pct);
END;
$$;

-- 7) BSAQ tag validation — ensure all 4 tags are covered
CREATE OR REPLACE FUNCTION spr.fn_check_bsaq_coverage(p_category text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_tags text[];
  v_missing text[] := '{}';
  v_required text[] := ARRAY['safety', 'authenticity', 'legality', 'quality'];
  v_tag text;
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT unnest(bsaq_tags)
    FROM spr.review_criteria
    WHERE supplier_category = p_category
      AND active = true
      AND criterion_group = 'SAFETY_QUALITY'
  ) INTO v_tags;

  FOREACH v_tag IN ARRAY v_required LOOP
    IF NOT (v_tag = ANY(v_tags)) THEN
      v_missing := array_append(v_missing, v_tag);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('valid', false, 'missing_tags', v_missing,
      'message', 'Safety criteria must cover: safety, authenticity, legality, quality. Missing: ' || array_to_string(v_missing, ', '));
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;
