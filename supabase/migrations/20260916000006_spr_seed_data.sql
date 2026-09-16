-- ============================================================
-- SPR Migration 006: Seed Data
-- Default frequency, grade thresholds, knockout rules, sample criteria
-- ============================================================
SET search_path = spr, pg_temp;

-- 1) Review frequency defaults
INSERT INTO spr.review_frequency_config (risk_level, months, max_months) VALUES
  ('critical', 6,  12),
  ('high',     6,  12),
  ('medium',   12, 24),
  ('low',      12, 24)
ON CONFLICT (risk_level) DO NOTHING;

-- 2) Grade thresholds (default, applies to all categories unless overridden)
INSERT INTO spr.grade_threshold (grade, min_score, outcome, next_review_months, actions, sort_order) VALUES
  ('A', 85,  'Approved',                12, '{"require_capa": false}'::jsonb, 1),
  ('B', 70,  'Approved',                12, '{"optional_improvement": true}'::jsonb, 2),
  ('C', 50,  'Conditionally Approved',  6,  '{"require_capa": true, "increase_inspection": true}'::jsonb, 3),
  ('D', 0,   'Suspended',               6,  '{"require_capa": true, "block_new_po": true, "notify_purchasing": true, "notify_qa_manager": true}'::jsonb, 4)
ON CONFLICT DO NOTHING;

-- 3) Knockout rules
INSERT INTO spr.knockout_rule (code, description_th, description_en, applies_to_categories, sort_order) VALUES
  ('CERT_EXPIRED_NO_ALT',
   'ใบรับรอง GFSI/BRCGS หมดอายุหรือไม่ได้ verify จาก Directory และไม่มีทางเลือกตรวจสอบอื่น',
   'GFSI/BRCGS certification expired or not directory-verified, with no valid audit alternative',
   '{}', 1),
  ('QUESTIONNAIRE_3YR',
   'การอนุมัติโดยแบบสอบถามเกิน 3 ปี โดยไม่มีการออกใหม่',
   'Questionnaire-based approval >= 3 years old without reissue',
   '{}', 2),
  ('TRACEABILITY_OVERDUE',
   'การตรวจสอบ Traceability เกินกำหนดหรือผลไม่ผ่าน',
   'Traceability verification overdue or failed (where required)',
   '{}', 3),
  ('CRITICAL_INCIDENT_OPEN_CAPA',
   'เกิดเหตุ food safety ร้ายแรง / recall ที่ CAPA ยังไม่ปิด',
   'Critical food safety incident/recall with CAPA not closed in period',
   '{}', 4),
  ('OUTSOURCED_NO_CUSTOMER_APPROVAL',
   'ผู้รับจ้างผลิตไม่ได้รับอนุมัติจากลูกค้า (ตามข้อกำหนดของลูกค้า)',
   'Outsourced processor without required customer approval',
   ARRAY['outsourced_processor'], 5)
ON CONFLICT DO NOTHING;

-- 4) Role mapping defaults
INSERT INTO spr.role_mapping (app_role, spr_role) VALUES
  ('admin', 'qa_manager'),
  ('procurement_officer', 'qa_officer'),
  ('approver', 'approver')
ON CONFLICT DO NOTHING;

