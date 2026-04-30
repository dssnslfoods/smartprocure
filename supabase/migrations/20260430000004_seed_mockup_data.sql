-- ============================================================
-- SEED: Mockup data for testing
-- Safe to run multiple times (all inserts use ON CONFLICT (id) DO NOTHING)
-- ============================================================

-- ========================================================
-- 1. SUPPLIERS
-- ========================================================
INSERT INTO public.suppliers
  (id, supplier_code, company_name, supplier_type, risk_level, status,
   qa_approval_status, certificate_type, certificate_expiry_date,
   email, phone, country, tax_id, created_at, updated_at)
VALUES
  ('aaaaaaaa-0001-0000-0000-000000000001','SUP-SEED-001','บริษัท ไทยฟู้ดส์ซัพพลาย จำกัด',         'approved', 'low',      'approved','approved',    'GMP',     now()+interval'18 months','info@thaifood.co.th',   '02-111-0001','TH','0105560001111',now()-interval'3 years',  now()),
  ('aaaaaaaa-0001-0000-0000-000000000002','SUP-SEED-002','บริษัท ควอลิตี้มีทโปรดักส์ จำกัด',      'approved', 'medium',   'approved','approved',    'ISO22000',now()+interval'8 months', 'contact@qualitymeat.th','02-111-0002','TH','0105560001112',now()-interval'2 years',  now()),
  ('aaaaaaaa-0001-0000-0000-000000000003','SUP-SEED-003','บริษัท เอเชียแพ็กเกจจิ้ง จำกัด',        'approved', 'low',      'approved','not_required',NULL,      now()+interval'14 months','sales@asiapack.th',     '02-111-0003','TH','0105560001113',now()-interval'1 year',   now()),
  ('aaaaaaaa-0001-0000-0000-000000000004','SUP-SEED-004','บริษัท นอร์ทสตาร์ อิงกรีเดียนส์ จำกัด','approved', 'high',     'approved','pending',     'HACCP',   now()+interval'2 months', 'info@northstar.th',     '02-111-0004','TH','0105560001114',now()-interval'6 months', now()),
  ('aaaaaaaa-0001-0000-0000-000000000005','SUP-SEED-005','บริษัท ซันฟลาวเวอร์ ออยล์ จำกัด',       'approved', 'medium',   'approved','approved',    'GMP',     now()-interval'1 month',  'sales@sunflower.th',    '02-111-0005','TH','0105560001115',now()-interval'4 years',  now()),
  ('aaaaaaaa-0001-0000-0000-000000000006','SUP-SEED-006','บริษัท โกลบอล สไปซ์ เทรดดิ้ง จำกัด',   'new',      'low',      'submitted','not_required','ISO9001', now()+interval'24 months','global@spice.com',      '02-111-0006','CN','0105560001116',now()-interval'2 months', now()),
  ('aaaaaaaa-0001-0000-0000-000000000007','SUP-SEED-007','บริษัท รีไฟน์ชูการ์ ซัพพลาย จำกัด',     'critical', 'high',     'approved','approved',    'GMP',     now()+interval'5 months', 'sugar@refine.th',       '02-111-0007','TH','0105560001117',now()-interval'5 years',  now()),
  ('aaaaaaaa-0001-0000-0000-000000000008','SUP-SEED-008','บริษัท เฟรชฟาร์ม โปรดิวซ์ จำกัด',       'approved', 'critical', 'approved','rejected',    'HACCP',   now()-interval'3 months', 'farm@freshfarm.th',     '02-111-0008','TH','0105560001118',now()-interval'1 year',   now()),
  ('aaaaaaaa-0001-0000-0000-000000000009','SUP-SEED-009','บริษัท พรีเมียม สตาร์ช จำกัด',           'nominated','medium',   'approved','approved',    'ISO22000',now()+interval'11 months','pm@premstarch.th',      '02-111-0009','TH','0105560001119',now()-interval'8 months', now()),
  ('aaaaaaaa-0001-0000-0000-000000000010','SUP-SEED-010','บริษัท ท็อปเกรด เซซามี จำกัด',           'approved', 'low',      'approved','approved',    'GMP',     now()+interval'20 months','info@topsesame.th',     '02-111-0010','TH','0105560001120',now()-interval'3 years',  now())
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 2. SUPPLIER RISK ASSESSMENTS
-- ========================================================
INSERT INTO public.supplier_risk_assessments
  (id, supplier_id, food_safety_risk, quality_risk, delivery_risk, financial_risk,
   certificate_risk, food_fraud_risk, allergen_risk, country_risk,
   critical_material_risk, ncr_history_risk, notes, assessed_at, created_at, updated_at)
