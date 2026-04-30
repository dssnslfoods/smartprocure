-- ============================================================
-- Price List restructure → Master Catalog by category
-- ------------------------------------------------------------
-- Old model:  price_lists were per-supplier "books" of offers
-- New model:  price_lists are MASTER CATALOGS by category (เล่ม)
--             - Procurement maintains the master catalog of items
--             - Items can be nominated to a specific supplier (BRCGS)
--             - Suppliers / procurement build a checklist from catalog
--               → exported to xlsx → quoted → imported back into the system
-- ============================================================

-- 1) Wipe existing price-list data (suppliers preserved)
TRUNCATE TABLE public.price_list_item_suppliers CASCADE;
TRUNCATE TABLE public.price_list_items          CASCADE;
TRUNCATE TABLE public.price_lists               CASCADE;

-- 2) supplier_id is no longer required (catalogs aren't owned by a supplier)
ALTER TABLE public.price_lists
  ALTER COLUMN supplier_id DROP NOT NULL;

-- 3) Link RFQ items back to the master catalog row they came from
ALTER TABLE public.rfq_items
  ADD COLUMN IF NOT EXISTS source_price_list_item_id UUID
    REFERENCES public.price_list_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rfq_items_source_pli
  ON public.rfq_items(source_price_list_item_id);

-- 3b) Catalog rows carry a reference (target/baseline) price + default MOQ/lead time.
--     Real quoted prices live on price_list_item_suppliers.
ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS reference_price NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS moq             INTEGER,
  ADD COLUMN IF NOT EXISTS lead_time_days  INTEGER;

-- 4) Master catalogs — one per category
INSERT INTO public.price_lists
  (id, title, version, status, category, valid_from, valid_until, notes)
VALUES
  ('11111111-aaaa-0000-0000-000000000001',
   'Master Catalog — วัตถุดิบ',
   1, 'active', 'raw_material',
   CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days',
   'Catalog กลางสำหรับวัตถุดิบ NSL Foods PLC (อาหารพร้อมทาน / แซนวิช / เบเกอรี่)'),
  ('11111111-aaaa-0000-0000-000000000002',
   'Master Catalog — บรรจุภัณฑ์',
   1, 'active', 'packaging',
   CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days',
   'Catalog กลางสำหรับบรรจุภัณฑ์ NSL Foods PLC'),
  ('11111111-aaaa-0000-0000-000000000003',
   'Master Catalog — บริการ',
   1, 'active', 'service',
   CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days',
   'Catalog กลางสำหรับบริการที่ใช้ในกระบวนการผลิตของ NSL Foods PLC'),
  ('11111111-aaaa-0000-0000-000000000004',
   'Master Catalog — อื่นๆ',
   1, 'active', 'other',
   CURRENT_DATE, CURRENT_DATE + INTERVAL '365 days',
   'Catalog กลางสำหรับอุปกรณ์/วัสดุสิ้นเปลืองทั่วไป');

-- 5) Items per catalog — relevant to NSL Foods (frozen meals / sandwiches / bakery)

-- 5.1 RAW MATERIAL --------------------------------------------------------
INSERT INTO public.price_list_items
  (price_list_id, item_code, item_name, description, unit, reference_price, moq, lead_time_days, sort_order)
