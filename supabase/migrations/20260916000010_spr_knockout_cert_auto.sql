-- ============================================================
-- SPR Migration 010: Auto-populate certificate data from
-- public.supplier_certificates into KPI snapshot for knockout
-- evaluation. READ-ONLY on public schema objects.
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) fn_populate_cert_snapshot: reads public.supplier_certificates
--    via spr.fn_read_certificates, writes to spr KPI snapshot
CREATE OR REPLACE FUNCTION spr.fn_populate_cert_snapshot(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
DECLARE
  v_review      spr.supplier_review;
  v_kpi         jsonb;
  v_snapshot_id uuid;
  v_gfsi_cert   record;
  v_gfsi_found  boolean := false;
  v_all_certs   jsonb := '[]'::jsonb;
  v_cert        record;
  v_changes     jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  -- Get or create KPI snapshot
  SELECT id, data INTO v_snapshot_id, v_kpi
  FROM spr.supplier_review_kpi_snapshot
  WHERE review_id = p_review_id;

  IF v_snapshot_id IS NULL THEN
    INSERT INTO spr.supplier_review_kpi_snapshot (review_id, data, collected_at)
    VALUES (p_review_id, '{}'::jsonb, now())
    RETURNING id, data INTO v_snapshot_id, v_kpi;
  END IF;

  IF v_kpi IS NULL THEN v_kpi := '{}'::jsonb; END IF;

  -- Find GFSI/BRCGS certificate (closest expiry after period_end, or latest if all expired)
  SELECT c.certificate_type, c.certificate_no, c.issued_by,
         c.issued_date, c.expiry_date, c.file_url
  INTO v_gfsi_cert
  FROM public.supplier_certificates c
  WHERE c.supplier_id = v_review.supplier_id
    AND c.certificate_type ILIKE '%GFSI%'
  ORDER BY
    CASE WHEN c.expiry_date >= v_review.period_end THEN 0 ELSE 1 END,
    c.expiry_date DESC NULLS LAST
  LIMIT 1;

  v_gfsi_found := FOUND;

  IF v_gfsi_found THEN
    v_changes := v_changes || jsonb_build_object(
      'cert_expiry_date', v_gfsi_cert.expiry_date,
      'cert_type', v_gfsi_cert.certificate_type,
      'cert_no', v_gfsi_cert.certificate_no,
      'cert_issued_by', v_gfsi_cert.issued_by,
      'cert_issued_date', v_gfsi_cert.issued_date,
      'cert_file_url', v_gfsi_cert.file_url,
      'cert_source', 'auto:supplier_certificates'
    );
  END IF;

  -- Build summary of ALL certificates for this supplier
  FOR v_cert IN
    SELECT c.certificate_type, c.certificate_no, c.expiry_date,
           c.issued_by,
           CASE WHEN c.expiry_date IS NULL THEN 'unknown'
                WHEN c.expiry_date < v_review.period_end THEN 'expired'
                ELSE 'valid' END AS status
    FROM public.supplier_certificates c
    WHERE c.supplier_id = v_review.supplier_id
    ORDER BY c.expiry_date DESC NULLS LAST
  LOOP
    v_all_certs := v_all_certs || jsonb_build_object(
      'type', v_cert.certificate_type,
      'no', v_cert.certificate_no,
      'expiry', v_cert.expiry_date,
      'issued_by', v_cert.issued_by,
      'status', v_cert.status
    );
  END LOOP;

  IF jsonb_array_length(v_all_certs) > 0 THEN
    v_changes := v_changes || jsonb_build_object(
      'certificates', v_all_certs,
      'cert_count', jsonb_array_length(v_all_certs),
      'cert_populated_at', now()
    );
  END IF;

  -- Merge changes into snapshot
  IF v_changes != '{}'::jsonb THEN
    v_kpi := v_kpi || v_changes;
    UPDATE spr.supplier_review_kpi_snapshot
    SET data = v_kpi, collected_at = now()
    WHERE id = v_snapshot_id;
  END IF;

  RETURN jsonb_build_object(
    'populated', v_changes != '{}'::jsonb,
    'gfsi_found', v_gfsi_found,
    'cert_count', jsonb_array_length(v_all_certs),
    'cert_expiry_date', v_gfsi_cert.expiry_date
  );
END;
$$;

-- 2) Recreate fn_evaluate_knockouts to call fn_populate_cert_snapshot first
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

  -- Auto-populate certificate data from supplier_certificates
  PERFORM spr.fn_populate_cert_snapshot(p_review_id);

  SELECT data INTO v_kpi
  FROM spr.supplier_review_kpi_snapshot
  WHERE review_id = p_review_id;

  IF v_kpi IS NULL THEN v_kpi := '{}'::jsonb; END IF;

  v_approval_method := COALESCE(v_kpi->>'approval_method', '');

  -- Auto-calculate reject rate if lots data is present
  IF (v_kpi->>'lots_received') IS NOT NULL
     AND (v_kpi->>'lots_received')::numeric > 0
     AND (v_kpi->>'lots_rejected') IS NOT NULL THEN
    v_kpi := v_kpi || jsonb_build_object(
      'reject_rate', ROUND(((v_kpi->>'lots_rejected')::numeric / (v_kpi->>'lots_received')::numeric) * 100, 2)
    );
    UPDATE spr.supplier_review_kpi_snapshot
    SET data = v_kpi
    WHERE review_id = p_review_id;
  END IF;

  -- Compute derived flags
  IF (v_kpi->>'cert_expiry_date') IS NOT NULL THEN
    IF (v_kpi->>'cert_expiry_date')::date < v_review.period_end THEN
      v_kpi := v_kpi || '{"cert_expired": true}'::jsonb;
    ELSE
      v_kpi := v_kpi || '{"cert_expired": false}'::jsonb;
    END IF;
  END IF;

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

  IF COALESCE((v_kpi->>'ncr_critical_count')::int, 0) > 0
     AND COALESCE((v_kpi->>'capa_overdue')::int, 0) > 0 THEN
    v_kpi := v_kpi || '{"critical_incident_open_capa": true}'::jsonb;
  ELSE
    v_kpi := v_kpi || '{"critical_incident_open_capa": false}'::jsonb;
  END IF;

  UPDATE spr.supplier_review_kpi_snapshot SET data = v_kpi WHERE review_id = p_review_id;

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
        IF (v_kpi->>'cert_source') IS NULL THEN
          v_detail := 'ไม่พบใบรับรอง GFSI ในระบบ — กรุณาอัปโหลดใบรับรอง';
        ELSIF (v_kpi->>'cert_expiry_date') IS NULL THEN
          v_detail := 'พบใบรับรอง ' || COALESCE(v_kpi->>'cert_type', 'GFSI')
            || ' แต่ยังไม่ได้บันทึกวันหมดอายุ (ดึงจากระบบอัตโนมัติ)';
        ELSIF (v_kpi->>'cert_expired')::boolean IS TRUE
           AND (v_kpi->>'cert_directory_verified')::boolean IS NOT TRUE THEN
          v_passed := false;
          v_detail := 'ใบรับรองหมดอายุ ' || v_kpi->>'cert_expiry_date'
            || ' (' || COALESCE(v_kpi->>'cert_type', '') || ')'
            || ' — ไม่ได้ verify จาก Directory';
        ELSIF (v_kpi->>'cert_expired')::boolean IS TRUE THEN
          v_detail := 'ใบรับรองหมดอายุ ' || v_kpi->>'cert_expiry_date'
            || ' แต่ verify จาก Directory แล้ว';
        ELSE
          v_detail := 'ใบรับรองยังไม่หมดอายุ (' || COALESCE(v_kpi->>'cert_type', '') || ')'
            || ' ถึง ' || v_kpi->>'cert_expiry_date'
            || ' (ดึงจากระบบอัตโนมัติ)';
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
          v_detail := 'Traceability overdue: last test ' || COALESCE(v_kpi->>'traceability_last_date', '-')
            || ', result: ' || COALESCE(v_kpi->>'traceability_result', '-');
        ELSE
          v_detail := 'Traceability OK: last test ' || COALESCE(v_kpi->>'traceability_last_date', '-')
            || ', result: ' || COALESCE(v_kpi->>'traceability_result', '-');
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
    'cert_auto_populated', true,
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
