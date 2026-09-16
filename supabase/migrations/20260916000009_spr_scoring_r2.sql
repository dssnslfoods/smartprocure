-- ============================================================
-- SPR Migration 009: Scoring Tab Round 2
-- - Rebalance weights to S&Q 75% / Commercial 25% (13 criteria)
-- - Add BSAQ tags to Commercial criteria
-- - Add 4 new S&Q criteria (SQ07–SQ10)
-- - Server-side weight validation in fn_calc_review_score
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Update existing S&Q criteria weights for rm_primary_pk (total = 75%)
UPDATE spr.review_criteria SET weight = 10 WHERE code = 'SQ01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8  WHERE code = 'SQ02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 10 WHERE code = 'SQ03' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8  WHERE code = 'SQ04' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 7  WHERE code = 'SQ05' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 7  WHERE code = 'SQ06' AND supplier_category = 'rm_primary_pk';

-- 2) Update Commercial weights (total = 25%)
UPDATE spr.review_criteria SET weight = 10, bsaq_tags = ARRAY['commercial'] WHERE code = 'CM01' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 8,  bsaq_tags = ARRAY['commercial'] WHERE code = 'CM02' AND supplier_category = 'rm_primary_pk';
UPDATE spr.review_criteria SET weight = 7,  bsaq_tags = ARRAY['commercial'] WHERE code = 'CM03' AND supplier_category = 'rm_primary_pk';

-- 3) Insert new S&Q criteria (SQ07–SQ10) to reach 10 criteria
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, auto_rule, score_descriptors, sort_order) VALUES
  ('rm_primary_pk', 'SQ07', 'ข้อร้องเรียนจากลูกค้า', 'Customer Complaints', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 7, 4, NULL,
   '[{"score":4,"label":"ไม่มีข้อร้องเรียน"},{"score":3,"label":"1 ข้อร้องเรียน (เล็กน้อย)"},{"score":2,"label":"2-3 ข้อร้องเรียน"},{"score":1,"label":"4+ ข้อร้องเรียน"},{"score":0,"label":"ข้อร้องเรียนร้ายแรง"}]'::jsonb,
   7),
  ('rm_primary_pk', 'SQ08', 'การแจ้งเปลี่ยนแปลง / Change Notification', 'Change Notification Compliance', 'SAFETY_QUALITY',
   ARRAY['quality','legality'], 6, 4, NULL,
   '[{"score":4,"label":"แจ้งครบ ตรงเวลา"},{"score":3,"label":"แจ้งครบ ล่าช้าบ้าง"},{"score":2,"label":"แจ้งไม่ครบ"},{"score":1,"label":"ไม่แจ้ง แต่ไม่กระทบ"},{"score":0,"label":"ไม่แจ้ง กระทบ Safety"}]'::jsonb,
   8),
  ('rm_primary_pk', 'SQ09', 'ระบบ Food Defence / Food Fraud Prevention', 'Food Defence & Fraud Prevention', 'SAFETY_QUALITY',
   ARRAY['safety','authenticity'], 6, 4, NULL,
   '[{"score":4,"label":"มีระบบครบ + ตรวจสอบแล้ว"},{"score":3,"label":"มีระบบ ยังไม่ตรวจสอบ"},{"score":2,"label":"มีบางส่วน"},{"score":1,"label":"อยู่ระหว่างจัดทำ"},{"score":0,"label":"ไม่มี"}]'::jsonb,
   9),
  ('rm_primary_pk', 'SQ10', 'การจัดการสารก่อภูมิแพ้ / Allergen Management', 'Allergen Management', 'SAFETY_QUALITY',
   ARRAY['safety','quality','legality'], 6, 4, NULL,
   '[{"score":4,"label":"ควบคุมครบ ไม่มีเหตุผิดพลาด"},{"score":3,"label":"ควบคุมดี มีข้อแก้ไขเล็กน้อย"},{"score":2,"label":"มีระบบ แต่มีข้อบกพร่อง"},{"score":1,"label":"ระบบไม่เพียงพอ"},{"score":0,"label":"ไม่มีระบบ / เกิดเหตุ allergen"}]'::jsonb,
   10)
ON CONFLICT DO NOTHING;

-- Update sort_order for commercial criteria to come after SQ10
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

  -- Server-side weight validation: total must = 100 and S&Q >= 60%
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
