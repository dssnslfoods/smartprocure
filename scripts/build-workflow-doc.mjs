// Generates the Smart Procurement workflow manual (docs/Smart-Procurement-Workflow.docx).
//   node scripts/build-workflow-doc.mjs
//
// Content lives in USE_CASES below — edit there and re-run to regenerate.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  LevelFormat, TableOfContents, PageBreak, Header, Footer, PageNumber,
} from 'docx';
import { writeFileSync, mkdirSync } from 'node:fs';

const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134;                       // 2 cm
const CONTENT_W = A4.width - MARGIN * 2;   // 9638
const FONT = 'Arial';
const TEAL = '0F766E';
const GREY = '6B7280';

const border = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const borders = { top: border, bottom: border, left: border, right: border };
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };

// ── helpers ────────────────────────────────────────────────────────────────
const p = (text, opts = {}) => new Paragraph({
  spacing: { after: opts.after ?? 120 },
  alignment: opts.align,
  children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 21, color: opts.color, font: FONT })],
});

const h1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: FONT })] });
const h2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT })] });
const h3 = text => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, font: FONT })] });

const bullet = text => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  spacing: { after: 60 },
  children: [new TextRun({ text, size: 21, font: FONT })],
});

const step = text => new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  spacing: { after: 60 },
  children: [new TextRun({ text, size: 21, font: FONT })],
});

const cell = (text, { bold = false, fill, width, align } = {}) => new TableCell({
  borders, margins: CELL_MARGINS,
  width: { size: width, type: WidthType.DXA },
  shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
  children: [new Paragraph({
    alignment: align,
    children: [new TextRun({ text, bold, size: 20, font: FONT })],
  })],
});

/** Simple table: first row is the header. `cols` are DXA widths summing to CONTENT_W. */
const table = (header, rows, cols) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: cols,
  rows: [
    new TableRow({
      tableHeader: true,
      children: header.map((t, i) => cell(t, { bold: true, fill: 'E6F4F1', width: cols[i] })),
    }),
    ...rows.map(r => new TableRow({ children: r.map((t, i) => cell(t, { width: cols[i] })) })),
  ],
});

const note = text => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: [CONTENT_W],
  rows: [new TableRow({
    children: [new TableCell({
      borders, margins: CELL_MARGINS,
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { fill: 'FEF3C7', type: ShadingType.CLEAR },
      children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: FONT })] })],
    })],
  })],
});

// ── content ────────────────────────────────────────────────────────────────
const ROLES = [
  ['Admin', 'ผู้ดูแลระบบ', 'ทุกเมนู · จัดการผู้ใช้ · ตั้งค่าระบบ · กำหนดเกณฑ์ประเมิน'],
  ['Procurement Officer', 'เจ้าหน้าที่จัดซื้อ', 'ผู้จัดจำหน่าย · Catalog · RFQ · เปรียบเทียบราคา · e-Bidding'],
  ['Approver', 'ผู้อนุมัติ', 'อนุมัติผู้จัดจำหน่าย · อนุมัติการมอบงาน'],
  ['Executive', 'ผู้บริหาร', 'ดูรายงานและภาพรวม (อ่านอย่างเดียว)'],
  ['Supplier', 'ผู้จัดจำหน่าย', 'พอร์ทัลของตนเอง · อัปโหลดเอกสาร · ส่งใบเสนอราคา · ประมูล'],
];

