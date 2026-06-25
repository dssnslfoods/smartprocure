import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, AlignmentType, BorderStyle, ShadingType,
  VerticalAlign, PageOrientation, convertInchesToTwip, Header,
  ImageRun, Footer, PageNumber, NumberFormat, LevelFormat, UnderlineType,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  primary:   '1E3A5F',   // dark navy
  accent:    '2563EB',   // blue
  green:     '16A34A',
  amber:     'D97706',
  red:       'DC2626',
  gray:      '64748B',
  lightGray: 'F1F5F9',
  white:     'FFFFFF',
  border:    'CBD5E1',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const bold   = (t, size = 22, color = '000000') => new TextRun({ text: t, bold: true,  size, color, font: 'TH Sarabun New' });
const normal = (t, size = 22, color = '111827') => new TextRun({ text: t, bold: false, size, color, font: 'TH Sarabun New' });
const italic = (t, size = 20, color = C.gray)   => new TextRun({ text: t, italics: true, size, color, font: 'TH Sarabun New' });

const para = (runs, opts = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [runs],
  spacing: { after: 120, before: opts.before ?? 0 },
  alignment: opts.align ?? AlignmentType.LEFT,
  ...opts,
});

const h1 = (text) => new Paragraph({
  text,
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 400, after: 200 },
  children: [new TextRun({ text, bold: true, size: 36, color: C.white, font: 'TH Sarabun New' })],
  shading: { type: ShadingType.SOLID, color: C.primary, fill: C.primary },
  indent: { left: 200 },
});

const h2 = (text) => new Paragraph({
  spacing: { before: 360, after: 160 },
  children: [new TextRun({ text, bold: true, size: 30, color: C.primary, font: 'TH Sarabun New' })],
  border: { bottom: { color: C.accent, style: BorderStyle.SINGLE, size: 6 } },
});

const h3 = (text) => new Paragraph({
  spacing: { before: 280, after: 120 },
  children: [new TextRun({ text: `▸ ${text}`, bold: true, size: 26, color: C.accent, font: 'TH Sarabun New' })],
});

const h4 = (text) => new Paragraph({
  spacing: { before: 200, after: 80 },
  children: [new TextRun({ text, bold: true, size: 24, color: '374151', font: 'TH Sarabun New' })],
});

const bullet = (text, level = 0) => new Paragraph({
  children: [normal(text, 22)],
  bullet: { level },
  spacing: { after: 80 },
});

const note = (text) => new Paragraph({
  children: [italic(`💡 ${text}`, 20, C.gray)],
  spacing: { before: 80, after: 120 },
  indent: { left: 400 },
  shading: { type: ShadingType.SOLID, color: 'FEF9C3', fill: 'FEF9C3' },
  border: { left: { color: C.amber, style: BorderStyle.SINGLE, size: 12 } },
});

const warning = (text) => new Paragraph({
  children: [bold(`⚠️  ${text}`, 22, C.red)],
  spacing: { before: 80, after: 120 },
  indent: { left: 400 },
  shading: { type: ShadingType.SOLID, color: 'FEF2F2', fill: 'FEF2F2' },
  border: { left: { color: C.red, style: BorderStyle.SINGLE, size: 12 } },
});

const spacer = (n = 1) => Array.from({ length: n }, () =>
  new Paragraph({ children: [normal('')], spacing: { after: 60 } })
);

// ─── Table builder ────────────────────────────────────────────────────────────
const cell = (text, opts = {}) => new TableCell({
  children: [new Paragraph({
    children: [new TextRun({
      text,
      bold: opts.header ?? false,
      size: opts.size ?? 20,
      color: opts.color ?? (opts.header ? C.white : '111827'),
      font: 'TH Sarabun New',
    })],
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: 60, after: 60 },
  })],
  shading: opts.header
    ? { type: ShadingType.SOLID, color: C.primary, fill: C.primary }
    : opts.shade
    ? { type: ShadingType.SOLID, color: C.lightGray, fill: C.lightGray }
    : undefined,
  verticalAlign: VerticalAlign.CENTER,
  width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  columnSpan: opts.span,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  borders: {
    top: { style: BorderStyle.SINGLE, color: C.border, size: 4 },
    bottom: { style: BorderStyle.SINGLE, color: C.border, size: 4 },
    left: { style: BorderStyle.SINGLE, color: C.border, size: 4 },
    right: { style: BorderStyle.SINGLE, color: C.border, size: 4 },
  },
});

