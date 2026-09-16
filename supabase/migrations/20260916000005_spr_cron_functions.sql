-- ============================================================
-- SPR Migration 005: Cron / Scheduling Functions
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Generate due reviews — creates DRAFT reviews for suppliers approaching due date
CREATE OR REPLACE FUNCTION spr.fn_generate_due_reviews(p_days_ahead int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_count int := 0;
  v_supplier record;
  v_freq int;
  v_new_id uuid;
BEGIN
  -- Find suppliers with next_review_due_date within p_days_ahead
  -- and no existing DRAFT/SUBMITTED/REVIEWED review for the current year
  FOR v_supplier IN
    SELECT srs.supplier_id, srs.risk_level, srs.next_review_due_date, srs.tenant_id,
           srs.last_review_id
    FROM spr.supplier_review_status srs
    WHERE srs.next_review_due_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
      AND NOT EXISTS (
        SELECT 1 FROM spr.supplier_review sr
        WHERE sr.supplier_id = srs.supplier_id
          AND sr.status IN ('DRAFT', 'SUBMITTED', 'REVIEWED')
          AND sr.review_year = EXTRACT(YEAR FROM CURRENT_DATE)
      )
  LOOP
    -- Get frequency for risk level
    SELECT months INTO v_freq
    FROM spr.review_frequency_config
    WHERE risk_level = COALESCE(v_supplier.risk_level, 'medium');

    IF NOT FOUND THEN v_freq := 12; END IF;

    -- Create draft review
    INSERT INTO spr.supplier_review(
      supplier_id, review_year,
      period_start, period_end, due_date,
      risk_level_at_review, status, tenant_id
    ) VALUES (
      v_supplier.supplier_id,
      EXTRACT(YEAR FROM CURRENT_DATE),
      COALESCE(v_supplier.next_review_due_date - (v_freq || ' months')::interval, CURRENT_DATE - interval '1 year'),
      COALESCE(v_supplier.next_review_due_date, CURRENT_DATE),
      v_supplier.next_review_due_date,
      v_supplier.risk_level,
      'DRAFT',
      v_supplier.tenant_id
    ) RETURNING id INTO v_new_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('generated', v_count);
END;
$$;

-- 2) Send notifications for upcoming / overdue reviews
CREATE OR REPLACE FUNCTION spr.fn_send_review_notifications()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, pg_temp
AS $$
DECLARE
  v_count int := 0;
  v_rec record;