const USE_CASES = [
  {
    id: 'UC-01',
    title: 'ตั้งค่าระบบครั้งแรก',
    actor: 'Admin',
    pre: ['มีบัญชี Admin', 'ทราบนโยบายการให้น้ำหนักคะแนนขององค์กร'],
    steps: [
      'เข้าเมนู การตั้งค่า → แท็บ Users สร้างบัญชีผู้ใช้และกำหนดบทบาทให้ครบทุกฝ่าย',
      'แท็บ Email ตั้งค่า SMTP และเทมเพลตอีเมลแจ้งเตือน (อนุมัติ / ปฏิเสธผู้จัดจำหน่าย)',
      'แท็บ เอกสารบริษัท กำหนดรายการเอกสารที่ต้องขอจากผู้จัดจำหน่าย ระบุว่าบังคับหรือไม่ และมีวันหมดอายุหรือไม่',
      'แท็บ Pricelist กำหนดรอบการอัปเดตราคาและระยะเวลายืนราคา',
      'แท็บ Config กำหนดน้ำหนัก Final Score (Commercial / Technical / Risk) ให้รวมกันได้ 100%',
      'เข้าเมนู เกณฑ์ความเสี่ยง ตรวจสอบเกณฑ์ BRCGS ของแต่ละหมวดผู้ขาย ปรับน้ำหนักความปลอดภัย/เชิงพาณิชย์ และช่วงเกรด A/B/C/D',
      'ก่อนเริ่มใช้งานจริง ใช้ การตั้งค่า → แท็บ ระบบ เพื่อล้างข้อมูล Transaction ที่ใช้ทดสอบ (ไม่ลบ Master Data)',
    ],
    result: 'ระบบพร้อมใช้งาน เกณฑ์และน้ำหนักคะแนนสอดคล้องกับนโยบายองค์กร',
    caution: 'น้ำหนักความปลอดภัยต้องไม่น้อยกว่าเชิงพาณิชย์ตาม BRCGS Clause 3.5.1.3 ระบบจะเตือนและไม่ให้บันทึกหากต่ำกว่าค่าขั้นต่ำที่กำหนด',
  },
  {
    id: 'UC-02',
    title: 'ลงทะเบียนและอนุมัติผู้จัดจำหน่ายรายใหม่',
    actor: 'Supplier · Procurement Officer · Approver',
    pre: ['ผู้จัดจำหน่ายได้รับลิงก์ลงทะเบียน หรือเจ้าหน้าที่สร้างให้'],
    steps: [
      'ผู้จัดจำหน่ายกรอกข้อมูลบริษัทผ่านหน้าลงทะเบียน หรือเจ้าหน้าที่กด ผู้จัดจำหน่าย → เพิ่มใหม่',
      'ระบบสร้างบัญชีเข้าใช้งานให้อัตโนมัติเมื่อระบุอีเมลของผู้จัดจำหน่าย',
      'เจ้าหน้าที่จัดซื้อตรวจสอบข้อมูลและเปลี่ยนสถานะเป็น submitted → review',
      'ระบุ ประเภท Supplier (BRCGS) ที่แท็บ ประเมิน BRCGS ให้ถูกต้อง',
      'Approver พิจารณาและเปลี่ยนสถานะเป็น approved หรือ rejected',
      'ระบบส่งอีเมลแจ้งผลให้ผู้จัดจำหน่ายตามเทมเพลตที่ตั้งไว้',
    ],
    result: 'ผู้จัดจำหน่ายมีสถานะ approved และเข้าใช้งานพอร์ทัลได้',
    caution: 'ต้องระบุประเภท Supplier (BRCGS) ก่อน ระบบจึงจะบังคับใช้เกณฑ์เอกสารบังคับกับผู้จัดจำหน่ายรายนั้น หากยังไม่ระบุ ระบบจะยังไม่คัดกรอง',
  },
  {
    id: 'UC-03',
    title: 'เก็บเอกสารบริษัทจากผู้จัดจำหน่าย',
    actor: 'Supplier · Procurement Officer',
    pre: ['Admin กำหนดรายการเอกสารบริษัทไว้แล้ว'],
    steps: [
      'ผู้จัดจำหน่ายเข้า Supplier Portal → แท็บ เอกสาร จะเห็นรายการเอกสารที่ต้องส่งเป็น checklist',
      'กด แนบไฟล์ ในแต่ละรายการ (หนังสือรับรองบริษัท · ภพ.20 · หน้าสมุดบัญชีธนาคาร ฯลฯ)',
      'เอกสารที่กำหนดว่ามีวันหมดอายุ ให้กรอกวันหมดอายุด้วย',
      'เจ้าหน้าที่ตรวจสอบที่หน้า ผู้จัดจำหน่าย → แท็บ เอกสารบริษัท',
      'ติดตามเอกสารที่ใกล้หมดอายุจากแบนเนอร์เตือนในหน้าเดียวกัน',
    ],
    result: 'เอกสารจดทะเบียนครบถ้วน แถบสรุปแสดงว่า "เอกสารบังคับครบแล้ว"',
    caution: 'ชื่อไฟล์ภาษาไทยถูกแปลงเป็น ASCII อัตโนมัติ · หากวันหมดอายุอ่านไม่ได้จะขึ้นป้ายเหลือง "วันหมดอายุไม่ถูกต้อง" ต้องแก้ไขให้ถูกต้อง',
  },
  {
    id: 'UC-04',
    title: 'ประเมิน BRCGS ผู้จัดจำหน่าย',
    actor: 'Procurement Officer / QA',
    pre: ['ผู้จัดจำหน่ายมีสถานะ approved', 'ระบุประเภท Supplier (BRCGS) แล้ว'],
    steps: [
      'เข้า ผู้จัดจำหน่าย → เลือกบริษัท → แท็บ ประเมิน BRCGS',
      'ตรวจแถบ "สิ่งที่ต้องทำให้การประเมินสมบูรณ์" ซึ่งระบุว่าเหลืออะไรบ้าง',
      'อัปโหลดใบรับรอง/เอกสารในแต่ละหัวข้อด้วยปุ่ม แนบไฟล์ — AI จะตรวจว่าเอกสารตรงข้อประเมิน เป็นของบริษัทนี้ และอ่านวันหมดอายุให้',
      'หัวข้อที่ระบบจับคู่อัตโนมัติไม่ได้ ให้เจ้าหน้าที่เลือกผลประเมินจาก dropdown (เช่น Audit score, Product risk assessment)',
      'ตรวจสอบคะแนนรายหัวข้อและเกรดรวมที่แถบด้านบน',
      'เมื่อครบทุกหัวข้อ ระบบจะแสดงแถบเขียว "ประเมินครบทุกหัวข้อแล้ว" และเกรดเป็นผลสรุปที่ใช้อ้างอิงได้',
    ],
    result: 'ผู้จัดจำหน่ายมีเกรด BRCGS (A/B/C/D) ที่ใช้เป็นเสา Risk ในการเปรียบเทียบราคา',
    caution: 'หัวข้อ Delivery และ Credit term จะได้คะแนนอัตโนมัติเมื่อมีใบเสนอราคาใน RFQ เท่านั้น ระหว่างนี้จะแสดงเป็น "รอประเมิน" และถูกตัดออกจากคะแนนเต็มชั่วคราว เกรดที่เห็นจึงเป็น "เกรดชั่วคราว"',
  },
  {
    id: 'UC-05',
    title: 'กำหนดเอกสารบังคับ (ด่านคัดกรองก่อนเสนอราคา)',
    actor: 'Admin / QA',
    pre: ['ทราบว่าสินค้าหรือหมวดผู้ขายใดต้องมีใบรับรองใดเป็นเงื่อนไขบังคับ'],
    steps: [
      'ชั้นที่ 1 — ตามประเภทผู้ขาย: เข้า เกณฑ์ความเสี่ยง → เลือกหมวด → กด ตั้งบังคับ ที่ตัวเลือกใบรับรองที่ต้องการ (เช่น Halal)',
      'หากตัวเลือกที่ตั้งบังคับเป็นข้อที่มีคะแนนสูงสุด ระบบจะเสนอวิธีปรับคะแนนให้เลือก',
      'ชั้นที่ 2 — ตาม Catalog/สินค้า: เข้า รายการราคา → เปิด Catalog → กด ใบรับรองบังคับ',
      'กำหนดใบรับรองที่ต้องมีในระดับ Catalog (ใช้กับทุกสินค้า) หรือเจาะจงรายสินค้า (ใช้แทนเงื่อนไขของ Catalog)',
    ],
    result: 'ผู้จัดจำหน่ายที่ขาดเอกสารบังคับจะถูกกันออกจากการเสนอราคาโดยอัตโนมัติ',
    caution: 'ตัวเลือกที่ตั้งบังคับจะไม่คิดคะแนน rate เพราะเป็นด่านเข้าล้วน ๆ · ต้องมีอย่างน้อย 1 ตัวเลือกบังคับต่อหัวข้อจึงจะผ่าน · ใบรับรองที่หมดอายุถือว่าไม่ผ่าน',
  },
  {
    id: 'UC-06',
    title: 'จัดการ Catalog และรายการราคา',
    actor: 'Procurement Officer',
    pre: ['มีรายการสินค้า/บริการที่ต้องจัดซื้อ'],
    steps: [
      'เข้าเมนู รายการราคา → สร้าง Catalog ตามหมวด (วัตถุดิบ / บรรจุภัณฑ์ / บริการ / อื่น ๆ)',
      'เพิ่มรายการสินค้าทีละรายการ หรือนำเข้าจากไฟล์ Excel',
      'กำหนดใบรับรองบังคับของ Catalog หากจำเป็น (ดู UC-05)',
      'ติดตามรอบการอัปเดตราคา ระบบจะเตือนเมื่อใกล้ครบรอบหรือเกินรอบ',
      'ดูประวัติราคาย้อนหลังเพื่อเทียบแนวโน้มก่อนออก RFQ',
    ],
    result: 'Catalog พร้อมใช้อ้างอิงในการสร้าง RFQ',
    caution: 'สินค้าที่ผูกกับ Catalog จะพา "ใบรับรองบังคับ" ติดไปยัง RFQ ที่ใช้สินค้านั้นด้วย',
  },
  {
    id: 'UC-07',
    title: 'สร้างและเผยแพร่ใบขอราคา (RFQ)',
    actor: 'Procurement Officer',
    pre: ['มีรายการสินค้าที่ต้องการ', 'มีผู้จัดจำหน่ายที่ผ่านการอนุมัติ'],
    steps: [
      'เข้าเมนู ใบขอราคา → สร้างใหม่ ระบุชื่อเรื่อง กำหนดส่ง และรายการสินค้า (เลือกจาก Catalog ได้)',
      'กำหนด Technical Criteria สำหรับให้คะแนนด้านเทคนิคที่นอกเหนือจากเกณฑ์ BRCGS',
      'เลือกผู้จัดจำหน่ายที่ต้องการเชิญ — รายที่ขาดเอกสารบังคับจะถูกล็อกไว้พร้อมเหตุผล',
      'บันทึกเป็น Draft เพื่อตรวจทาน หรือกด เผยแพร่ RFQ เพื่อเริ่มรับใบเสนอราคาทันที',
      'เชิญผู้จัดจำหน่ายเพิ่มภายหลังได้ที่แท็บ Invited Suppliers',
    ],
    result: 'RFQ อยู่ในสถานะ Published และผู้จัดจำหน่ายที่ถูกเชิญเห็นรายการ',
    caution: 'ขณะเป็น Draft ผู้จัดจำหน่ายจะยังไม่เห็น RFQ · การทำสำเนา RFQ จะไม่คัดลอกประวัติ Rollback มาด้วย',
  },
  {
    id: 'UC-08',
    title: 'ผู้จัดจำหน่ายส่งใบเสนอราคา',
    actor: 'Supplier · Procurement Officer',
    pre: ['RFQ อยู่ในสถานะ Published', 'ผู้จัดจำหน่ายถูกเชิญแล้ว'],
    steps: [
      'ผู้จัดจำหน่ายเข้า ใบขอราคา → เลือก RFQ → แท็บ Quotations → Submit Quotation',
      'อัปโหลดไฟล์ใบเสนอราคา (PDF หรือรูปภาพ) ระบบ AI จะอ่านและกรอกฟอร์มให้อัตโนมัติ',
      'AI ดึงข้อมูล: ราคาต่อรายการ · สกุลเงิน · ส่วนลด · VAT · Lead time · เครดิตเทอม · Validity และตรวจ Technical checklist ให้',
      'ตรวจทานทุกช่องที่ AI กรอก โดยเฉพาะช่อง "เครดิต (วัน)" ซึ่งใช้คิดคะแนนโดยตรง',
      'กดส่งใบเสนอราคา',
      'หากไม่ประสงค์เสนอราคา ให้กดปฏิเสธพร้อมระบุเหตุผล',
    ],
    result: 'ใบเสนอราคาบันทึกในระบบ พร้อมนำไปเปรียบเทียบ',
    caution: 'ส่งได้ 1 ใบต่อ 1 ผู้จัดจำหน่ายต่อ RFQ · ผู้จัดจำหน่ายเห็นเฉพาะใบเสนอราคาของตนเอง ไม่เห็นของคู่แข่ง · ข้อมูลที่ AI กรอกต้องตรวจทานทุกครั้งก่อนส่ง',
  },
  {
    id: 'UC-09',
    title: 'เปรียบเทียบราคาและเลือกผู้ชนะ',
    actor: 'Procurement Officer',
    pre: ['มีใบเสนอราคาอย่างน้อย 1 ใบ'],
    steps: [
      'เข้า RFQ → แท็บ Quotations กดขยายแต่ละใบเพื่อดูผลประเมิน BRCGS พร้อมค่าที่ใช้คำนวณ (บรรทัด ⚡)',
      'หากค่าที่ AI อ่านไม่ถูกต้อง ให้แก้ไขหรือส่งใบเสนอราคาใหม่ คะแนนจะอัปเดตทันที',
      'เข้าแท็บ Bid Comparison เพื่อดูคะแนนรวมทุกราย',
      'ตรวจสอบทั้ง 3 เสา: Commercial (ราคา) · Technical (เกณฑ์เทคนิค) · Risk (เกรด BRCGS)',
      'พิจารณาคำเตือน เช่น ผู้เสนอราคาต่ำสุดมีความเสี่ยงสูง',
      'เลือกผู้ชนะเพื่อไปสู่ขั้นตอนมอบงาน',
    ],
    result: 'ได้ผู้ชนะพร้อม Final Score และเหตุผลประกอบการตัดสินใจ',
    caution: 'ผลประเมิน BRCGS ต่อใบเสนอราคาเห็นได้เฉพาะฝ่ายจัดซื้อ · แต่ละมิติถูกนับที่เดียวเท่านั้น จึงไม่มีการนับซ้ำ',
  },
  {
    id: 'UC-10',
    title: 'การประมูลออนไลน์ (e-Bidding)',
    actor: 'Procurement Officer · Supplier',
    pre: ['สร้างรายการประมูลจาก RFQ แล้ว'],
    steps: [
      'เจ้าหน้าที่สร้างรายการประมูลและกำหนดช่วงเวลา',
      'ผู้จัดจำหน่ายเข้าแท็บ E-Bidding เพื่อเสนอราคา',
      'ทุกรายเห็นราคาต่ำสุดปัจจุบันแบบเรียลไทม์ และเห็นการเปรียบเทียบขณะพิมพ์ราคา',
      'เมื่อครบเวลา ระบบสรุปผลเพื่อนำไปมอบงาน',
    ],
    result: 'ได้ราคาสุดท้ายจากการแข่งขันแบบเปิดเผยราคาต่ำสุด',
    caution: 'การประมูลเป็นรอบเดียว (single round) · ราคาต่ำสุดเป็นข้อมูลที่ทุกรายเห็นร่วมกันตามกติกา ต่างจากใบเสนอราคาปกติที่เป็นความลับ',
  },
  {
    id: 'UC-11',
    title: 'มอบงานและอนุมัติ (Award)',
    actor: 'Procurement Officer · Approver',
    pre: ['เลือกผู้ชนะจากการเปรียบเทียบราคาหรือประมูลแล้ว'],
    steps: [
      'สร้างการมอบงานจากผู้ชนะ',
      'ระบบบันทึก snapshot คะแนนไว้เป็นหลักฐาน ณ เวลาที่มอบงาน',
      'Approver ตรวจสอบและอนุมัติหรือปฏิเสธ',
      'ติดตามสถานะที่เมนู การมอบงาน',
    ],
    result: 'การมอบงานได้รับอนุมัติและพร้อมออก PO',
    caution: 'ระบบเตือนเมื่อมอบงานให้ผู้จัดจำหน่ายที่มีความเสี่ยงสูง/วิกฤต · คะแนนที่บันทึกใน Award จะไม่เปลี่ยนตามการแก้เกณฑ์ภายหลัง',
  },
  {
    id: 'UC-12',
    title: 'ปรับเกณฑ์การประเมิน (เพิ่ม / แก้ / ลบหัวข้อ)',
    actor: 'Admin / QA',
    pre: ['มีนโยบายหรือมาตรฐานที่เปลี่ยนแปลง'],
    steps: [
      'เข้าเมนู เกณฑ์ความเสี่ยง → เลือกหมวดผู้ขาย',
      'เพิ่มหัวข้อ: กด + เพิ่มหัวข้อใหม่ ระบุหมวด ชื่อ คะแนนเต็ม วิธีรวมคะแนน กลุ่มเกณฑ์ และแหล่งตรวจ',
      'หากเลือกแหล่งตรวจเป็น "Auto จากใบเสนอราคา" ต้องเลือกด้วยว่าใช้ข้อมูลใด (ราคา / การส่งมอบ / เครดิตเทอม)',
      'ลบหัวข้อ: กดปุ่มถังขยะ ระบบจะแจ้งจำนวนข้อมูลที่จะถูกลบตามไปด้วย',
      'ทั้งการเพิ่มและลบจะเข้าสู่หน้า "ปรับคะแนน" ให้ตรวจคะแนนรายหัวข้อและช่วงเกรดก่อนยืนยัน',
      'ระบบคำนวณช่วงเกรด A/B/C/D ใหม่ให้อัตโนมัติตามสัดส่วนเดิม แก้ไขเองได้',
      'กดยืนยันเพื่อบันทึกทั้งชุดพร้อมกัน',
    ],
    result: 'เกณฑ์ใหม่มีผลทันที คะแนนผู้ขายคำนวณใหม่อัตโนมัติ',
    caution: 'หากต้องการเก็บประวัติการประเมินเดิมไว้ ให้ใช้สวิตช์ปิดใช้งานแทนการลบ · การเปลี่ยนแปลงทั้งหมดถูกบันทึกและย้อนกลับได้',
  },
  {
    id: 'UC-13',
    title: 'ติดตามใบรับรองและเอกสารหมดอายุ',
    actor: 'Procurement Officer / QA',
    pre: ['มีเอกสารที่บันทึกวันหมดอายุไว้'],
    steps: [
      'ดูการ์ด "ใบรับรองหมดอายุ" ที่หน้าแผงควบคุม',
      'คลิกเพื่อดูรายการทั้งหมด แยกแหล่งเป็น ใบรับรอง หรือ BRCGS',
      'กด เปิด เพื่อไปยังหน้าผู้จัดจำหน่ายที่เกี่ยวข้อง',
      'ประสานผู้จัดจำหน่ายให้อัปโหลดฉบับต่ออายุผ่านพอร์ทัล',
    ],
    result: 'เอกสารเป็นปัจจุบัน คะแนนประเมินสะท้อนสถานะจริง',
    caution: 'เอกสารที่หมดอายุจะถูกตัดออกจากคะแนนทันที และหากเป็นเอกสารบังคับ ผู้จัดจำหน่ายจะเข้าร่วม RFQ ไม่ได้',
  },
  {
    id: 'UC-14',
    title: 'ย้อนกลับการเปลี่ยนแปลงเกณฑ์ (Rollback)',
    actor: 'Admin / QA',
    pre: ['มีการเปลี่ยนแปลงเกณฑ์ที่ต้องการยกเลิก'],
    steps: [
      'เข้าเมนู เกณฑ์ความเสี่ยง',
      'กดปุ่ม ประวัติเกณฑ์ เพื่อดูรายการเพิ่ม/ลบหัวข้อและตัวเลือก พร้อมผู้ทำและเวลา',
      'กดปุ่ม ประวัติน้ำหนัก เพื่อดูการเปลี่ยนสัดส่วนน้ำหนักคะแนน',
      'เลือกรายการที่ต้องการแล้วกด ย้อนกลับ',
    ],
    result: 'เกณฑ์กลับสู่สถานะก่อนการเปลี่ยนแปลง รายการขึ้นป้าย "ย้อนกลับแล้ว"',
    caution: 'การย้อนกลับการลบหัวข้อจะคืนทั้งหัวข้อ ตัวเลือก ผลประเมินของผู้ขาย และเอกสารที่แนบไว้ · ย้อนกลับได้ 1 ครั้งต่อรายการ',
  },
];