VALUES
  ('aaaaaaaa-0002-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000001',1,1,1,1,1,1,1,1,1,1,'ผ่านการตรวจสอบแล้ว ไม่พบความเสี่ยงที่มีนัยสำคัญ',                 now()-interval'30 days',now()-interval'30 days',now()-interval'30 days'),
  ('aaaaaaaa-0002-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000002',3,3,2,3,2,3,3,2,3,2,'ความเสี่ยงปานกลาง ต้องติดตามอย่างสม่ำเสมอ',                        now()-interval'45 days',now()-interval'45 days',now()-interval'45 days'),
  ('aaaaaaaa-0002-0000-0000-000000000003','aaaaaaaa-0001-0000-0000-000000000003',1,2,2,1,2,1,2,1,2,1,'ผู้จัดจำหน่ายบรรจุภัณฑ์ ความเสี่ยงต่ำ',                            now()-interval'20 days',now()-interval'20 days',now()-interval'20 days'),
  ('aaaaaaaa-0002-0000-0000-000000000004','aaaaaaaa-0001-0000-0000-000000000004',5,6,5,7,6,4,5,3,6,5,'ความเสี่ยงสูง รอการอนุมัติ QA ก่อนดำเนินการสั่งซื้อ',              now()-interval'10 days',now()-interval'10 days',now()-interval'10 days'),
  ('aaaaaaaa-0002-0000-0000-000000000005','aaaaaaaa-0001-0000-0000-000000000005',3,3,4,3,5,3,3,3,4,3,'ใบรับรองหมดอายุ ต้องดำเนินการต่ออายุโดยด่วน',                      now()-interval'15 days',now()-interval'15 days',now()-interval'15 days'),
  ('aaaaaaaa-0002-0000-0000-000000000007','aaaaaaaa-0001-0000-0000-000000000007',5,6,4,4,4,4,5,4,5,4,'ประวัติ NCR สูง ต้องมี QA อนุมัติก่อนการสั่งซื้อทุกครั้ง',         now()-interval'5 days', now()-interval'5 days', now()-interval'5 days'),
  ('aaaaaaaa-0002-0000-0000-000000000008','aaaaaaaa-0001-0000-0000-000000000008',8,7,7,8,9,8,8,6,7,8,'ความเสี่ยงร้ายแรง ใบรับรองหมดอายุ และประวัติ NCR ไม่ดี',           now()-interval'7 days', now()-interval'7 days', now()-interval'7 days'),
  ('aaaaaaaa-0002-0000-0000-000000000009','aaaaaaaa-0001-0000-0000-000000000009',3,2,3,3,2,3,3,2,4,3,'ผู้จัดจำหน่ายที่ได้รับการเสนอชื่อ ต้องมีหลักฐานยืนยันจากลูกค้า', now()-interval'25 days',now()-interval'25 days',now()-interval'25 days'),
  ('aaaaaaaa-0002-0000-0000-000000000010','aaaaaaaa-0001-0000-0000-000000000010',1,1,2,1,1,2,1,1,2,1,'ผ่านเกณฑ์ทุกด้าน คะแนนความเสี่ยงต่ำมาก',                           now()-interval'60 days',now()-interval'60 days',now()-interval'60 days')
ON CONFLICT (id) DO NOTHING;

-- Sync risk_level based on computed total_risk_score
UPDATE public.suppliers sup
SET risk_level = CASE
  WHEN sra.total_risk_score <= 30 THEN 'low'::public.risk_level_enum
  WHEN sra.total_risk_score <= 60 THEN 'medium'::public.risk_level_enum
  WHEN sra.total_risk_score <= 80 THEN 'high'::public.risk_level_enum
  ELSE 'critical'::public.risk_level_enum
END
FROM (
  SELECT DISTINCT ON (supplier_id) supplier_id, total_risk_score
  FROM public.supplier_risk_assessments
  WHERE supplier_id IN (
    'aaaaaaaa-0001-0000-0000-000000000001',
    'aaaaaaaa-0001-0000-0000-000000000002',
    'aaaaaaaa-0001-0000-0000-000000000003',
    'aaaaaaaa-0001-0000-0000-000000000004',
    'aaaaaaaa-0001-0000-0000-000000000005',
    'aaaaaaaa-0001-0000-0000-000000000007',
    'aaaaaaaa-0001-0000-0000-000000000008',
    'aaaaaaaa-0001-0000-0000-000000000009',
    'aaaaaaaa-0001-0000-0000-000000000010'
  )
  ORDER BY supplier_id, assessed_at DESC
) sra
WHERE sup.id = sra.supplier_id;