VALUES
  ('11111111-aaaa-0000-0000-000000000001', 'RM-001', 'อกไก่ไม่มีหนัง',         'อกไก่สดไม่มีหนัง สำหรับแซนวิช/อาหารพร้อมทาน', 'กก.',  165.00, 100, 2,  10),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-002', 'สะโพกไก่ไม่มีกระดูก',     'สะโพกไก่ดอนไม่มีกระดูก',                    'กก.',  148.00, 100, 2,  20),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-003', 'ไก่บดละเอียด',           'เนื้อไก่บดละเอียดสำหรับไส้แซนวิช',           'กก.',  138.00, 200, 2,  30),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-004', 'แฮมหมูแผ่น',             'แฮมหมูสไลซ์ สำหรับแซนวิช',                  'กก.',  220.00,  50, 3,  40),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-005', 'เบคอนสไลซ์',             'เบคอนรมควันสไลซ์',                          'กก.',  280.00,  50, 3,  50),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-006', 'ไส้กรอกแฟรงก์เฟอร์เตอร์', 'ไส้กรอกหมูสำหรับฮอตดอก',                    'กก.',  185.00, 100, 3,  60),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-007', 'ไข่ไก่เบอร์ 1',          'ไข่ไก่สด HACCP',                             'ฟอง',    4.20, 1000, 1,  70),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-008', 'ชีสเชดด้าแผ่น',           'Cheddar slice 14g',                          'แผ่น',   3.20, 1000, 7,  80),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-009', 'มอสซาเรลล่าขูด',          'Mozzarella shred Low-moisture',              'กก.',  295.00,  20, 7,  90),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-010', 'เนยจืดแผ่น',             'Unsalted butter 82% fat',                    'กก.',  240.00,  20, 5, 100),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-011', 'นมสดยูเอชที',            'UHT whole milk',                             'ลิตร',  44.00, 100, 3, 110),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-012', 'แป้งสาลีอเนกประสงค์',     'All-purpose wheat flour',                    'กก.',   28.00, 500, 3, 120),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-013', 'ยีสต์ผงแห้ง Instant',     'Instant dry yeast',                          'กก.',  240.00,  10, 7, 130),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-014', 'น้ำตาลทรายขาว',           'Refined white sugar',                        'กก.',   24.00, 500, 3, 140),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-015', 'เกลือปรุงอาหาร',          'Refined salt iodized',                       'กก.',   18.00, 200, 3, 150),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-016', 'ขนมปังโฮลวีท',            'Whole wheat bread loaf 700g',                'ก้อน',  38.00, 200, 1, 160),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-017', 'ขนมปังขาว Sandwich',      'White sandwich loaf 700g',                   'ก้อน',  32.00, 200, 1, 170),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-018', 'แตงกวาญี่ปุ่น',          'Japanese cucumber',                          'กก.',   45.00, 100, 1, 180),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-019', 'ผักกาดหอม Iceberg',       'Iceberg lettuce',                            'กก.',   55.00, 100, 1, 190),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-020', 'มะเขือเทศ',              'Tomato',                                     'กก.',   42.00, 100, 1, 200),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-021', 'หัวหอมใหญ่',             'Onion',                                       'กก.',   35.00, 100, 1, 210),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-022', 'มายองเนส',               'Mayonnaise food service 4kg',                'กก.',  115.00,  20, 5, 220),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-023', 'ซอสมะเขือเทศ',           'Tomato ketchup food service',                 'กก.',   95.00,  20, 5, 230),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-024', 'ซอสพริก',                'Sriracha-style chili sauce',                  'กก.',  105.00,  20, 5, 240),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-025', 'น้ำมันถั่วเหลือง',        'Soybean oil 18L',                             'ลิตร',  62.00, 100, 5, 250),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-026', 'พริกไทยขาวป่น',           'Ground white pepper',                         'กก.',  580.00,   5, 7, 260),
  ('11111111-aaaa-0000-0000-000000000001', 'RM-027', 'กระเทียมสับ',             'Chopped garlic in oil',                        'กก.',  165.00,  10, 5, 270);

-- 5.2 PACKAGING -----------------------------------------------------------
INSERT INTO public.price_list_items
  (price_list_id, item_code, item_name, description, unit, reference_price, moq, lead_time_days, sort_order)
