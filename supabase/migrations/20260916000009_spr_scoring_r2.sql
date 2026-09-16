-- ============================================================
-- SPR Migration 009: Scoring Tab Round 2
-- - Rebalance weights to S&Q 75% / Commercial 25% (13 criteria)
-- - Add 4 new S&Q criteria (SQ07–SQ10) with full BSAQ coverage
-- - Add 'commercial' tag to Commercial criteria
-- - Server-side weight validation in fn_calc_review_score
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Update existing S&Q criteria weights for rm_primary_pk
UPDATE spr.review_criteria SET weight = 12 WHERE code = 'SQ01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 10 WHERE code = 'SQ02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 12 WHERE code = 'SQ03' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8  WHERE code = 'SQ04' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 6  WHERE code = 'SQ05' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 6  WHERE code = 'SQ06' AND supplier_category = 'rm_primary_pk';

-- 2) Update Commercial weights + add 'commercial' tag
UPDATE spr.review_criteria SET weight = 12, bsaq_tags = ARRAY['commercial'] WHERE code = 'CM01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 7,  bsaq_tags = ARRAY['commercial'] WHERE code = 'CM02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 6,  bsaq_tags = ARRAY['commercial'] WHERE code = 'CM03' AND supplier_category = 'rm_primary_pk';

-- 3) Insert 4 new S&Q criteria
-- SQ07: ความแท้ของวัตถุดิบ / Food fraud controls
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, auto_rule, score_descriptors, sort_order) VALUES
  ('rm_primary_pk', 'SQ07', 'ความแท้ของวัตถุดิบ / Food fraud controls', 'Raw Material Authenticity / Food Fraud Controls', 'SAFETY_QUALITY',
   ARRAY['authenticity'], 6, 4, NULL,
   '[{"score":4,"label":"มีมาตรการป้องกัน fraud + หลักฐาน (CoA, origin cert, test)"},{"score":2,"label":"มีบางส่วน"},{"score":0,"label":"ไม่มี / พบปัญหา"}]'::jsonb,
   7)
ON CONFLICT DO NOTHING;

-- SQ08: การปฏิบัติตามกฎหมาย
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, auto_rule, score_descriptors, sort_order) VALUES
  ('rm_primary_pk', 'SQ08', 'การปฏิบัติตามกฎหมาย (อย. / ใบอนุญาต)', 'Legal & Regulatory Compliance', 'SAFETY_QUALITY',
   ARRAY['legality'], 5, 4, NULL,
   '[{"score":4,"label":"ใบอนุญาต/ทะเบียนครบและยังไม่หมดอายุ ไม่มีปัญหา"},{"score":2,"label":"ขาดเอกสารบางรายการ"},{"score":0,"label":"ไม่ถูกต้อง / ถูกเรียกคืนตามกฎหมาย"}]'::jsonb,
   8)
ON CONFLICT DO NOTHING;

-- SQ09: ข้อร้องเรียนจากลูกค้า
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, auto_rule, score_descriptors, sort_order) VALUES
  ('rm_primary_pk', 'SQ09', 'ข้อร้องเรียนจากลูกค้าที่เกี่ยวกับ supplier', 'Customer Complaints (Supplier-related)', 'SAFETY_QUALITY',
   ARRAY['quality','safety'], 5, 4,
   '{"field":"complaints_count","rules":[{"max":0,"score":4},{"max":1,"score":3},{"max":3,"score":2},{"max":5,"score":1}]}'::jsonb,
   '[{"score":4,"label":"0 เรื่อง"},{"score":3,"label":"1 เรื่อง minor"},{"score":2,"label":"≥2 minor"},{"score":1,"label":"1 major"},{"score":0,"label":"critical / recall"}]'::jsonb,
   9)
ON CONFLICT DO NOTHING;

-- SQ10: การแจ้งการเปลี่ยนแปลง
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, auto_rule, score_descriptors, sort_order) VALUES
  ('rm_primary_pk', 'SQ10', 'การแจ้งการเปลี่ยนแปลง / ตอบสนองความเสี่ยงใหม่', 'Change Notification & Emerging Risk Response', 'SAFETY_QUALITY',
   ARRAY['safety','authenticity'], 5, 4, NULL,
   '[{"score":4,"label":"แจ้งล่วงหน้าทุกครั้ง"},{"score":2,"label":"แจ้งช้า"},{"score":0,"label":"ไม่แจ้ง / ทราบจากแหล่งอื่น"}]'::jsonb,
   10)
ON CONFLICT DO NOTHING;

-- Update sort_order for commercial criteria
UPDATE spr.review_criteria SET sort_order = 11 WHERE code = 'CM01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET sort_order = 12 WHERE code = 'CM02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET sort_order = 13 WHERE code = 'CM03' AND supplier_category = 'rm_primary_pk';

-- 4) Recreate fn_calc_review_score with server-side weight validation
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
  v_config_total   numeric;
  v_config_safety  numeric;
  rec              record;
BEGIN
  SELECT * INTO v_review FROM spr.supplier_review WHERE id = p_review_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Review not found');
  END IF;

  -- Server-side weight validation
  SELECT
    COALESCE(SUM(weight), 0),
    COALESCE(SUM(CASE WHEN criterion_group = 'SAFETY_QUALITY' THEN weight ELSE 0 END), 0)
  INTO v_config_total, v_config_safety
  FROM spr.review_criteria
  WHERE supplier_category = v_review.supplier_category AND active = true;

  IF v_config_total != 100 THEN
    RETURN jsonb_build_object('error', 'Criteria weights do not total 100% (currently ' || v_config_total || '%). Contact administrator.');
  END IF;

  IF v_config_total > 0 AND (v_config_safety::numeric / v_config_total * 100) < 60 THEN
    RETURN jsonb_build_object('error', 'Safety & Quality weight must be >= 60% (BRCGS 3.5.1.3)');
  END IF;

  FOR rec IN
    SELECT s.final_score, s.weight_snapshot, c.criterion_group, c.scale_max
    FROM spr.supplier_review_score s
    JOIN spr.review_criteria c ON c.id = s.criterion_id
    WHERE s.review_id = p_review_id
      AND s.final_score IS NOT NULL
  LOOP
    DECLARE
      v_norm numeric := (rec.final_score::numeric / rec.scale_max) * 100;
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