-- ========================================================
-- 3. RFQs
-- ========================================================
INSERT INTO public.rfqs (id, rfq_number, title, description, status, deadline, created_at, updated_at)
VALUES
  ('bbbbbbbb-0001-0000-0000-000000000001','RFQ-SEED-001','จัดซื้อวัตถุดิบน้ำมันปาล์มดิบ ประจำไตรมาส Q3',
   'จัดซื้อน้ำมันปาล์มดิบ (CPO) สำหรับสายการผลิต ปริมาณ 500 ตัน',
   'awarded',    now()-interval'60 days',now()-interval'90 days',now()-interval'20 days'),
  ('bbbbbbbb-0001-0000-0000-000000000002','RFQ-SEED-002','จัดหาบรรจุภัณฑ์ถุงพลาสติก LDPE',
   'ถุงพลาสติก LDPE ขนาด 500g สำหรับสายการบรรจุ ปริมาณ 2,000,000 ชิ้น',
   'evaluation', now()-interval'10 days',now()-interval'45 days',now()-interval'5 days'),
  ('bbbbbbbb-0001-0000-0000-000000000003','RFQ-SEED-003','จัดซื้อน้ำตาลทรายขาวบริสุทธิ์',
   'น้ำตาลทรายขาวบริสุทธิ์ (Refined Sugar) มาตรฐาน Codex Stan 212 ปริมาณ 200 ตัน',
   'published',  now()+interval'14 days', now()-interval'7 days', now()-interval'7 days'),
  ('bbbbbbbb-0001-0000-0000-000000000004','RFQ-SEED-004','จัดซื้อสารแต่งกลิ่นรส (Flavoring Agents)',
   'สารแต่งกลิ่นรสธรรมชาติสำหรับผลิตภัณฑ์ ปริมาณตามสเปค',
   'draft',      now()+interval'30 days', now()-interval'2 days',  now()-interval'2 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 4. RFQ ITEMS
-- ========================================================
INSERT INTO public.rfq_items (id, rfq_id, item_name, description, quantity, unit, specifications, created_at)
VALUES
  ('cccccccc-0001-0000-0000-000000000001','bbbbbbbb-0001-0000-0000-000000000001','น้ำมันปาล์มดิบ (CPO)',  'FFA ≤ 5%, Moisture ≤ 0.15%',       500,    'ตัน', 'PORAM Standard Grade A',   now()-interval'90 days'),
  ('cccccccc-0001-0000-0000-000000000002','bbbbbbbb-0001-0000-0000-000000000001','ค่าขนส่งและประกันภัย', 'รวมค่าขนส่งถึงโรงงาน',              1,      'Lot', 'CIF นครปฐม',               now()-interval'90 days'),
  ('cccccccc-0001-0000-0000-000000000003','bbbbbbbb-0001-0000-0000-000000000002','ถุงพลาสติก LDPE 500g', 'ใสพิมพ์โลโก้ ขนาด 15x25 cm',       2000000,'ชิ้น','ความหนา 80 micron',        now()-interval'45 days'),
  ('cccccccc-0001-0000-0000-000000000004','bbbbbbbb-0001-0000-0000-000000000002','ถุงพลาสติก LDPE 1kg',  'ใสพิมพ์โลโก้ ขนาด 20x30 cm',       500000, 'ชิ้น','ความหนา 100 micron',       now()-interval'45 days'),
  ('cccccccc-0001-0000-0000-000000000005','bbbbbbbb-0001-0000-0000-000000000003','น้ำตาลทรายขาวบริสุทธิ์','Sucrose ≥ 99.8%, Ash ≤ 0.04%',    200,    'ตัน', 'Codex Stan 212',           now()-interval'7 days'),
  ('cccccccc-0001-0000-0000-000000000006','bbbbbbbb-0001-0000-0000-000000000004','สารแต่งกลิ่น Vanilla', 'Natural Vanilla Extract',            50,     'กก.', 'Food Grade GRAS',          now()-interval'2 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 5. RFQ SUPPLIERS (unique constraint on rfq_id, supplier_id)
-- ========================================================
INSERT INTO public.rfq_suppliers (rfq_id, supplier_id, invited_at)
VALUES
  ('bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000001',now()-interval'85 days'),
  ('bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000002',now()-interval'85 days'),
  ('bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000007',now()-interval'85 days'),
  ('bbbbbbbb-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000003',now()-interval'40 days'),
  ('bbbbbbbb-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000006',now()-interval'40 days'),
  ('bbbbbbbb-0001-0000-0000-000000000003','aaaaaaaa-0001-0000-0000-000000000007',now()-interval'6 days'),
  ('bbbbbbbb-0001-0000-0000-000000000003','aaaaaaaa-0001-0000-0000-000000000009',now()-interval'6 days'),
  ('bbbbbbbb-0001-0000-0000-000000000003','aaaaaaaa-0001-0000-0000-000000000010',now()-interval'6 days')
ON CONFLICT (rfq_id, supplier_id) DO NOTHING;

-- ========================================================
-- 6. QUOTATIONS
-- ========================================================
INSERT INTO public.quotations
  (id, rfq_id, supplier_id, total_amount, discount, vat,
   spec_compliance_score, lead_time_days, payment_term, delivery_terms,
   evaluation_status, submitted_at, created_at, updated_at)
VALUES
  ('dddddddd-0001-0000-0000-000000000001','bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000001',9800000,2.0,7.0,97,30,'Net 30','CIF นครปฐม',   'submitted',   now()-interval'70 days',now()-interval'75 days',now()-interval'70 days'),
  ('dddddddd-0001-0000-0000-000000000002','bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000002',9650000,1.5,7.0,95,35,'Net 45','CIF นครปฐม',   'awarded',     now()-interval'68 days',now()-interval'73 days',now()-interval'20 days'),
  ('dddddddd-0001-0000-0000-000000000003','bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000007',9450000,0.5,7.0,88,45,'Net 15','EXW สมุทรสาคร','not_awarded',  now()-interval'65 days',now()-interval'70 days',now()-interval'20 days'),
  ('dddddddd-0001-0000-0000-000000000004','bbbbbbbb-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000003',2400000,3.0,7.0,99,21,'Net 30','DDP โรงงาน',   'under_review', now()-interval'20 days',now()-interval'25 days',now()-interval'5 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 7. QUOTATION ITEMS
-- ========================================================
INSERT INTO public.quotation_items (id, quotation_id, rfq_item_id, item_name, unit_price, quantity, total_price, created_at)
VALUES
  ('dddddddd-0002-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000001','cccccccc-0001-0000-0000-000000000001','น้ำมันปาล์มดิบ (CPO)',    17600,  500,    8800000,now()-interval'70 days'),
  ('dddddddd-0002-0000-0000-000000000002','dddddddd-0001-0000-0000-000000000001','cccccccc-0001-0000-0000-000000000002','ค่าขนส่งและประกันภัย',    1000000,1,      1000000,now()-interval'70 days'),
  ('dddddddd-0002-0000-0000-000000000003','dddddddd-0001-0000-0000-000000000002','cccccccc-0001-0000-0000-000000000001','น้ำมันปาล์มดิบ (CPO)',    17300,  500,    8650000,now()-interval'68 days'),
  ('dddddddd-0002-0000-0000-000000000004','dddddddd-0001-0000-0000-000000000002','cccccccc-0001-0000-0000-000000000002','ค่าขนส่งและประกันภัย',    1000000,1,      1000000,now()-interval'68 days'),
  ('dddddddd-0002-0000-0000-000000000005','dddddddd-0001-0000-0000-000000000003','cccccccc-0001-0000-0000-000000000001','น้ำมันปาล์มดิบ (CPO)',    16900,  500,    8450000,now()-interval'65 days'),
  ('dddddddd-0002-0000-0000-000000000006','dddddddd-0001-0000-0000-000000000003','cccccccc-0001-0000-0000-000000000002','ค่าขนส่งและประกันภัย',    1000000,1,      1000000,now()-interval'65 days'),
  ('dddddddd-0002-0000-0000-000000000007','dddddddd-0001-0000-0000-000000000004','cccccccc-0001-0000-0000-000000000003','ถุงพลาสติก LDPE 500g',    1.0,    2000000,2000000,now()-interval'20 days'),
  ('dddddddd-0002-0000-0000-000000000008','dddddddd-0001-0000-0000-000000000004','cccccccc-0001-0000-0000-000000000004','ถุงพลาสติก LDPE 1kg',     0.8,    500000, 400000, now()-interval'20 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 8. RFQ EVALUATIONS (bid scoring for RFQ-1)
-- ========================================================
INSERT INTO public.rfq_evaluations
  (id, rfq_id, quotation_id, supplier_id, commercial_score, technical_score,
   risk_score, final_score, price_score, rank, is_recommended_winner, created_at)
VALUES
  ('eeeeeeee-0001-0000-0000-000000000001','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000002',87.5,92.0,82.0,87.9,89.1,1,true, now()-interval'25 days'),
  ('eeeeeeee-0001-0000-0000-000000000002','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000001',84.0,90.0,95.0,87.4,85.2,2,false,now()-interval'25 days'),
  ('eeeeeeee-0001-0000-0000-000000000003','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000003','aaaaaaaa-0001-0000-0000-000000000007',91.0,82.0,42.0,80.9,93.8,3,false,now()-interval'25 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 9. AWARD APPROVALS
-- ========================================================
INSERT INTO public.award_approvals
  (id, rfq_id, quotation_id, recommended_supplier_id, approval_level, level_order,
   approval_status, approval_comment, created_at, updated_at)
VALUES
  ('eeeeeeee-0002-0000-0000-000000000001','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000002','buyer',              1,'approved','ราคาและคุณภาพเหมาะสม แนะนำให้อนุมัติ',      now()-interval'22 days',now()-interval'22 days'),
  ('eeeeeeee-0002-0000-0000-000000000002','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000002','procurement_manager',2,'approved','เห็นด้วยกับข้อเสนอของทีมจัดซื้อ',           now()-interval'21 days',now()-interval'21 days'),
  ('eeeeeeee-0002-0000-0000-000000000003','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000002','qa',                 3,'approved','ผู้จัดจำหน่ายผ่านเกณฑ์ QA ใบรับรองครบถ้วน',now()-interval'20 days',now()-interval'20 days'),
  ('eeeeeeee-0002-0000-0000-000000000004','bbbbbbbb-0001-0000-0000-000000000001','dddddddd-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000002','director',           4,'approved','อนุมัติ มูลค่าสัญญาอยู่ในวงเงินงบประมาณ',  now()-interval'20 days',now()-interval'20 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 10. AWARDS
-- ========================================================
INSERT INTO public.awards
  (id, rfq_id, supplier_id, winning_quotation_id, award_no, award_lifecycle_status,
   status, ready_for_po, final_amount, award_reason, recommendation, awarded_at, created_at, updated_at)
VALUES
  ('ffffffff-0001-0000-0000-000000000001','bbbbbbbb-0001-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000002','dddddddd-0001-0000-0000-000000000002',
   'AWD-SEED-001','awarded','approved',true,9650000,
   'ผู้จัดจำหน่ายได้คะแนนรวมสูงสุด 87.9 คะแนน จากการประเมินด้านราคา คุณภาพ และความเสี่ยง',
   'แนะนำให้ว่าจ้าง บริษัท ควอลิตี้มีทโปรดักส์ จำกัด เนื่องจากมีคะแนนรวมสูงสุด',
   now()-interval'20 days',now()-interval'25 days',now()-interval'20 days'),
  ('ffffffff-0001-0000-0000-000000000002','bbbbbbbb-0001-0000-0000-000000000002','aaaaaaaa-0001-0000-0000-000000000003','dddddddd-0001-0000-0000-000000000004',
   'AWD-SEED-002','pending_approval','pending',false,2400000,
   'รอการอนุมัติจากคณะกรรมการจัดซื้อ',
   'แนะนำ บริษัท เอเชียแพ็กเกจจิ้ง จำกัด ราคาสมเหตุสมผล คุณภาพผ่านเกณฑ์',
   NULL,now()-interval'5 days',now()-interval'5 days')
ON CONFLICT (id) DO NOTHING;

-- ========================================================
-- 11. BIDDING EVENT + BID ENTRIES
-- ========================================================
INSERT INTO public.bidding_events
  (id, rfq_id, title, description, status, start_time, end_time, created_at)
VALUES
  ('ffffffff-0002-0000-0000-000000000001','bbbbbbbb-0001-0000-0000-000000000001',
   'E-Auction: น้ำมันปาล์มดิบ Q3',
   'การประมูลแบบ Reverse Auction สำหรับวัตถุดิบน้ำมันปาล์มดิบ',
   'closed',now()-interval'72 days',now()-interval'71 days',now()-interval'80 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.bid_entries (id, bidding_event_id, supplier_id, bid_amount, submitted_at)
VALUES
  ('ffffffff-0003-0000-0000-000000000001','ffffffff-0002-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000001',9800000,now()-interval'71 days 2 hours'),
  ('ffffffff-0003-0000-0000-000000000002','ffffffff-0002-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000002',9650000,now()-interval'71 days 1 hour'),
  ('ffffffff-0003-0000-0000-000000000003','ffffffff-0002-0000-0000-000000000001','aaaaaaaa-0001-0000-0000-000000000007',9450000,now()-interval'71 days 3 hours')
ON CONFLICT (id) DO NOTHING;