BEGIN
  -- Notify for reviews due in 30 days
  FOR v_rec IN
    SELECT sr.id, sr.supplier_id, sr.due_date, sr.reviewer_id, sr.tenant_id
    FROM spr.supplier_review sr
    WHERE sr.status IN ('DRAFT', 'SUBMITTED')
      AND sr.due_date = CURRENT_DATE + interval '30 days'
  LOOP
    INSERT INTO spr.notifications(user_id, title, message, type, entity_type, entity_id, tenant_id)
    VALUES (v_rec.reviewer_id,
      'Review due in 30 days',
      'Supplier review due on ' || v_rec.due_date,
      'REVIEW_DUE_30', 'supplier_review', v_rec.id, v_rec.tenant_id);
    v_count := v_count + 1;
  END LOOP;

  -- 7 days
  FOR v_rec IN
    SELECT sr.id, sr.supplier_id, sr.due_date, sr.reviewer_id, sr.tenant_id
    FROM spr.supplier_review sr
    WHERE sr.status IN ('DRAFT', 'SUBMITTED')
      AND sr.due_date = CURRENT_DATE + interval '7 days'
  LOOP
    INSERT INTO spr.notifications(user_id, title, message, type, entity_type, entity_id, tenant_id)
    VALUES (v_rec.reviewer_id,
      'Review due in 7 days',
      'Supplier review due on ' || v_rec.due_date,
      'REVIEW_DUE_7', 'supplier_review', v_rec.id, v_rec.tenant_id);
    v_count := v_count + 1;
  END LOOP;

  -- Overdue
  FOR v_rec IN
    SELECT sr.id, sr.supplier_id, sr.due_date, sr.reviewer_id, sr.tenant_id
    FROM spr.supplier_review sr
    WHERE sr.status IN ('DRAFT', 'SUBMITTED', 'REVIEWED')
      AND sr.due_date < CURRENT_DATE
      AND sr.due_date = CURRENT_DATE - interval '1 day' -- only on first overdue day
  LOOP
    INSERT INTO spr.notifications(user_id, title, message, type, entity_type, entity_id, tenant_id)
    VALUES (v_rec.reviewer_id,
      'Review OVERDUE',
      'Supplier review was due on ' || v_rec.due_date || ' and is now overdue',
      'REVIEW_OVERDUE', 'supplier_review', v_rec.id, v_rec.tenant_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('notifications_sent', v_count);
END;
$$;

-- 3) Collect KPIs from existing data for a review
CREATE OR REPLACE FUNCTION spr.fn_collect_review_kpis(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = spr, public, pg_temp
AS $$
DECLARE
  v_review    spr.supplier_review;
  v_kpi       jsonb := '{}'::jsonb;
  v_ncr_count int;
  v_ncr_critical int;
  v_capa_issued int;
  v_capa_closed int;
  v_capa_overdue int;
  v_cert       record;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Review not found'); END IF;

  -- NCR data
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE severity::text = 'critical'),
    COUNT(*) FILTER (WHERE corrective_action IS NOT NULL),
    COUNT(*) FILTER (WHERE status::text = 'closed'),
    COUNT(*) FILTER (WHERE capa_due_date < CURRENT_DATE AND status::text != 'closed')
  INTO v_ncr_count, v_ncr_critical, v_capa_issued, v_capa_closed, v_capa_overdue
  FROM public.supplier_ncrs
  WHERE supplier_id = v_review.supplier_id
    AND detected_date >= v_review.period_start
    AND detected_date <= v_review.period_end;

  v_kpi := v_kpi || jsonb_build_object(
    'ncr_count', v_ncr_count,
    'ncr_critical_count', v_ncr_critical,
    'capa_issued', v_capa_issued,
    'capa_closed', v_capa_closed,
    'capa_overdue', v_capa_overdue
  );

  -- Certificate data (most recent for this supplier)
  SELECT certificate_type, expiry_date,
         CASE WHEN expiry_date < CURRENT_DATE THEN true ELSE false END AS expired
  INTO v_cert
  FROM public.supplier_certificates
  WHERE supplier_id = v_review.supplier_id AND is_primary = true
  ORDER BY expiry_date DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    v_kpi := v_kpi || jsonb_build_object(
      'cert_type', v_cert.certificate_type,
      'cert_expiry_date', v_cert.expiry_date,
      'cert_expired', v_cert.expired
    );
  ELSE
    v_kpi := v_kpi || jsonb_build_object('cert_type', null, 'cert_expired', null);
  END IF;

  -- BRC assessment data
  v_kpi := v_kpi || jsonb_build_object(
    'brc_grade', (SELECT brc_grade FROM public.suppliers WHERE id = v_review.supplier_id),
    'brc_percent', (SELECT brc_percent FROM public.suppliers WHERE id = v_review.supplier_id)
  );

  -- Risk assessment
  v_kpi := v_kpi || jsonb_build_object(
    'risk_score', (SELECT total_risk_score FROM public.supplier_risk_assessments
                   WHERE supplier_id = v_review.supplier_id
                   ORDER BY assessed_at DESC LIMIT 1)
  );

  -- Upsert KPI snapshot
  INSERT INTO spr.supplier_review_kpi_snapshot(review_id, data, collected_at)
  VALUES (p_review_id, v_kpi, now())
  ON CONFLICT (review_id) DO UPDATE SET data = v_kpi, collected_at = now();

  RETURN v_kpi;
END;
$$;

-- NOTE: pg_cron job scheduling requires pg_cron extension enabled.
-- These commands should be run manually after enabling pg_cron:
--
-- SELECT cron.schedule('spr_generate_due_reviews', '0 6 * * *',
--   $$SELECT spr.fn_generate_due_reviews(60)$$);
--
-- SELECT cron.schedule('spr_send_notifications', '0 7 * * *',
--   $$SELECT spr.fn_send_review_notifications()$$);