const hrow = (...texts) => new TableRow({
  children: texts.map(t => Array.isArray(t) ? cell(t[0], { header: true, width: t[1] }) : cell(t, { header: true })),
  tableHeader: true,
});

const drow = (cells, shade = false) => new TableRow({
  children: cells.map(c =>
    Array.isArray(c)
      ? cell(c[0], { shade, size: 20, width: c[1], align: c[2] })
      : cell(c, { shade, size: 20 })
  ),
});

const table = (rows) => new Table({
  rows,
  width: { size: 100, type: WidthType.PERCENTAGE },
  margins: { top: 0, bottom: 0, left: 0, right: 0 },
});

// ─── Page break ───────────────────────────────────────────────────────────────
const pageBreak = () => new Paragraph({
  children: [new TextRun({ break: 1 })],
  pageBreakBefore: true,
});

// ─── Numbered step ────────────────────────────────────────────────────────────
const step = (n, text, detail = '') => new Paragraph({
  children: [
    bold(`${n}. `, 22, C.accent),
    normal(text, 22),
    ...(detail ? [italic(`  — ${detail}`, 20, C.gray)] : []),
  ],
  spacing: { before: 80, after: 100 },
  indent: { left: 200 },
});

// ─── Document sections ────────────────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'TH Sarabun New', size: 22 },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            bold('SmartProcure  ', 20, C.primary),
            normal('|  คู่มือ Workflow ระบบจัดซื้อ  |  NSL Foods PLC', 20, C.gray),
          ],
          alignment: AlignmentType.RIGHT,
          border: { bottom: { color: C.border, style: BorderStyle.SINGLE, size: 6 } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            normal('NSL Foods PLC — SmartProcure  |  เอกสารใช้ภายใน  |  หน้าที่ ', 18, C.gray),
            new TextRun({ children: [PageNumber.CURRENT], font: 'TH Sarabun New', size: 18, color: C.gray }),
            normal(' / ', 18, C.gray),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'TH Sarabun New', size: 18, color: C.gray }),
          ],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children: [
      // ══════════════════════════════════════════════════
      // COVER PAGE
      // ══════════════════════════════════════════════════
      ...spacer(4),
      new Paragraph({
        children: [bold('SmartProcure', 72, C.primary)],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [normal('ระบบจัดการจัดซื้อจัดจ้างอัจฉริยะ', 36, C.accent)],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [normal('─────────────────────────────────────', 28, C.border)],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [bold('คู่มือ Workflow การทำงานของระบบ', 40, C.primary)],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
      }),
      new Paragraph({
        children: [normal('สำหรับทีมจัดซื้อและผู้ที่เกี่ยวข้อง', 28, C.gray)],
        alignment: AlignmentType.CENTER,
      }),
      ...spacer(2),
      new Paragraph({
        children: [normal('NSL Foods PLC', 26, C.primary)],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [normal('เอกสารใช้ภายใน  |  เวอร์ชัน 1.0  |  เมษายน 2026', 22, C.gray)],
        alignment: AlignmentType.CENTER,
      }),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // TABLE OF CONTENTS (manual)
      // ══════════════════════════════════════════════════
      h2('สารบัญ'),
      para([bold('1. ', 22, C.accent), normal('ภาพรวมระบบ SmartProcure', 22)]),
      para([bold('2. ', 22, C.accent), normal('วงจรที่ 1 — Master Catalog & ราคาอ้างอิง', 22)]),
      para([bold('3. ', 22, C.accent), normal('วงจรที่ 2 — Supplier เสนอราคา (Price Submission)', 22)]),
      para([bold('4. ', 22, C.accent), normal('วงจรที่ 3 — สร้าง RFQ & รับ Quotation', 22)]),
      para([bold('5. ', 22, C.accent), normal('วงจรที่ 4 — ประเมินผลและ Award', 22)]),
      para([bold('6. ', 22, C.accent), normal('โมดูลสนับสนุน (Supplier Management & Admin Settings)', 22)]),
      para([bold('7. ', 22, C.accent), normal('สิทธิ์การใช้งานแต่ละ Role', 22)]),
      para([bold('8. ', 22, C.accent), normal('Quick Reference — สรุป Flow แบบย่อ', 22)]),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 1 — OVERVIEW
      // ══════════════════════════════════════════════════
      h1('1. ภาพรวมระบบ SmartProcure'),
      ...spacer(1),
      para([normal('SmartProcure คือระบบบริหารจัดการจัดซื้อจัดจ้างครบวงจรของ NSL Foods PLC ออกแบบมาเพื่อรองรับมาตรฐาน Food Safety (BRCGS) ควบคู่กับการควบคุมต้นทุนและความโปร่งใสในกระบวนการจัดซื้อ', 22)]),
      ...spacer(1),
      h3('4 วงจรหลักของระบบ'),
      table([
        hrow('วงจร', 'ชื่อ', 'ผู้รับผิดชอบหลัก', 'ผลลัพธ์'),
        drow(['วงจรที่ 1', 'Master Catalog & ราคาอ้างอิง', 'Admin / Procurement Officer', 'Catalog พร้อมใช้']),
        drow(['วงจรที่ 2', 'Supplier เสนอราคา', 'Supplier', 'ราคาบันทึกใน Database'], true),
        drow(['วงจรที่ 3', 'RFQ & รับ Quotation', 'Procurement + Supplier', 'Quotation ครบถ้วน']),
        drow(['วงจรที่ 4', 'ประเมินผลและ Award', 'Procurement / QA', 'Purchase Order'], true),
      ]),
      ...spacer(1),
      h3('ผู้ใช้งานในระบบ (Roles)'),
      table([
        hrow('Role', 'ชื่อในระบบ', 'หน้าที่หลัก'),
        drow(['Admin', 'admin', 'ดูแลระบบ, จัดการ User, กำหนด Settings']),
        drow(['จัดซื้อ', 'procurement_officer', 'สร้าง Catalog, RFQ, ประเมินผล, Award'], true),
        drow(['Supplier', 'supplier', 'เสนอราคา, Submit Quotation, แจ้ง Decline']),
        drow(['QA', 'qa', 'ประเมินความเสี่ยง, กำหนด Nominated Supplier, ร่วมประเมิน'], true),
      ]),
      ...spacer(1),
      note('Nominated Supplier คือ Supplier ที่ QA กำหนดให้จัดซื้อต้องซื้อจากเจ้านั้นเท่านั้น ตามข้อกำหนด BRCGS Food Safety โรงงานไม่มีสิทธิ์เปลี่ยนโดยไม่ผ่านการอนุมัติ'),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 2 — MASTER CATALOG
      // ══════════════════════════════════════════════════
      h1('2. วงจรที่ 1 — Master Catalog & ราคาอ้างอิง'),
      ...spacer(1),
      para([normal('Master Catalog คือฐานข้อมูลสินค้าหลักของระบบ จัดซื้อใช้เป็นจุดเริ่มต้นในการกำหนดความต้องการและราคาอ้างอิงก่อนออก RFQ', 22)]),
      ...spacer(1),

      h3('หมวดหมู่ Catalog (4 หมวด)'),
      table([
        hrow('Catalog', 'รายการตัวอย่าง'),
        drow(['วัตถุดิบบรรจุภัณฑ์', 'กล่อง, ฟิล์ม, ถุง, ฉลาก, กระดาษรอง']),
        drow(['วัตถุดิบอาหาร', 'แป้ง, น้ำมัน, น้ำตาล, เครื่องเทศ, สารปรุงแต่งรส'], true),
        drow(['เคมีภัณฑ์ & Cleaning', 'สารทำความสะอาด, น้ำยาฆ่าเชื้อ, สารซักล้าง']),
        drow(['อะไหล่ & MRO', 'อะไหล่เครื่องจักร, อุปกรณ์ซ่อมบำรุง, สารหล่อลื่น'], true),
      ]),
      ...spacer(1),

      h3('ขั้นตอนการตั้งค่า Catalog'),
      step(1, 'Login ด้วย Role Admin หรือ Procurement Officer'),
      step(2, 'ไปที่เมนู Pricelist → เลือก Catalog ที่ต้องการ'),
      step(3, 'ตรวจสอบรายการสินค้า — แต่ละรายการมีข้อมูล:'),
      bullet('ชื่อสินค้า และ Specification'),
      bullet('ประเภท: Open (แข่งราคา) หรือ Nominated (กำหนด Supplier)'),
      bullet('ปริมาณเป้าหมาย (Target Qty) — จำนวนที่วางแผนสั่งซื้อ'),
      bullet('ราคาอ้างอิง (Baseline) — คำนวณอัตโนมัติ'),
      step(4, 'แก้ไข Target Qty', 'คลิกที่ตัวเลขในคอลัมน์ Target Qty แล้วพิมพ์จำนวนใหม่'),
      ...spacer(1),

      h3('ประเภทรายการสินค้า'),
      table([
        hrow('ประเภท', 'ความหมาย', 'ใครเสนอราคาได้', 'การคำนวณ Baseline'),
        drow(['Open', 'เปิดแข่งราคาได้ทั่วไป', 'Supplier ที่ได้รับอนุมัติทุกราย', 'ค่าเฉลี่ยทุก Offer']),
        drow(['Nominated', 'QA กำหนด Supplier ไว้ (BRCGS)', 'เฉพาะ Supplier ที่ถูก Nominate', 'ราคาของ Nominated Supplier'], true),
      ]),
      ...spacer(1),
      warning('รายการ Nominated — จัดซื้อไม่สามารถเปลี่ยน Supplier ได้โดยไม่ผ่านการอนุมัติ QA เนื่องจากเป็นข้อกำหนดด้าน BRCGS Food Safety'),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 3 — PRICE SUBMISSION
      // ══════════════════════════════════════════════════
      h1('3. วงจรที่ 2 — Supplier เสนอราคา'),
      ...spacer(1),
      para([normal('Supplier สามารถเสนอราคาได้ 2 ช่องทาง ได้แก่ Excel Checklist (Offline) และ Supplier Portal (Online)', 22)]),
      ...spacer(1),

      h2('3A — ช่องทาง Excel Checklist (Offline)'),
      ...spacer(1),
      h4('ฝั่งจัดซื้อ — ส่ง Checklist'),
      step(1, 'ไปที่ Pricelist → เลือก Catalog'),
      step(2, 'ใช้ Checkbox เลือกรายการสินค้าที่ต้องการขอราคา'),
      step(3, 'เลือก Supplier จาก Dropdown และกรอก RFQ Number (ถ้ามี)'),
      step(4, 'กดปุ่ม "ส่ง Excel Checklist" → ไฟล์ .xlsx ถูก Download'),
      step(5, 'ส่งไฟล์ให้ Supplier ทาง Email หรือช่องทางอื่น'),
      ...spacer(1),

      h4('ฝั่ง Supplier — กรอกราคา'),
      step(1, 'เปิดไฟล์ Excel ที่ได้รับ'),
      para([italic('ไฟล์มี 2 Sheet:', 22, C.gray)], { before: 80 }),
      bullet('Sheet "Info" — ข้อมูล Supplier, วันที่, RFQ Number'),
      bullet('Sheet "Checklist" — รายการสินค้าพร้อมคอลัมน์ "ราคาต่อหน่วย" ให้กรอก'),
      step(2, 'กรอกราคาในคอลัมน์ "ราคาต่อหน่วย" (บาท)'),
      step(3, 'Save ไฟล์และส่งกลับให้จัดซื้อ'),
      note('ไม่ควรเปลี่ยนแปลงคอลัมน์อื่น โดยเฉพาะคอลัมน์ ID ที่ซ่อนอยู่ ระบบใช้ ID นี้จับคู่ข้อมูล'),
      ...spacer(1),

      h4('ฝั่งจัดซื้อ — Import ราคากลับ'),
      step(1, 'ในหน้า Catalog → กดปุ่ม "Import Quotation"'),
      step(2, 'เลือกไฟล์ Excel ที่ Supplier ส่งกลับมา'),
      step(3, 'ระบบแสดง Preview รายการก่อน Confirm'),
      step(4, 'กด "Confirm" → ราคาบันทึกเข้า Database ทันที'),
      ...spacer(1),

      h2('3B — ช่องทาง Supplier Portal (Online)'),
      ...spacer(1),
      h4('Supplier Login เข้าระบบ'),
      table([
        hrow(['ข้อมูล Login', 40], ['รายละเอียด', 60]),
        drow([['Username', 40], ['sup-XXXXX@nslfoods.test  (แทนที่ XXXXX ด้วย Supplier Code)', 60]]),
        drow([['Password', 40], ['123456 (เปลี่ยนได้ในระบบ)', 60]], true),
      ]),
      ...spacer(1),
      h4('ขั้นตอนเสนอราคาใน Portal'),
      step(1, 'Login → ไปที่เมนู Pricelist'),
      step(2, 'เลือก Catalog ที่ต้องการเสนอราคา'),
      step(3, 'กรอกราคาในคอลัมน์ "ราคาต่อหน่วย"'),
      para([italic('หมายเหตุ: Supplier เห็นเฉพาะรายการ Open ทั้งหมด และรายการ Nominated ที่ตัวเองถูก Nominate', 20, C.gray)]),
      step(4, 'กด Submit → จัดซื้อเห็นราคาทันที'),
      ...spacer(1),

      h3('รอบการเสนอราคา (Update Cycle)'),
      para([normal('Admin กำหนดรอบการอัพเดทราคาได้ที่ Admin → Settings → Pricelist', 22)]),
      ...spacer(1),
      table([
        hrow('สถานะ', 'ความหมาย', 'สัญลักษณ์'),
        drow(['ส่งแล้ว (Fresh)', 'ยังอยู่ในช่วง Hold Period ไม่ต้องส่งใหม่', '🟢 สีเขียว']),
        drow(['ใกล้ถึงรอบ (Due Soon)', 'เหลือน้อยกว่า 30 วันก่อนถึงรอบ', '🟡 สีเหลือง'], true),
        drow(['ถึงรอบแล้ว (Overdue)', 'เกินกำหนดแล้ว ควรส่งราคาใหม่', '🔴 สีแดง']),
        drow(['ยังไม่เคยส่ง (Never)', 'ยังไม่มีการเสนอราคาในรอบนี้', '⚫ สีเทา'], true),
      ]),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 4 — RFQ
      // ══════════════════════════════════════════════════
      h1('4. วงจรที่ 3 — สร้าง RFQ & รับ Quotation'),
      ...spacer(1),

      h2('4A — การสร้าง RFQ'),
      para([normal('RFQ (Request for Quotation) คือเอกสารขอราคาอย่างเป็นทางการ สร้างได้ 2 วิธี:', 22)]),
      ...spacer(1),

      h4('วิธีที่ 1: สร้างจาก Price List (แนะนำ)'),
      step(1, 'ในหน้า Catalog → เลือกรายการที่ต้องการสั่งซื้อด้วย Checkbox'),
      step(2, 'กดปุ่ม "Create RFQ"'),
      step(3, 'ระบบสร้าง RFQ + รายการสินค้า (rfq_items) โดยอัตโนมัติ'),
      step(4, 'Supplier ที่เคยเสนอราคารายการนั้นถูกเพิ่มเป็น Invited Suppliers อัตโนมัติ'),
      note('วิธีนี้ช่วยประหยัดเวลา เพราะระบบเชื่อมโยงข้อมูลราคาอ้างอิงจาก Catalog เข้า RFQ ให้อัตโนมัติ'),
      ...spacer(1),

      h4('วิธีที่ 2: สร้างเอง (Manual)'),
      step(1, 'ไปที่เมนู RFQ → กดปุ่ม "New RFQ"'),
      step(2, 'กรอกข้อมูล: ชื่อ RFQ, วันสิ้นสุด, หมวดหมู่'),
      step(3, 'เพิ่มรายการสินค้าในแท็บ Items'),
      step(4, 'เชิญ Supplier ในแท็บ Invite Suppliers'),
      ...spacer(1),

      h2('4B — สถานะ RFQ'),
      para([normal('สถานะ RFQ เปลี่ยนได้จาก Dropdown (ไม่ใช่ปุ่มลำดับแบบ Step)', 22)]),
      ...spacer(1),
      table([
        hrow('สถานะ', 'ความหมาย', 'เงื่อนไขในการเปลี่ยน'),
        drow(['Draft', 'กำลังเตรียม RFQ', 'ไม่มีเงื่อนไข']),
        drow(['Published', 'ส่งให้ Supplier แล้ว รับ Quotation ได้', 'ต้องมี Supplier ≥ 1 รายในรายการ'], true),
        drow(['Closed', 'ปิดรับ Quotation แล้ว', 'ไม่มีเงื่อนไข']),
        drow(['Evaluation', 'อยู่ระหว่างประเมินราคา', 'ไม่มีเงื่อนไข'], true),
        drow(['Awarded', 'มอบหมายงานแล้ว', 'ต้องมีการเลือก Recommended Winner ก่อน']),
      ]),
      ...spacer(1),

      h2('4C — การเชิญ Supplier'),
      para([normal('ในแท็บ "Invite Suppliers" ของ RFQ:', 22)]),
      ...spacer(1),
      h4('ส่วน "Invited" — Supplier ที่เชิญแล้ว'),
      bullet('แสดงสถานะ: รอตอบ / ตอบแล้ว / ถอนตัว (พร้อมเหตุผล)'),
      bullet('จัดซื้อสามารถ Remove Supplier ออกจาก RFQ ได้ (เฉพาะตอน Status = Draft)'),
      ...spacer(1),
      h4('ส่วน "Available" — Supplier ที่ยังไม่ได้เชิญ'),
      bullet('แสดง Eligibility Badge สำหรับแต่ละ Supplier'),
      ...spacer(1),
      table([
        hrow('Eligibility Badge', 'ความหมาย'),
        drow(['✅  Eligible', 'เชิญได้ทันที ผ่านเกณฑ์ทุกข้อ']),
        drow(['⚠️  Warning', 'มีข้อควรระวัง เช่น ใบรับรองใกล้หมดอายุ'], true),
        drow(['🔴  Blocked', 'ถูก Blacklist หรือ Status ไม่ผ่าน ไม่ควรเชิญ']),
      ]),
      ...spacer(1),

      h2('4D — Supplier รับ / ปฏิเสธ RFQ'),
      ...spacer(1),
      h4('กรณีที่ 1 — เสนอราคา (Submit Quotation)'),
      step(1, 'Supplier Login → ไปที่ RFQ ที่ได้รับเชิญ'),
      step(2, 'เปิดแท็บ "Quotations"'),
      step(3, 'เห็นชื่อบริษัทตัวเองแสดงอัตโนมัติ (ไม่ต้องเลือก)'),
      step(4, 'กรอกราคาแต่ละรายการ'),
      step(5, 'กด Submit → จัดซื้อเห็น Quotation ทันที'),
      ...spacer(1),
      h4('กรณีที่ 2 — ถอนตัว (Decline to Quote)'),
      step(1, 'Supplier กดปุ่ม "ถอนตัว / Decline"'),
      step(2, 'กรอกเหตุผล (บังคับกรอก)'),
      step(3, 'กด Confirm'),
      step(4, 'จัดซื้อเห็นสถานะ "ถอนตัว" พร้อมเหตุผล ใน Tab Invite Suppliers'),
      note('Supplier สามารถ "ยกเลิกการถอนตัว" ได้ตราบเท่าที่ RFQ ยังอยู่ในสถานะ Published'),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 5 — EVALUATION & AWARD
      // ══════════════════════════════════════════════════
      h1('5. วงจรที่ 4 — ประเมินผลและ Award'),
      ...spacer(1),

      h2('5A — ดู Quotation ที่ได้รับ'),
      para([normal('แท็บ "Quotations" ใน RFQ Detail แสดง:', 22)]),
      bullet('Quotation ที่ Supplier Submit แล้ว เรียงตามวันที่'),
      bullet('ราคาแต่ละรายการ เปรียบเทียบกับราคาอ้างอิง (Baseline)'),
      bullet('Section แยกสำหรับ "Supplier ที่ถอนตัว" พร้อมเหตุผล'),
      ...spacer(1),

      h2('5B — ประเมินและเลือก Winner'),
      step(1, 'เปลี่ยน Status เป็น "Evaluation"'),
      step(2, 'ใช้แท็บ Evaluation เปรียบเทียบราคาจากทุก Supplier เคียงกัน'),
      step(3, 'คำนวณ Score จาก: ราคา + คุณภาพ + ระยะเวลาส่งมอบ'),
      step(4, 'Tick "แนะนำให้เลือก (Recommended Winner)" ที่ Quotation ของผู้ชนะ'),
      warning('ระบบจะไม่ยอมเปลี่ยน Status เป็น "Awarded" จนกว่าจะมีการ Mark Recommended Winner'),
      ...spacer(1),

      h2('5C — Award'),
      step(1, 'เมื่อเลือก Winner แล้ว → เปลี่ยน Status เป็น "Awarded"'),
      step(2, 'ระบบสร้าง Award Record อัตโนมัติ'),
      step(3, 'หน้า RFQ Detail แสดง 🏆 ชื่อ Supplier ที่ชนะ + คะแนน'),
      step(4, 'ดำเนินการต่อด้วยการออก Purchase Order'),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 6 — SUPPORT MODULES
      // ══════════════════════════════════════════════════
      h1('6. โมดูลสนับสนุน'),
      ...spacer(1),

      h2('6A — Supplier Management'),
      para([normal('เมนู Suppliers แสดงรายชื่อ Supplier ทั้งหมดพร้อมตัวกรองหลายมิติ', 22)]),
      ...spacer(1),
      h3('ตัวกรองที่มีในหน้า Supplier List'),
      table([
        hrow('ตัวกรอง', 'ตัวเลือก'),
        drow(['Status', 'draft / submitted / review / approved / rejected / suspended']),
        drow(['Tier', 'Silver / Gold / Platinum'], true),
        drow(['ประเภทใบรับรอง', 'GMP, HACCP, ISO9001, ISO22000, BRCGS, FSSC22000, HALAL, IFS, KOSHER']),
        drow(['สถานะใบรับรอง', 'ใช้งานได้ (>90 วัน) / ใกล้หมดอายุ (≤90 วัน) / หมดอายุแล้ว'], true),
      ]),
      ...spacer(1),
      h3('สีของ Badge ใบรับรองในตาราง'),
      table([
        hrow('สี', 'ความหมาย'),
        drow(['🟢 สีเขียว', 'ใบรับรองยังใช้งานได้ (เกิน 90 วัน)']),
        drow(['🟡 สีเหลือง', 'ใกล้หมดอายุ (น้อยกว่า 90 วัน)'], true),
        drow(['🔴 สีแดง', 'หมดอายุแล้ว — ควรติดตามให้ Supplier ต่ออายุ']),
      ]),
      ...spacer(1),

      h2('6B — Risk Assessment'),
      para([normal('ระบบประเมินความเสี่ยง Supplier ใน 10 หมวดหมู่:', 22)]),
      ...spacer(1),
      table([
        hrow(['หมวดความเสี่ยง', 50], ['ความหมาย', 50]),
        drow([['Food Safety', 50], ['ระบบความปลอดภัยด้านอาหาร', 50]]),
        drow([['Quality System', 50], ['ระบบควบคุมคุณภาพ', 50]], true),
        drow([['Delivery & Logistics', 50], ['ความน่าเชื่อถือในการส่งมอบ', 50]]),
        drow([['Financial Stability', 50], ['สถานะทางการเงิน', 50]], true),
        drow([['Certification Status', 50], ['สถานะใบรับรองมาตรฐาน', 50]]),
        drow([['Food Fraud', 50], ['ความเสี่ยงการปลอมปน', 50]], true),
        drow([['Allergen Management', 50], ['การจัดการสารก่อภูมิแพ้', 50]]),
        drow([['Country of Origin Risk', 50], ['ความเสี่ยงตามแหล่งกำเนิดสินค้า', 50]], true),
        drow([['Critical Material', 50], ['การพึ่งพาวัตถุดิบวิกฤต', 50]]),
        drow([['NCR History', 50], ['ประวัติ Non-Conformance Report', 50]], true),
      ]),
      ...spacer(1),

      h3('การจัดกลุ่ม ABC / XYZ'),
      table([
        hrow('มิติ', 'ระดับ A / X', 'ระดับ B / Y', 'ระดับ C / Z'),
        drow(['ABC (มูลค่า)', 'มูลค่าสูง', 'มูลค่าปานกลาง', 'มูลค่าต่ำ']),
        drow(['XYZ (ความแปรปรวน)', 'ความต้องการสม่ำเสมอ', 'ความแปรปรวนปานกลาง', 'ความแปรปรวนสูง'], true),
      ]),
      note('Priority Score 1–9 (9 = Critical) คำนวณจาก ABC × XYZ — ใช้ตัดสินใจลำดับความสำคัญในการจัดซื้อ'),
      ...spacer(1),

      h2('6C — Admin Settings'),
      table([
        hrow(['Setting', 40], ['รายละเอียด', 60]),
        drow([['Update Cycle (วัน)', 40], ['กำหนดรอบเวลาที่ Supplier ต้องอัพเดทราคา เช่น 90 วัน', 60]]),
        drow([['Hold Period (วัน)', 40], ['ระยะเวลา "ล็อค" หลังส่งราคา เช่น 30 วัน ไม่ต้องส่งใหม่', 60]], true),
      ]),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 7 — ROLES & PERMISSIONS
      // ══════════════════════════════════════════════════
      h1('7. สิทธิ์การใช้งานแต่ละ Role'),
      ...spacer(1),
      table([
        hrow('ฟีเจอร์', 'Admin', 'Procurement', 'Supplier', 'QA'),
        drow(['สร้าง/แก้ไข Catalog', '✅', '✅', '❌', '❌']),
        drow(['กำหนด Target Qty', '✅', '✅', '❌', '❌'], true),
        drow(['กำหนด Nominated Supplier', '✅', '❌', '❌', '✅']),
        drow(['เสนอราคาใน Portal', '❌', '❌', '✅', '❌'], true),
        drow(['Export/Import Excel', '✅', '✅', '❌', '❌']),
        drow(['สร้าง RFQ', '✅', '✅', '❌', '❌'], true),
        drow(['เชิญ Supplier ใน RFQ', '✅', '✅', '❌', '❌']),
        drow(['Submit Quotation', '❌', '❌', '✅', '❌'], true),
        drow(['ถอนตัวจาก RFQ', '❌', '❌', '✅', '❌']),
        drow(['เลือก Recommended Winner', '✅', '✅', '❌', '✅'], true),
        drow(['Award RFQ', '✅', '✅', '❌', '❌']),
        drow(['จัดการ User', '✅', '❌', '❌', '❌'], true),
        drow(['Admin Settings', '✅', '❌', '❌', '❌']),
      ]),

      pageBreak(),

      // ══════════════════════════════════════════════════
      // SECTION 8 — QUICK REFERENCE
      // ══════════════════════════════════════════════════
      h1('8. Quick Reference — สรุป Flow แบบย่อ'),
      ...spacer(1),

      h2('Flow สำหรับจัดซื้อ'),
      table([
        hrow(['ขั้นตอน', 10], ['การดำเนินการ', 55], ['เมนูในระบบ', 35]),
        drow([['1', 10], ['กำหนด Target Qty ในแต่ละรายการสินค้า', 55], ['Pricelist → Catalog', 35]]),
        drow([['2', 10], ['ส่ง Excel Checklist ให้ Supplier หรือรอกรอกใน Portal', 55], ['Pricelist → ปุ่มส่ง Excel', 35]], true),
        drow([['3', 10], ['Import ราคากลับจาก Excel (ถ้าใช้ช่องทาง Excel)', 55], ['Pricelist → Import Quotation', 35]]),
        drow([['4', 10], ['สร้าง RFQ จาก Catalog หรือสร้างใหม่เอง', 55], ['Pricelist → Create RFQ หรือ RFQ → New', 35]], true),
        drow([['5', 10], ['Publish RFQ → Supplier รับการเชิญ', 55], ['RFQ Detail → Dropdown Status', 35]]),
        drow([['6', 10], ['ติดตามการตอบกลับ / Supplier ถอนตัว', 55], ['RFQ Detail → Invite Suppliers', 35]], true),
        drow([['7', 10], ['Close → Evaluation → เลือก Winner', 55], ['RFQ Detail → Evaluation Tab', 35]]),
        drow([['8', 10], ['Award → ดำเนินการออก PO ต่อ', 55], ['RFQ Detail → Dropdown → Awarded', 35]], true),
      ]),
      ...spacer(1),

      h2('Flow สำหรับ Supplier'),
      table([
        hrow(['ขั้นตอน', 10], ['การดำเนินการ', 55], ['เมนูในระบบ', 35]),
        drow([['1', 10], ['Login เข้าระบบด้วย sup-XXXXX@nslfoods.test', 55], ['หน้า Login', 35]]),
        drow([['2', 10], ['เห็น Catalog ที่ตัวเองมีสิทธิ์เสนอราคา', 55], ['Pricelist', 35]], true),
        drow([['3', 10], ['กรอกราคาใน Portal (รายการ Open ทุกรายการ)', 55], ['Pricelist → Catalog → กรอกราคา', 35]]),
        drow([['4', 10], ['รับ Invitation จาก RFQ ที่จัดซื้อสร้าง', 55], ['RFQ List', 35]], true),
        drow([['5', 10], ['Submit Quotation หรือแจ้ง Decline พร้อมเหตุผล', 55], ['RFQ Detail → Quotations Tab', 35]]),
      ]),
      ...spacer(1),

      new Paragraph({
        children: [
          bold('─────────────────────────────────────────────────────────', 18, C.border),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 },
      }),
      new Paragraph({
        children: [normal('เอกสารนี้จัดทำโดย SmartProcure System  |  NSL Foods PLC  |  เมษายน 2026', 20, C.gray)],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [italic('หากมีข้อสงสัยหรือต้องการแก้ไข กรุณาติดต่อทีม IT หรือ Admin ของระบบ', 20, C.gray)],
        alignment: AlignmentType.CENTER,
      }),
    ],
  }],
});

// ─── Write file ───────────────────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'SmartProcure_Workflow_Guide.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log(`✅  Saved: ${outPath}`);
});