-- 5) Sample criteria for RM / Primary PK category
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, auto_rule, score_descriptors, sort_order) VALUES
  -- SAFETY_QUALITY criteria
  ('rm_primary_pk', 'SQ01', 'อัตราการปฏิเสธสินค้า', 'Reject Rate', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 15, 4,
   '{"field":"reject_rate","rules":[{"max":1,"score":4},{"max":3,"score":3},{"max":5,"score":2},{"max":10,"score":1}]}'::jsonb,
   '[{"score":4,"label":"≤1%"},{"score":3,"label":"1-3%"},{"score":2,"label":"3-5%"},{"score":1,"label":"5-10%"},{"score":0,"label":">10%"}]'::jsonb,
   1),
  ('rm_primary_pk', 'SQ02', 'จำนวน NCR (ความรุนแรง)', 'NCR Count by Severity', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 12, 4, NULL,
   '[{"score":4,"label":"ไม่มี NCR"},{"score":3,"label":"Minor เท่านั้น"},{"score":2,"label":"มี Major"},{"score":1,"label":"มี Critical"},{"score":0,"label":"Multiple Critical"}]'::jsonb,
   2),
  ('rm_primary_pk', 'SQ03', 'สถานะใบรับรอง GFSI/BRC', 'GFSI/BRC Certification Status', 'SAFETY_QUALITY',
   ARRAY['safety','legality'], 15, 4, NULL,
   '[{"score":4,"label":"Valid + Directory verified"},{"score":3,"label":"Valid, not verified"},{"score":2,"label":"Expiring within 3 months"},{"score":1,"label":"Expired, renewal in progress"},{"score":0,"label":"No cert / expired"}]'::jsonb,
   3),
  ('rm_primary_pk', 'SQ04', 'ผลการตรวจสอบ Traceability', 'Traceability Verification', 'SAFETY_QUALITY',
   ARRAY['safety','authenticity'], 10, 4, NULL,
   '[{"score":4,"label":"ผ่าน (verified)"},{"score":2,"label":"อยู่ระหว่างดำเนินการ"},{"score":0,"label":"ไม่ผ่าน / ยังไม่ทำ"}]'::jsonb,
   4),
  ('rm_primary_pk', 'SQ05', 'ความถูกต้องของ Specification', 'Specification Compliance', 'SAFETY_QUALITY',
   ARRAY['quality','legality'], 8, 4, NULL,
   '[{"score":4,"label":"Spec current & signed"},{"score":2,"label":"Spec exists but outdated"},{"score":0,"label":"No spec"}]'::jsonb,
   5),
  ('rm_primary_pk', 'SQ06', 'CAPA: ออก / ปิดตรงเวลา / เกินกำหนด', 'CAPA Performance', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 10, 4, NULL,
   '[{"score":4,"label":"ไม่มี CAPA ที่เกินกำหนด"},{"score":3,"label":"CAPA ปิดตรงเวลาทั้งหมด"},{"score":2,"label":"มี CAPA เกินกำหนด 1 รายการ"},{"score":1,"label":"มี CAPA เกินกำหนดหลายรายการ"},{"score":0,"label":"ไม่ตอบ CAPA"}]'::jsonb,
   6),
  -- COMMERCIAL criteria
  ('rm_primary_pk', 'CM01', 'การส่งมอบตรงเวลา', 'On-Time Delivery', 'COMMERCIAL',
   '{}', 10, 4, NULL,
   '[{"score":4,"label":"≥95%"},{"score":3,"label":"90-95%"},{"score":2,"label":"80-90%"},{"score":1,"label":"70-80%"},{"score":0,"label":"<70%"}]'::jsonb,
   7),
  ('rm_primary_pk', 'CM02', 'ความถูกต้องของเอกสาร/ปริมาณ', 'Document & Quantity Accuracy', 'COMMERCIAL',
   '{}', 5, 4, NULL,
   '[{"score":4,"label":"≥98%"},{"score":3,"label":"95-98%"},{"score":2,"label":"90-95%"},{"score":0,"label":"<90%"}]'::jsonb,
   8),
  ('rm_primary_pk', 'CM03', 'การตอบสนอง / สื่อสาร', 'Responsiveness & Communication', 'COMMERCIAL',
   '{}', 5, 4, NULL,
   '[{"score":4,"label":"ดีมาก"},{"score":3,"label":"ดี"},{"score":2,"label":"พอใช้"},{"score":1,"label":"ต้องปรับปรุง"},{"score":0,"label":"ไม่ตอบสนอง"}]'::jsonb,
   9)
ON CONFLICT DO NOTHING;

-- 6) Sample criteria for Service category
INSERT INTO spr.review_criteria (supplier_category, code, name_th, name_en, criterion_group, bsaq_tags, weight, scale_max, score_descriptors, sort_order) VALUES
  ('service', 'SS01', 'ผลงาน / คุณภาพบริการ', 'Service Quality & Performance', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 20, 4,
   '[{"score":4,"label":"ดีเยี่ยม"},{"score":3,"label":"ดี"},{"score":2,"label":"พอใช้"},{"score":1,"label":"ต้องปรับปรุง"},{"score":0,"label":"ไม่ผ่าน"}]'::jsonb, 1),
  ('service', 'SS02', 'คุณสมบัติ / ใบอนุญาตผู้ให้บริการ', 'Qualifications & Licensing', 'SAFETY_QUALITY',
   ARRAY['legality','safety'], 15, 4,
   '[{"score":4,"label":"ครบถ้วน + ไม่หมดอายุ"},{"score":2,"label":"บางส่วน"},{"score":0,"label":"ไม่มี"}]'::jsonb, 2),
  ('service', 'SS03', 'ความปลอดภัยอาหาร / สุขลักษณะ', 'Food Safety & Hygiene Compliance', 'SAFETY_QUALITY',
   ARRAY['safety','quality'], 15, 4,
   '[{"score":4,"label":"ปฏิบัติครบ"},{"score":2,"label":"มีข้อบกพร่องเล็กน้อย"},{"score":0,"label":"ไม่ปฏิบัติ"}]'::jsonb, 3),
  ('service', 'SS04', 'การป้องกัน Food Fraud / Authenticity', 'Food Fraud & Authenticity', 'SAFETY_QUALITY',
   ARRAY['authenticity'], 10, 4,
   '[{"score":4,"label":"มีระบบป้องกัน"},{"score":2,"label":"มีบางส่วน"},{"score":0,"label":"ไม่มี"}]'::jsonb, 4),
  ('service', 'SS05', 'ตรงเวลา / ความน่าเชื่อถือ', 'Timeliness & Reliability', 'COMMERCIAL',
   '{}', 10, 4,
   '[{"score":4,"label":"ดีมาก"},{"score":3,"label":"ดี"},{"score":2,"label":"พอใช้"},{"score":0,"label":"ไม่น่าเชื่อถือ"}]'::jsonb, 5),
  ('service', 'SS06', 'การสื่อสาร / รายงาน', 'Communication & Reporting', 'COMMERCIAL',
   '{}', 10, 4,
   '[{"score":4,"label":"รายงานครบ ตรงเวลา"},{"score":2,"label":"รายงานไม่สม่ำเสมอ"},{"score":0,"label":"ไม่รายงาน"}]'::jsonb, 6)
ON CONFLICT DO NOTHING;