VALUES
  ('11111111-aaaa-0000-0000-000000000002', 'PK-001', 'ถาดพลาสติก PP 200g',     'PP tray with anti-fog lid for sandwich/ready meal', 'ใบ',   3.20, 5000, 14, 10),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-002', 'ถาดกระดาษเคลือบ PE',       'Coated paper tray microwaveable',                    'ใบ',   4.80, 3000, 14, 20),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-003', 'ฟิล์มซีลฝา (Lidding)',     'Top-seal lidding film with peel',                    'ม้วน', 1850.00,  20, 21, 30),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-004', 'ถุงสุญญากาศ Nylon/PE',     'Vacuum bag 200x300mm 90 micron',                     'ใบ',   2.40, 5000, 10, 40),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-005', 'ถุงปิดผนึกความร้อน OPP/CPP','OPP/CPP heat-seal pouch',                            'ใบ',   1.20, 10000, 7, 50),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-006', 'ฟิล์มยืด PE Stretch',     'Pallet stretch wrap 17 micron x 500m',               'ม้วน', 320.00,  30,  5, 60),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-007', 'กล่องกระดาษลูกฟูก 5 ชั้น','Carton 5-ply 400x300x200mm',                          'ใบ',  18.50, 1000,  7, 70),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-008', 'ฉลากสติ๊กเกอร์โพลีโพร',    'White PP label 60x40mm thermal',                     'ดวง',   0.45, 50000, 7, 80),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-009', 'สติ๊กเกอร์บาร์โค้ด',       'Thermal transfer barcode label',                     'ดวง',   0.35, 50000, 7, 90),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-010', 'แก้วพลาสติก PP 16oz',     'PP cold cup 16oz',                                   'ใบ',   1.85, 5000, 10,100),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-011', 'ฝาแก้วพลาสติก',           'PP dome lid 16oz',                                   'ใบ',   0.95, 5000, 10,110),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-012', 'ถ้วยซอส PP 30ml',         'PP sauce cup 30ml',                                  'ใบ',   0.55, 5000, 10,120),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-013', 'ฝาถ้วยซอส',               'PP lid for sauce cup 30ml',                          'ใบ',   0.30, 5000, 10,130),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-014', 'ช้อนพลาสติก PP',          'PP plastic spoon individually wrapped',              'ชิ้น',  0.40, 10000, 7,140),
  ('11111111-aaaa-0000-0000-000000000002', 'PK-015', 'ส้อมพลาสติก PP',          'PP plastic fork individually wrapped',               'ชิ้น',  0.40, 10000, 7,150);

-- 5.3 SERVICE -------------------------------------------------------------
INSERT INTO public.price_list_items
  (price_list_id, item_code, item_name, description, unit, reference_price, moq, lead_time_days, sort_order)
VALUES
  ('11111111-aaaa-0000-0000-000000000003', 'SV-001', 'ขนส่งห้องเย็น (-18°C)',      'Frozen logistics รถ 6 ล้อ จุดส่งภายใน BKK',  'เที่ยว', 4500.00, 1,  1, 10),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-002', 'ขนส่งห้องเย็น (0-4°C)',      'Chilled logistics รถ 6 ล้อ จุดส่งภายใน BKK', 'เที่ยว', 3800.00, 1,  1, 20),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-003', 'ตรวจวิเคราะห์จุลินทรีย์',    'Microbiological test (TPC, E.coli, S.aureus)','ตัวอย่าง', 1200.00, 1, 5, 30),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-004', 'ตรวจสารปนเปื้อนโลหะหนัก',    'Heavy metal contamination test',              'ตัวอย่าง', 2400.00, 1, 7, 40),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-005', 'ตรวจฉลากโภชนาการ',           'Nutrition label analysis',                    'ตัวอย่าง', 6500.00, 1, 14,50),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-006', 'สอบเทียบเครื่องชั่ง',         'Scale calibration ISO 17025',                 'เครื่อง',   850.00, 1, 7, 60),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-007', 'สอบเทียบเทอร์โมมิเตอร์',      'Thermometer calibration ISO 17025',           'เครื่อง',   650.00, 1, 7, 70),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-008', 'บริการกำจัดแมลง รายเดือน',     'Pest control monthly service',                'เดือน',   8500.00, 1, 1, 80),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-009', 'บริการล้างทำความสะอาด CIP',  'CIP cleaning service',                        'ครั้ง',   3500.00, 1, 1, 90),
  ('11111111-aaaa-0000-0000-000000000003', 'SV-010', 'เช่าห้องเย็น Pallet -18°C',    'Frozen storage rental',                       'พาเลท/เดือน',  650.00, 1, 1,100);

-- 5.4 OTHER ---------------------------------------------------------------
INSERT INTO public.price_list_items
  (price_list_id, item_code, item_name, description, unit, reference_price, moq, lead_time_days, sort_order)