// ── document ───────────────────────────────────────────────────────────────
const children = [];

// Cover
children.push(
  new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'คู่มือขั้นตอนการใช้งานระบบ', bold: true, size: 44, font: FONT, color: TEAL })] }),
  new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Smart Procurement', bold: true, size: 60, font: FONT })] }),
  new Paragraph({ spacing: { after: 1200 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'ระบบจัดซื้อและประเมินผู้จัดจำหน่ายตามมาตรฐาน BRCGS Food Safety Issue 9', size: 24, font: FONT, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'NSL Foods PLC', bold: true, size: 24, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: 'เอกสารอธิบายขั้นตอนการทำงาน (Workflow) แยกตามกรณีการใช้งาน', size: 20, font: FONT, color: GREY })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

// TOC
children.push(h1('สารบัญ'));
children.push(new TableOfContents('สารบัญ', { hyperlink: true, headingStyleRange: '1-2' }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1. Overview
children.push(h1('1. ภาพรวมระบบ'));
children.push(p('Smart Procurement ครอบคลุมกระบวนการจัดซื้อตั้งแต่การรับรองผู้จัดจำหน่าย การประเมินความเสี่ยงตามมาตรฐาน BRCGS การขอราคา การประมูล ไปจนถึงการมอบงาน โดยออกแบบให้ระบบประเมินอัตโนมัติจากหลักฐานให้มากที่สุด และเหลืองานที่ต้องใช้วิจารณญาณของเจ้าหน้าที่ให้น้อยที่สุด'));

children.push(h2('1.1 บทบาทผู้ใช้งาน'));
children.push(table(
  ['บทบาท', 'ชื่อไทย', 'สิทธิ์การใช้งานหลัก'],
  ROLES,
  [2200, 2000, 5438],
));
children.push(p(''));

children.push(h2('1.2 ลำดับงานหลัก (End-to-end)'));
[
  'ตั้งค่าระบบและเกณฑ์ประเมิน (Admin)',
  'รับรองผู้จัดจำหน่าย — ลงทะเบียน → เอกสารบริษัท → ประเมิน BRCGS → อนุมัติ',
  'เตรียม Catalog และกำหนดใบรับรองบังคับของสินค้า',
  'ออกใบขอราคา (RFQ) และเชิญเฉพาะผู้ที่ผ่านด่านเอกสารบังคับ',
  'รับใบเสนอราคา (AI ช่วยอ่าน) หรือเปิดประมูล e-Bidding',
  'เปรียบเทียบราคา 3 มิติ แล้วเลือกผู้ชนะ',
  'มอบงานและขออนุมัติ',
  'ติดตามเอกสารหมดอายุและทบทวนเกณฑ์เป็นระยะ',
].forEach(t => children.push(step(t)));

children.push(h2('1.3 โครงสร้างการให้คะแนน'));
children.push(p('คะแนนสุดท้ายที่ใช้ตัดสินผู้ชนะประกอบด้วย 3 เสา โดยแต่ละมิติถูกนับเพียงที่เดียวเพื่อไม่ให้เกิดการนับซ้ำ'));
children.push(table(
  ['เสา', 'คิดจาก', 'ที่มาของคะแนน'],
  [
    ['Commercial', 'ราคาสุทธิเท่านั้น', 'ใบเสนอราคา — ราคาต่ำสุดได้ 100 คะแนน ที่เหลือลดหลั่นตามสัดส่วน'],
    ['Technical', 'เกณฑ์เทคนิคเฉพาะของ RFQ', 'Technical checklist ที่กำหนดในแต่ละ RFQ'],
    ['Risk', 'เกรด BRCGS (A/B/C/D)', 'ความปลอดภัย/คุณภาพ + Delivery + Credit term'],
  ],
  [1800, 2600, 5238],
));
children.push(p(''));
children.push(note('เกรด BRCGS ภายในแบ่งเป็น 2 กลุ่ม: ความปลอดภัย & คุณภาพ กับ เชิงพาณิชย์ (Delivery + Credit term) ตาม BRCGS Clause 3.5.1.3 น้ำหนักกลุ่มความปลอดภัยต้องไม่น้อยกว่ากลุ่มเชิงพาณิชย์ ปัจจุบันตั้งไว้ที่ 70% / 30%'));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 2. Use cases
children.push(h1('2. ขั้นตอนการทำงานแยกตามกรณีใช้งาน (Use Cases)'));
USE_CASES.forEach((uc, i) => {
  children.push(h2(`${uc.id} — ${uc.title}`));
  children.push(table(
    ['หัวข้อ', 'รายละเอียด'],
    [['ผู้ใช้งาน', uc.actor]],
    [2000, 7638],
  ));
  children.push(p(''));

  children.push(h3('เงื่อนไขก่อนเริ่ม'));
  uc.pre.forEach(t => children.push(bullet(t)));

  children.push(h3('ขั้นตอน'));
  uc.steps.forEach(t => children.push(step(t)));

  children.push(h3('ผลลัพธ์'));
  children.push(p(uc.result));

  children.push(h3('ข้อควรระวัง'));
  children.push(note(uc.caution));
  children.push(p(''));
  if (i < USE_CASES.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
});

// 3. Glossary
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1('3. คำศัพท์ที่ใช้ในระบบ'));
children.push(table(
  ['คำศัพท์', 'ความหมาย'],
  [
    ['RFQ', 'ใบขอราคา — คำขอให้ผู้จัดจำหน่ายเสนอราคาสำหรับรายการที่กำหนด'],
    ['เอกสารบังคับ', 'ใบรับรอง/เอกสารที่ต้องมี มิฉะนั้นจะเข้าร่วมเสนอราคาไม่ได้ และไม่คิดคะแนน rate'],
    ['เลือกคะแนนสูงสุด', 'วิธีรวมคะแนนแบบเลือกระดับเดียวที่ดีที่สุด ไม่บวกสะสม'],
    ['บวกสะสม', 'วิธีรวมคะแนนแบบบวกทุกข้อที่มี แต่ไม่เกินคะแนนเต็มของหัวข้อ'],
    ['รอประเมิน', 'หัวข้อที่ยังไม่มีข้อมูลให้คิดคะแนน จะถูกตัดออกจากคะแนนเต็มชั่วคราว'],
    ['เกรดชั่วคราว', 'เกรดที่คำนวณจากหัวข้อที่ประเมินแล้วเท่านั้น ยังไม่ใช่ผลสรุป'],
    ['Final Score', 'คะแนนรวม 3 เสาที่ใช้จัดอันดับผู้เสนอราคา'],
    ['Rollback', 'การย้อนกลับการเปลี่ยนแปลงเกณฑ์ให้กลับสู่สถานะก่อนหน้า'],
  ],
  [2400, 7238],
));

// 4. Reference
children.push(p(''));
children.push(h1('4. เอกสารอ้างอิง'));
children.push(bullet('BRCGS Global Standard Food Safety Issue 9 — Clause 3.5.1.3 Supplier and Raw Material Approval and Performance Monitoring'));
children.push(bullet('คู่มือการใช้งานในระบบ — เมนู "คู่มือการใช้งาน" (ค้นหาได้ และแสดงเฉพาะหัวข้อตามสิทธิ์ของผู้ใช้)'));

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: FONT, color: TEAL },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 25, bold: true, font: FONT },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: FONT, color: GREY },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•',
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 260 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.',
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 260 } } } }] },
    ],
  },
  features: { updateFields: true },
  sections: [{
    properties: { page: { size: A4, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
    headers: {
      default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'Smart Procurement — คู่มือขั้นตอนการใช้งาน', size: 16, color: GREY, font: FONT })] })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'หน้า ', size: 16, color: GREY, font: FONT }),
                   new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: FONT })] })] }),
    },
    children,
  }],
});

mkdirSync('docs', { recursive: true });
const out = 'docs/Smart-Procurement-Workflow.docx';
Packer.toBuffer(doc).then(buf => {
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${(buf.length / 1024).toFixed(0)} KB, ${USE_CASES.length} use cases)`);
});