VALUES
  ('11111111-aaaa-0000-0000-000000000004', 'OT-001', 'ถุงมือไนไตรล์ Food-grade',   'Nitrile glove powder-free size M',           'กล่อง',  185.00, 100,  7, 10),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-002', 'หมวกคลุมผม',                'Disposable hairnet white',                  'กล่อง',  120.00, 100,  7, 20),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-003', 'หน้ากากอนามัยแบบใช้ครั้งเดียว','3-ply face mask',                            'กล่อง',   95.00, 100,  7, 30),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-004', 'แอลกอฮอล์ฆ่าเชื้อ 70%',       'Ethanol 70% sanitizer 5L',                  'แกลลอน',  220.00,  50,  5, 40),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-005', 'น้ำยาล้างจาน Food-safe',      'Food-grade dishwashing liquid 5L',          'แกลลอน',  185.00,  50,  5, 50),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-006', 'น้ำยาฆ่าเชื้อ Quat',          'Quaternary sanitizer 5L',                   'แกลลอน',  340.00,  20,  5, 60),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-007', 'ผ้าเช็ดอเนกประสงค์ใช้ครั้งเดียว','Disposable wipes 200 sheets',                'กล่อง',   95.00, 100,  7, 70),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-008', 'ชุดยูนิฟอร์ม Food Production','White uniform with hairnet',                 'ชุด',    420.00,  50, 21, 80),
  ('11111111-aaaa-0000-0000-000000000004', 'OT-009', 'รองเท้าบูทยาง',              'PVC food-safe boot',                          'คู่',    380.00,  50, 14, 90);

-- 6) Mark some items as nominated (BRCGS Section 5)
--    Pull suppliers from DB, do NOT hardcode.
--    Use approved suppliers ordered deterministically and rotate them.
WITH approved AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY supplier_code, id) - 1 AS rn,
         COUNT(*) OVER () AS total
  FROM public.suppliers
  WHERE status = 'approved'
),
items_to_nominate AS (
  -- Nominate roughly every 4th item (~25%) deterministically by sort_order
  SELECT pli.id,
         ROW_NUMBER() OVER (ORDER BY pli.price_list_id, pli.sort_order) - 1 AS rn
  FROM public.price_list_items pli
  WHERE pli.sort_order % 40 = 0  -- pick items at sort_order 40, 80, 120, ... ~7 items
     OR pli.item_code IN ('RM-001','RM-008','PK-003','PK-008','SV-005','OT-006')
),
mapping AS (
  SELECT i.id AS item_id, a.id AS supplier_id
  FROM items_to_nominate i
  JOIN approved a ON a.rn = (i.rn % (SELECT total FROM approved LIMIT 1))
)
UPDATE public.price_list_items pli
SET is_nominated           = true,
    nomination_status      = 'approved',
    nomination_date        = CURRENT_DATE - INTERVAL '30 days',
    nominated_customer     = 'NSL Foods PLC',
    nomination_qa_note     = 'Nominated by NSL Foods QA — BRCGS Section 5 evidence on file',
    designated_supplier_id = m.supplier_id,
    qa_reviewed_at         = NOW()
FROM mapping m
WHERE pli.id = m.item_id;

-- 7) Seed initial offers from nominated suppliers (so the catalog has live data)
INSERT INTO public.price_list_item_suppliers
  (price_list_item_id, supplier_id, unit_price, currency, moq, lead_time_days, is_preferred, valid_from, valid_until)
SELECT pli.id, pli.designated_supplier_id, pli.reference_price, 'THB',
       pli.moq, pli.lead_time_days, true,
       CURRENT_DATE, CURRENT_DATE + INTERVAL '180 days'
FROM public.price_list_items pli
WHERE pli.designated_supplier_id IS NOT NULL
ON CONFLICT (price_list_item_id, supplier_id) DO NOTHING;

COMMENT ON TABLE public.price_lists IS
  'Master catalog books. One book per category (raw_material/packaging/service/other). Procurement maintains items; suppliers quote against them.';

COMMENT ON COLUMN public.rfq_items.source_price_list_item_id IS
  'Catalog item this RFQ row was generated from. Allows tracing back to the master price list.';
