// Smart Procurement — Thai User Manual DOCX Generator
// Run: /usr/local/bin/node docs/generate-manual.js

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents, ExternalHyperlink
} = require('/Users/arnonarpaket/.npm-global/lib/node_modules/docx');
const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT        = 'TH Sarabun New';  // Thai-capable font
const FONT_BODY   = 24;  // 12pt
const FONT_H1     = 40;  // 20pt
const FONT_H2     = 32;  // 16pt
const FONT_H3     = 28;  // 14pt
const COLOR_H1    = '1F3864';  // Dark navy
const COLOR_H2    = '2E5090';  // Blue
const COLOR_H3    = '2E5090';
const COLOR_NOTE  = '555555';
const COLOR_MUTED = '666666';
const TBL_HDR     = 'D6E4F0';  // Table header bg
const TBL_ALT     = 'F4F8FC';  // Alternate row bg

// A4 page: 11906 x 16838 DXA, margins 1440 each side → content width = 9026
const PAGE_W    = 11906;
const PAGE_H    = 16838;
const MARGIN    = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2;  // 9026

// ─── Helpers ──────────────────────────────────────────────────────────────────
const run = (text, opts = {}) => new TextRun({
  text,
  font: FONT,
  size: opts.size || FONT_BODY,
  bold:   opts.bold   || false,
  italics: opts.italic || false,
  color:  opts.color  || undefined,
  strike: opts.strike || false,
});

const para = (runs, opts = {}) => new Paragraph({
  children: Array.isArray(runs) ? runs : [runs],
  alignment: opts.align || AlignmentType.LEFT,
  spacing:  { before: opts.before || 0, after: opts.after || 120, line: opts.line || 276 },
  indent:   opts.indent ? { left: opts.indent } : undefined,
  ...(opts.heading ? { heading: opts.heading } : {}),
  ...(opts.numbering ? { numbering: opts.numbering } : {}),
  ...(opts.pageBreak ? { pageBreakBefore: true } : {}),
  ...(opts.border ? { border: opts.border } : {}),
});

const h1 = (text, opts = {}) => para(
  [run(text, { size: FONT_H1, bold: true, color: COLOR_H1 })],
  { heading: HeadingLevel.HEADING_1, before: 360, after: 200, ...opts }
);

const h2 = (text, opts = {}) => para(
  [run(text, { size: FONT_H2, bold: true, color: COLOR_H2 })],
  { heading: HeadingLevel.HEADING_2, before: 280, after: 160, ...opts }
);

const h3 = (text, opts = {}) => para(
  [run(text, { size: FONT_H3, bold: true, color: COLOR_H3 })],
  { heading: HeadingLevel.HEADING_3, before: 200, after: 120, ...opts }
);

const body = (text, opts = {}) => para(
  [run(text, { size: opts.size })],
  { before: 0, after: 120, ...opts }
);

const note = (text) => para(
  [run('หมายเหตุ: ', { bold: true, color: '1F3864' }), run(text, { color: COLOR_NOTE })],
  {
    before: 120, after: 120,
    indent: 360,
    border: {
      left: { style: BorderStyle.THICK, size: 12, color: '2E5090', space: 6 }
    }
  }
);

const bullet = (text, level = 0, ref = 'bullets') => para(
  parseMixed(text),
  { numbering: { reference: ref, level }, before: 40, after: 80 }
);

const numItem = (text, level = 0) => para(
  parseMixed(text),
  { numbering: { reference: 'numbers', level }, before: 40, after: 80 }
);

// Parse text with **bold** markers into TextRun array
function parseMixed(text) {
  const parts = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(run(text.slice(last, m.index)));
    parts.push(run(m[1], { bold: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(run(text.slice(last)));
  return parts;
}

const emptyPara = () => new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 0, after: 80 } });

// ─── Table builder ────────────────────────────────────────────────────────────
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'C5D9EA' };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function makeTable(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const makeCell = (text, isHeader = false, colIdx = 0) => {
    const fill = isHeader ? TBL_HDR : (rows.indexOf && colIdx % 2 === 0 ? 'FFFFFF' : 'FFFFFF');
    const shading = isHeader
      ? { fill: TBL_HDR, type: ShadingType.CLEAR }
      : undefined;
    const mixedRuns = typeof text === 'string' ? parseMixed(text) : [run(String(text))];
    return new TableCell({
      borders,
      width: { size: colWidths[0], type: WidthType.DXA },  // overridden below
      shading,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [new Paragraph({
        children: mixedRuns.map(r => new TextRun({
          ...r._data || {},
          text: isHeader ? r._data?.text || String(text) : r._data?.text || String(text),
          font: FONT,
          size: FONT_BODY,
          bold: isHeader || (r._data?.bold),
          color: isHeader ? '1F3864' : r._data?.color,
        })),
        spacing: { before: 0, after: 0 },
      })],
    });
  };

  // Re-implement with proper width per cell
  const makeCellProper = (text, isHeader, cIdx) => {
    const mixedRuns = parseMixed(String(text));
    return new TableCell({
      borders,
      width: { size: colWidths[cIdx], type: WidthType.DXA },
      shading: isHeader ? { fill: TBL_HDR, type: ShadingType.CLEAR } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [new Paragraph({
        children: mixedRuns.map(r => ({
          ...r,
          _data: { ...r._data, bold: isHeader ? true : r._data?.bold },
        })),
        spacing: { before: 0, after: 0 },
      })],
    });
  };

  // Simple cell builder
  const simpleCell = (text, isHeader, cIdx) => {
    const textParts = parseMixed(String(text));
    const children = textParts.map((_, i) => {
      // rebuild as proper TextRun
      const raw = String(text);
      return null;
    }).filter(Boolean);

    return new TableCell({
      borders,
      width: { size: colWidths[cIdx], type: WidthType.DXA },
      shading: isHeader ? { fill: TBL_HDR, type: ShadingType.CLEAR } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: [new Paragraph({
        children: parseMixed(String(text)).map(tr => new TextRun({
          text: tr._data?.text ?? String(text),
          font: FONT,
          size: FONT_BODY,
          bold: isHeader ? true : (tr._data?.bold || false),
          color: isHeader ? '1F3864' : undefined,
        })),
        spacing: { before: 0, after: 0 },
      })],
    });
  };

  const tableRows = [];

  // Header row
  if (headers && headers.length) {
    tableRows.push(new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => new TableCell({
        borders,
        width: { size: colWidths[i], type: WidthType.DXA },
        shading: { fill: TBL_HDR, type: ShadingType.CLEAR },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 80, bottom: 80, left: 160, right: 160 },
        children: [new Paragraph({
          children: [new TextRun({ text: String(h), font: FONT, size: FONT_BODY, bold: true, color: '1F3864' })],
          spacing: { before: 0, after: 0 },
        })],
      })),
    }));
  }

  // Data rows
  rows.forEach((row, ri) => {
    const bg = ri % 2 === 1 ? TBL_ALT : 'FFFFFF';
    tableRows.push(new TableRow({
      children: row.map((cell, ci) => {
        const cellText = String(cell);
        const parts = parseMixed(cellText);
        return new TableCell({
          borders,
          width: { size: colWidths[ci], type: WidthType.DXA },
          shading: { fill: bg, type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 80, bottom: 80, left: 160, right: 160 },
          children: [new Paragraph({
            children: parts.map(tr => new TextRun({
              text: tr._data?.text ?? cellText,
              font: FONT,
              size: FONT_BODY,
              bold: tr._data?.bold || false,
            })),
            spacing: { before: 0, after: 0 },
          })],
        });
      }),
    }));
  });

  return new Table({
    width: { size: totalW, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: tableRows,
  });
}

const codeStyle = (text) => para(
  [new TextRun({ text, font: 'Courier New', size: 20, color: '1F3864' })],
  {
    before: 80, after: 80, indent: 360,
    border: { left: { style: BorderStyle.SINGLE, size: 8, color: '2E5090', space: 4 } }
  }
);

// ─── Document Content ─────────────────────────────────────────────────────────
function buildDocument() {
  const children = [];

  // ── Cover Page ──────────────────────────────────────────────────────────────
  children.push(
    emptyPara(), emptyPara(), emptyPara(),
    para([new TextRun({ text: 'คู่มือการใช้งานระบบ', font: FONT, size: 60, bold: true, color: '1F3864' })], { align: AlignmentType.CENTER, before: 0, after: 240 }),
    para([new TextRun({ text: 'Smart Procurement', font: FONT, size: 72, bold: true, color: '2E5090' })], { align: AlignmentType.CENTER, before: 0, after: 200 }),
    para([new TextRun({ text: 'NSL Foods PLC', font: FONT, size: 36, color: COLOR_MUTED })], { align: AlignmentType.CENTER, before: 0, after: 600 }),
    new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E5090', space: 1 } }, spacing: { before: 0, after: 400 } }),
    para([new TextRun({ text: 'เวอร์ชัน 1.0  |  เมษายน 2569', font: FONT, size: 24, color: COLOR_MUTED })], { align: AlignmentType.CENTER, before: 0, after: 120 }),
    para([new TextRun({ text: 'ระบบจัดซื้อจัดจ้างอัจฉริยะ', font: FONT, size: 24, color: COLOR_MUTED })], { align: AlignmentType.CENTER }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ── TOC Page ────────────────────────────────────────────────────────────────
  children.push(
    h1('สารบัญ'),
    new TableOfContents('สารบัญ', { hyperlink: true, headingStyleRange: '1-3', stylesWithLevels: [] }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ภาพรวมระบบ
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('1. ภาพรวมระบบ'));
  children.push(body('**Smart Procurement** คือระบบจัดซื้อจัดจ้างแบบครบวงจรสำหรับ NSL Foods PLC ที่ออกแบบมาเพื่อบริหารจัดการกระบวนการจัดซื้อตั้งแต่ต้นจนจบ ได้แก่:'));

  const overview = [
    '**บริหาร Supplier** — ลงทะเบียน ตรวจสอบ และจัดการข้อมูล Supplier',
    '**ออก RFQ** — จัดทำใบขอราคาและเชิญ Supplier เสนอราคา',
    '**ประมูลออนไลน์** — จัดการประมูลย้อนกลับ (Reverse Auction) แบบ Real-time',
    '**เปรียบเทียบใบเสนอราคา** — เปรียบเทียบและคัดเลือก Supplier ที่ดีที่สุด',
    '**ตัดสินใจสั่งซื้อ** — บันทึกและอนุมัติการตัดสินใจจัดซื้อ',
    '**ประเมิน Supplier** — ให้คะแนนและเปรียบเทียบประสิทธิภาพ Supplier',
    '**รายงาน** — วิเคราะห์ค่าใช้จ่ายและผลการจัดซื้อ',
  ];
  overview.forEach(t => children.push(bullet(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. บทบาทผู้ใช้งาน
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('2. บทบาทผู้ใช้งาน'));
  children.push(body('ระบบแบ่งผู้ใช้งานออกเป็น **5 บทบาท** โดยแต่ละบทบาทมีสิทธิ์การใช้งานแตกต่างกัน:'));
  children.push(emptyPara());

  children.push(makeTable(
    ['บทบาท', 'ชื่อในระบบ', 'สิทธิ์หลัก'],
    [
      ['ผู้ดูแลระบบ', 'admin', 'เข้าถึงได้ทุกส่วน รวมถึงตั้งค่าระบบ อนุมัติ Supplier จัดการผู้ใช้'],
      ['เจ้าหน้าที่จัดซื้อ', 'procurement_officer', 'สร้าง/จัดการ RFQ, Supplier, Bidding, ใบเสนอราคา'],
      ['ผู้อนุมัติ', 'approver', 'อนุมัติ/ปฏิเสธ Awards, ดูข้อมูล Supplier'],
      ['ผู้บริหาร', 'executive', 'ดูข้อมูลภาพรวม, Awards, รายงาน (อ่านอย่างเดียว)'],
      ['Supplier', 'supplier', 'จัดการข้อมูลบริษัทตัวเอง, เสนอราคา, ร่วมประมูล'],
    ],
    [2200, 2500, 4326]
  ));
  children.push(emptyPara());

  children.push(h2('สรุปสิทธิ์การเข้าถึง'));
  children.push(makeTable(
    ['ฟีเจอร์', 'Admin', 'เจ้าหน้าที่จัดซื้อ', 'ผู้อนุมัติ', 'ผู้บริหาร', 'Supplier'],
    [
      ['แดชบอร์ด', '✅', '✅', '✅', '✅', '✅'],
      ['Supplier Portal', '', '', '', '', '✅'],
      ['รายชื่อ Supplier', '✅', '✅', '✅', '✅', ''],
      ['เพิ่ม/แก้ไข Supplier', '✅', '✅', '', '', ''],
      ['อนุมัติ Supplier', '✅', '', '', '', ''],
      ['RFQ', '✅', '✅', '', '', '✅ (ดู)'],
      ['e-Bidding', '✅', '✅', '', '', '✅ (เสนอราคา)'],
      ['Price Lists', '✅', '✅', '', '', '✅'],
      ['Final Quotations', '✅', '✅', '✅ (ดู)', '', ''],
      ['Awards', '✅', '✅ (ดู)', '✅ (อนุมัติ)', '✅ (ดู)', ''],
      ['ประเมิน Supplier', '✅', '✅', '', '', ''],
      ['รายงาน', '✅', '✅', '', '✅', ''],
      ['ตั้งค่าระบบ', '✅', '', '', '', ''],
    ],
    [2800, 1300, 2000, 1300, 1300, 1326]
  ));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. การเข้าสู่ระบบ
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('3. การเข้าสู่ระบบ'));

  children.push(h2('3.1 เข้าสู่ระบบสำหรับผู้ใช้ทั่วไป'));
  ['เปิดเบราว์เซอร์ไปที่ URL ของระบบ', 'กรอก **Email** และ **รหัสผ่าน**', 'กดปุ่ม **Sign in**', 'ระบบจะพาไปที่หน้า **Dashboard** โดยอัตโนมัติ'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());
  children.push(note('หากยังไม่มีบัญชี ให้ติดต่อผู้ดูแลระบบ หรือหากเป็น Supplier ใหม่ ให้กดลิงก์ "ลงทะเบียน Supplier" ที่หน้าเข้าสู่ระบบ'));

  children.push(h2('3.2 สำหรับ Supplier ที่เพิ่งลงทะเบียน'));
  ['หลังส่งข้อมูลลงทะเบียน ระบบจะ **ออกจากระบบให้อัตโนมัติ**', 'ต้องรอผู้ดูแลระบบ **อนุมัติ** ก่อนจึงจะเข้าสู่ระบบได้', 'เมื่อได้รับการอนุมัติแล้ว จะได้รับการแจ้งเตือน (ตามการตั้งค่าอีเมล)'].forEach(t => children.push(bullet(t)));

  children.push(h2('3.3 ออกจากระบบ'));
  children.push(bullet('คลิกที่ไอคอน **ออกจากระบบ (LogOut)** ที่ด้านล่างซ้ายของแถบเมนู'));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. หน้าแดชบอร์ด
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('4. หน้าแดชบอร์ด'));
  children.push(body('หน้าแดชบอร์ดแสดงภาพรวมสำคัญของระบบ เข้าถึงได้จากเมนู **Dashboard**'));

  children.push(h2('4.1 การ์ดสรุปสถิติ (KPI Cards)'));
  children.push(makeTable(
    ['การ์ด', 'ความหมาย'],
    [
      ['**Total Suppliers**', 'จำนวน Supplier ทั้งหมด (อนุมัติแล้ว + รอดำเนินการ)'],
      ['**Open RFQs**', 'จำนวน RFQ ที่อยู่ในสถานะ Draft'],
      ['**Active Auctions**', 'จำนวนการประมูลที่กำลังดำเนินอยู่'],
      ['**Pending Awards**', 'จำนวนการตัดสินใจสั่งซื้อที่รอการอนุมัติ'],
    ],
    [3000, 6026]
  ));
  children.push(note('คลิกที่การ์ดเพื่อไปยังหน้าที่เกี่ยวข้องได้โดยตรง'));

  children.push(h2('4.2 ส่วนแสดงผลเพิ่มเติม'));
  ['**Suppliers by Status** — แสดงสัดส่วน Supplier แต่ละสถานะในรูปแบบ Progress Bar', '**Recent Activity** — แสดงกิจกรรมล่าสุด (การลงทะเบียน Supplier, สร้าง RFQ, เปิดประมูล)', '**Top Rated Suppliers** — อันดับ Supplier ที่มีคะแนนสูงสุด พร้อมเหรียญ'].forEach(t => children.push(bullet(t)));

  children.push(h2('4.3 สีแสดงสถานะทั่วไป'));
  children.push(makeTable(
    ['สถานะ', 'สีที่แสดง', 'ความหมาย'],
    [
      ['Draft / แบบร่าง', 'เทา', 'ยังไม่ส่ง'],
      ['Submitted / รอตรวจสอบ', 'น้ำเงิน', 'ส่งแล้ว รอดำเนินการ'],
      ['Review / กำลังตรวจสอบ', 'เหลือง', 'อยู่ระหว่างตรวจสอบ'],
      ['Approved / อนุมัติแล้ว', 'เขียว', 'ผ่านการอนุมัติ'],
      ['Rejected / ถูกปฏิเสธ', 'แดง', 'ไม่ผ่านการอนุมัติ'],
      ['Suspended / ถูกระงับ', 'ส้ม', 'ถูกระงับการใช้งาน'],
    ],
    [3000, 1500, 4526]
  ));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. การจัดการ Supplier
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('5. การจัดการ Supplier'));
  children.push(body('เมนู **Suppliers** ใช้สำหรับดูและบริหารข้อมูล Supplier ทั้งหมดในระบบ (สำหรับ Admin, เจ้าหน้าที่จัดซื้อ, ผู้อนุมัติ, ผู้บริหาร)'));

  children.push(h2('5.1 รายชื่อ Supplier'));
  children.push(body('**วิธีค้นหา Supplier:**'));
  ['พิมพ์ชื่อบริษัทหรือเลขภาษีในช่อง **Search**', 'กรองตาม **สถานะ** (Status) จาก Dropdown', 'กรองตาม **Tier** จาก Dropdown'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());
  children.push(makeTable(
    ['คอลัมน์', 'ความหมาย'],
    [
      ['**Company**', 'ชื่อบริษัท (คลิกเพื่อดูรายละเอียด)'],
      ['**Tax ID**', 'เลขประจำตัวผู้เสียภาษี'],
      ['**Status**', 'สถานะปัจจุบัน'],
      ['**Tier**', 'ระดับ Supplier (Critical Tier 1 / Non-Critical Tier 1)'],
      ['**Created**', 'วันที่เพิ่มในระบบ'],
    ],
    [2500, 6526]
  ));
  children.push(emptyPara());
  children.push(body('**เพิ่ม Supplier ใหม่** (Admin / เจ้าหน้าที่จัดซื้อ):'));
  ['กดปุ่ม "+" มุมบนขวา', 'กรอกข้อมูลในฟอร์ม', 'กดปุ่ม **"Create Supplier"**'].forEach(t => children.push(numItem(t)));

  children.push(h2('5.2 รายละเอียด Supplier'));
  children.push(body('คลิกชื่อบริษัทจากรายชื่อเพื่อดูรายละเอียด'));
  children.push(makeTable(
    ['แท็บ', 'เนื้อหา'],
    [
      ['**Information**', 'ชื่อ, Tax ID, Email, โทรศัพท์, เว็บไซต์, Tier, ที่อยู่, Preferred, Blacklisted, หมายเหตุ'],
      ['**Contacts**', 'รายชื่อผู้ติดต่อ, ตำแหน่ง, อีเมล, โทรศัพท์, ป้าย Primary'],
      ['**Documents**', 'รายการเอกสารที่อัปโหลด, ชื่อไฟล์, ประเภท, ขนาดไฟล์, ดาวน์โหลด'],
      ['**ESG Profile**', 'คะแนน Environmental/Social/Governance (0-100), ระดับความเสี่ยง, สถานะ Compliance'],
    ],
    [2500, 6526]
  ));

  children.push(h2('5.3 การเปลี่ยนสถานะ Supplier'));
  children.push(makeTable(
    ['สถานะปัจจุบัน', 'ปุ่มที่ใช้', 'สถานะถัดไป'],
    [
      ['Draft', 'Send to Review', 'Submitted'],
      ['Submitted', 'Start Review', 'Review'],
      ['Review', 'Approve', 'Approved'],
      ['Review', 'Reject', 'Rejected'],
      ['Rejected', 'Return to Draft', 'Draft'],
    ],
    [2500, 3500, 3026]
  ));
  children.push(note('สิทธิ์: Admin, เจ้าหน้าที่จัดซื้อ, และผู้อนุมัติ สามารถเปลี่ยนสถานะได้'));

  children.push(h2('5.4 แก้ไขข้อมูล Supplier'));
  ['เข้าหน้ารายละเอียด Supplier', 'กดปุ่ม **Edit** มุมบนขวา', 'แก้ไขข้อมูลที่ต้องการ', 'กด **"Update Supplier"**'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. การลงทะเบียน Supplier ใหม่
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('6. การลงทะเบียน Supplier ใหม่'));
  children.push(body('Supplier สามารถลงทะเบียนผ่านลิงก์ **"ลงทะเบียน Supplier"** ที่หน้าเข้าสู่ระบบ **โดยไม่ต้องล็อกอิน**'));
  children.push(body('กระบวนการลงทะเบียนมี **5 ขั้นตอน:**'));

  // Step 1
  children.push(h2('ขั้นตอนที่ 1: ข้อมูลบริษัท'));
  children.push(makeTable(
    ['ฟิลด์', 'บังคับ', 'คำอธิบาย'],
    [
      ['ชื่อบริษัท', '✅', 'ชื่อเต็มของบริษัท'],
      ['เลขประจำตัวผู้เสียภาษี (Tax ID)', '✅', 'เลข 13 หลัก'],
      ['เว็บไซต์', '', 'URL เว็บไซต์บริษัท'],
      ['ที่อยู่', '', 'ที่อยู่จดทะเบียน'],
      ['จังหวัด/เมือง', '', ''],
      ['ประเทศ', '', 'ค่าเริ่มต้น: Thailand'],
      ['เบอร์โทรศัพท์', '', ''],
      ['หมายเหตุ', '', 'ข้อมูลเพิ่มเติม'],
    ],
    [3500, 1000, 4526]
  ));

  // Step 2
  children.push(h2('ขั้นตอนที่ 2: ข้อมูลติดต่อ'));
  children.push(makeTable(
    ['ฟิลด์', 'บังคับ', 'คำอธิบาย'],
    [
      ['ชื่อผู้ติดต่อ', '✅', 'ชื่อ-นามสกุลผู้ติดต่อหลัก'],
      ['ตำแหน่ง', '', 'ตำแหน่งงาน'],
      ['อีเมลผู้ติดต่อ', '✅', 'อีเมลสำหรับติดต่อ'],
      ['เบอร์โทรผู้ติดต่อ', '', 'โทรศัพท์'],
    ],
    [3500, 1000, 4526]
  ));

  // Step 3
  children.push(h2('ขั้นตอนที่ 3: ข้อมูลธนาคาร'));
  children.push(makeTable(
    ['ฟิลด์', 'คำอธิบาย'],
    [
      ['ชื่อธนาคาร', 'เช่น กสิกรไทย, ไทยพาณิชย์'],
      ['สาขา', 'สาขาที่เปิดบัญชี'],
      ['ชื่อบัญชี', 'ชื่อเจ้าของบัญชี'],
      ['เลขที่บัญชี', ''],
      ['ประเภทบัญชี', 'ออมทรัพย์ / กระแสรายวัน / ฝากประจำ'],
      ['SWIFT Code', 'สำหรับโอนเงินระหว่างประเทศ'],
    ],
    [3000, 6026]
  ));

  // Step 4
  children.push(h2('ขั้นตอนที่ 4: เอกสาร'));
  children.push(body('อัปโหลดเอกสารประกอบการพิจารณา **(ต้องอัปโหลดอย่างน้อย 1 รายการ)**'));
  children.push(makeTable(
    ['ประเภทเอกสาร', 'คำอธิบาย'],
    [
      ['หนังสือรับรองบริษัท', 'DBD หรือเทียบเท่า'],
      ['ภพ.20', 'ทะเบียนภาษีมูลค่าเพิ่ม'],
      ['หนังสือจดทะเบียนพาณิชย์', ''],
      ['สำเนาบัตรประชาชนกรรมการ', ''],
      ['หนังสือรับรองบัญชีธนาคาร', ''],
      ['งบการเงิน', ''],
      ['เอกสารอื่นๆ', ''],
    ],
    [4000, 5026]
  ));
  children.push(note('ขนาดไฟล์สูงสุด: 10 MB ต่อไฟล์  |  ประเภทไฟล์ที่รองรับ: PDF, JPG, PNG, DOC, DOCX'));

  // Step 5
  children.push(h2('ขั้นตอนที่ 5: สร้างบัญชีผู้ใช้'));
  children.push(makeTable(
    ['ฟิลด์', 'บังคับ', 'หมายเหตุ'],
    [
      ['ชื่อ-นามสกุล', '✅', ''],
      ['อีเมลสำหรับเข้าสู่ระบบ', '✅', 'ใช้เป็น Username'],
      ['รหัสผ่าน', '✅', 'ขั้นต่ำ 6 ตัวอักษร'],
      ['ยืนยันรหัสผ่าน', '✅', 'ต้องตรงกับรหัสผ่าน'],
    ],
    [3500, 1000, 4526]
  ));
  children.push(body('กดปุ่ม **"ส่งข้อมูลลงทะเบียน"** เพื่อส่งข้อมูล'));

  children.push(h2('หลังการลงทะเบียน'));
  ['ระบบจะออกจากระบบให้อัตโนมัติ', '**ต้องรอผู้ดูแลระบบอนุมัติ** จึงจะเข้าสู่ระบบได้', 'Admin จะได้รับการแจ้งเตือนในระบบ (และอีเมล ถ้าตั้งค่าไว้)', 'เมื่ออนุมัติแล้ว Supplier จะได้รับการแจ้งเตือน'].forEach(t => children.push(bullet(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Supplier Portal
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('7. Supplier Portal'));
  children.push(body('สำหรับ **Supplier** ที่ได้รับการอนุมัติแล้ว เข้าใช้งานผ่านเมนู **"Supplier Portal"**'));

  children.push(h2('7.1 หน้าหลัก Supplier Portal'));
  children.push(body('แสดงการ์ดสรุป 4 ใบ: **บริษัท**, **ผู้ติดต่อ**, **เอกสาร**, **Tax ID** พร้อมป้ายแสดงสถานะการอนุมัติ'));

  children.push(h2('7.2 แท็บ: ข้อมูลบริษัท'));
  ['แก้ไขข้อมูลที่ต้องการ', 'กด **"บันทึกข้อมูล"**'].forEach(t => children.push(numItem(t)));

  children.push(h2('7.3 แท็บ: ผู้ติดต่อ'));
  children.push(body('**เพิ่มผู้ติดต่อใหม่:**'));
  ['กด **"เพิ่มผู้ติดต่อ"**', 'กรอก: ชื่อ-นามสกุล, ตำแหน่ง, อีเมล, เบอร์โทร', 'กด **"บันทึก"**'].forEach(t => children.push(numItem(t)));
  children.push(bullet('**แก้ไข/ลบผู้ติดต่อ:** กดไอคอนดินสอหรือถังขยะในแต่ละรายการ'));

  children.push(h2('7.4 แท็บ: เอกสาร'));
  children.push(body('**อัปโหลดเอกสารใหม่:**'));
  ['กด **"อัปโหลดเอกสาร"**', 'กรอกชื่อเอกสาร (เช่น "หนังสือรับรองบริษัท 2568")', 'เลือกประเภทเอกสาร', 'เลือกไฟล์ (PDF, JPG, PNG, DOC, DOCX — ไม่เกิน 10 MB)', 'กด **"อัปโหลด"**'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. การออก RFQ
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('8. การออก RFQ (Request for Quotation)'));
  children.push(body('**RFQ** คือใบขอราคาที่ส่งให้ Supplier เสนอราคาสินค้าหรือบริการ (เมนู **RFQ** สำหรับ Admin และเจ้าหน้าที่จัดซื้อ)'));

  children.push(h2('8.1 ขั้นตอนการทำ RFQ'));
  children.push(codeStyle('Draft  →  Published  →  Closed  →  Evaluation  →  Awarded'));
  children.push(emptyPara());
  children.push(makeTable(
    ['ขั้นตอน', 'ความหมาย', 'ปุ่มที่ใช้'],
    [
      ['Draft', 'กำลังร่าง ยังไม่เปิดรับราคา', 'Publish RFQ'],
      ['Published', 'เปิดรับราคาจาก Supplier', 'Close Submissions'],
      ['Closed', 'ปิดรับราคาแล้ว กำลังประเมิน', 'Start Evaluation'],
      ['Evaluation', 'กำลังประเมินใบเสนอราคา', 'Mark Awarded'],
      ['Awarded', 'ตัดสินใจแล้ว', '—'],
    ],
    [2000, 3500, 3526]
  ));

  children.push(h2('8.2 สร้าง RFQ ใหม่'));
  ['ไปที่เมนู **RFQ**', 'กดปุ่ม **"Create RFQ"**', 'กรอกข้อมูล (ดูตารางด้านล่าง)', 'กด **"Create RFQ"**'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());
  children.push(makeTable(
    ['ฟิลด์', 'บังคับ', 'คำอธิบาย'],
    [
      ['Title', '✅', 'ชื่อ RFQ เช่น "RFQ สินค้า A ไตรมาส 2/2569"'],
      ['Description', '', 'รายละเอียดความต้องการ'],
      ['Deadline', '', 'วันและเวลาปิดรับราคา'],
      ['Notes', '', 'หมายเหตุเพิ่มเติม'],
      ['Item Name (Line Items)', '✅', 'ชื่อสินค้า/บริการ (กด + Add Item เพื่อเพิ่ม)'],
      ['Quantity / Unit', '', 'จำนวนและหน่วย เช่น กก., ชิ้น, ลัง'],
      ['Specifications', '', 'ข้อกำหนดเพิ่มเติม'],
    ],
    [3000, 1000, 5026]
  ));

  children.push(h2('8.3 เชิญ Supplier'));
  ['เข้าหน้ารายละเอียด RFQ', 'คลิกแท็บ **"Invited Suppliers"**', '**คอลัมน์ขวา:** ค้นหา Supplier ที่อนุมัติแล้ว → ติ๊กเลือก → กด **"Invite (X)"**', 'Supplier ที่เชิญแล้วจะย้ายมาแสดงใน **คอลัมน์ซ้าย**'].forEach(t => children.push(numItem(t)));
  children.push(note('ต้องเชิญ Supplier อย่างน้อย 1 ราย จึงจะ Publish RFQ ได้'));

  children.push(h2('8.4 รับและดูใบเสนอราคา'));
  ['เข้าหน้ารายละเอียด RFQ', 'คลิกแท็บ **"Quotations"**', 'กด **"Submit Quotation"** เพื่อป้อนราคาจาก Supplier'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. e-Bidding
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('9. ระบบ e-Bidding'));
  children.push(body('ระบบ **e-Bidding** หรือการประมูลย้อนกลับ (Reverse Auction) ช่วยให้ Supplier แข่งกันเสนอราคาต่ำสุดแบบ Real-time'));

  children.push(h2('9.1 ขั้นตอนการประมูล'));
  children.push(codeStyle('Scheduled (กำหนดการ)  →  Active (กำลังประมูล)  →  Closed (ปิดแล้ว)'));
  children.push(emptyPara());

  children.push(h2('9.2 สร้างงานประมูลใหม่'));
  children.push(makeTable(
    ['ฟิลด์', 'บังคับ', 'คำอธิบาย'],
    [
      ['Title', '✅', 'ชื่องานประมูล'],
      ['Linked RFQ', '', 'เชื่อมกับ RFQ ที่ Published (ถ้ามี)'],
      ['Start Time', '✅', 'วันเวลาเริ่มประมูล'],
      ['End Time', '✅', 'วันเวลาสิ้นสุด'],
      ['Max Rounds', '', 'จำนวนรอบสูงสุด'],
      ['Description', '', 'รายละเอียด'],
    ],
    [3000, 1000, 5026]
  ));

  children.push(h2('9.3 การจัดการงานประมูล'));
  children.push(makeTable(
    ['ปุ่ม', 'การกระทำ'],
    [
      ['Start Auction', 'เปลี่ยนสถานะเป็น Active เริ่มรับการประมูล'],
      ['Next Round', 'ขึ้นรอบถัดไป'],
      ['Close Auction', 'ปิดการประมูลก่อนกำหนด (สีแดง)'],
    ],
    [3000, 6026]
  ));

  children.push(h2('9.4 หน้ารายละเอียดงานประมูล'));
  children.push(makeTable(
    ['การ์ด Real-time', 'ความหมาย'],
    [
      ['Time Left', 'เวลาที่เหลือ (ชั่วโมง:นาที:วินาที)'],
      ['Round', 'รอบปัจจุบัน / รอบสูงสุด'],
      ['Lowest Bid', 'ราคาเสนอต่ำสุดในขณะนั้น'],
      ['Total Bids', 'จำนวนการเสนอราคาทั้งหมด'],
    ],
    [3000, 6026]
  ));
  children.push(emptyPara());
  children.push(makeTable(
    ['แท็บ', 'เนื้อหา'],
    [
      ['Live Ranking', 'อันดับ Supplier จากราคาต่ำสุด อัปเดต Real-time (อันดับ 1 พื้นหลังสีเขียว)'],
      ['Submit Bid', 'เลือก Supplier, กรอกราคา, กด "Submit Bid"'],
      ['All Bids History', 'ประวัติการเสนอราคาทั้งหมด แยกตามรอบ (R1, R2, ...)'],
    ],
    [2500, 6526]
  ));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Price Lists
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('10. Price Lists'));
  children.push(body('**Price Lists** ใช้สำหรับจัดเก็บราคาสินค้า/บริการที่ Supplier ส่งมาให้ (เมนู **Price Lists**)'));
  children.push(makeTable(
    ['คอลัมน์', 'ความหมาย'],
    [
      ['Title', 'ชื่อ Price List'],
      ['Supplier', 'บริษัท Supplier'],
      ['Valid Until', 'วันหมดอายุ'],
      ['Status', 'Draft / Submitted / Active / Expired'],
    ],
    [2500, 6526]
  ));
  children.push(body('กด **"Submit Price List"** เพื่อส่ง Price List ใหม่ (สำหรับ Supplier / Admin)'));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Final Quotations
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('11. Final Quotations'));
  children.push(body('**Final Quotations** คือใบเสนอราคาสุดท้ายที่นำมาเปรียบเทียบก่อนตัดสินใจสั่งซื้อ (เมนู **Final Quotations**)'));

  children.push(h2('11.1 แท็บ: All Quotations'));
  children.push(makeTable(
    ['สถานะ', 'สีที่แสดง', 'ความหมาย'],
    [
      ['Pending', 'เหลือง', 'รอการพิจารณา'],
      ['Selected', 'น้ำเงิน', 'ถูกเลือกแล้ว'],
      ['Ready for PO', 'เขียว', 'พร้อมออก PO'],
      ['Rejected', 'แดง', 'ถูกปฏิเสธ'],
    ],
    [2500, 2000, 4526]
  ));
  children.push(emptyPara());
  children.push(makeTable(
    ['ปุ่ม', 'เงื่อนไข', 'การกระทำ'],
    [
      ['View', 'ทุกสถานะ', 'ดูรายละเอียด'],
      ['Select', 'Pending', 'เลือก Supplier นี้'],
      ['PO Ready', 'Selected', 'ทำเครื่องหมาย Ready for PO'],
      ['Create Award', 'Ready for PO', 'สร้างการตัดสินใจสั่งซื้อ'],
    ],
    [2000, 2500, 4526]
  ));

  children.push(h2('11.2 สร้าง Final Quotation ใหม่'));
  ['กด **"Create Final Quotation"**', 'เลือก **RFQ** ที่เกี่ยวข้อง', '(ไม่บังคับ) เลือก **Import from Quotation** เพื่อดึงข้อมูลมาอัตโนมัติ', 'กรอกข้อมูล: Supplier, Total Amount, Currency, Payment Terms, Delivery Terms, Notes', 'กด **"Create"**'].forEach(t => children.push(numItem(t)));

  children.push(h2('11.3 แท็บ: Comparison (เปรียบเทียบใบเสนอราคา)'));
  ['เลือก **RFQ** ที่ต้องการเปรียบเทียบ', 'ตารางจะแสดง Supplier แต่ละรายเป็นคอลัมน์', '**ราคาต่ำสุดจะแสดงด้วยพื้นหลังสีเขียว**', 'เปรียบเทียบ: ราคา, สกุลเงิน, เงื่อนไขชำระ, เงื่อนไขส่งของ, สถานะ PO'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Awards
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('12. Awards (การตัดสินใจสั่งซื้อ)'));
  children.push(body('**Awards** คือบันทึกการตัดสินใจสั่งซื้อที่รอการอนุมัติจากผู้มีอำนาจ (เมนู **Awards**)'));

  children.push(h2('12.1 การ์ดสรุปสถิติ'));
  children.push(makeTable(
    ['การ์ด', 'ความหมาย'],
    [['Total Awards','จำนวนการตัดสินใจทั้งหมด'],['Pending Approval','รออนุมัติ (เหลือง)'],['Approved','อนุมัติแล้ว (เขียว)'],['PO Ready','พร้อมออก PO (น้ำเงิน)']],
    [3000, 6026]
  ));

  children.push(h2('12.2 สถานะของ Award'));
  children.push(makeTable(
    ['สถานะ', 'สีที่แสดง', 'ความหมาย'],
    [
      ['Pending Approval', 'เหลือง', 'รออนุมัติ'],
      ['Approved', 'เขียว', 'อนุมัติแล้ว'],
      ['Rejected', 'แดง', 'ถูกปฏิเสธ'],
      ['Needs Revision', 'น้ำเงิน', 'ต้องแก้ไข'],
    ],
    [2500, 2000, 4526]
  ));

  children.push(h2('12.3 การอนุมัติ Award (Admin / ผู้อนุมัติ)'));
  ['กดปุ่ม **View** เพื่อดูรายละเอียด', 'อ่านข้อมูล: Supplier, RFQ, มูลค่า, Recommendation, Decision Reason', 'กรอก **Decision Reason** (เหตุผล)', 'เลือก: **Approve** (อนุมัติ) / **Reject** (ปฏิเสธ) / **Revise** (ส่งกลับแก้ไข)'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. การประเมิน Supplier
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('13. การประเมิน Supplier'));
  children.push(body('ใช้ประเมินประสิทธิภาพการทำงานของ Supplier (เมนู **Evaluations** สำหรับ Admin และเจ้าหน้าที่จัดซื้อ)'));

  children.push(h2('13.1 สีของคะแนน'));
  children.push(makeTable(
    ['ช่วงคะแนน', 'สี', 'ความหมาย'],
    [['4.0 – 5.0','เขียว','ดีเยี่ยม'],['3.0 – 3.9','น้ำเงิน','ดี'],['2.0 – 2.9','เหลือง','พอใช้'],['< 2.0','แดง','ต้องปรับปรุง']],
    [2500, 2000, 4526]
  ));

  children.push(h2('13.2 สร้าง Template การประเมิน'));
  ['กด **"New Template"**', 'กรอก **Template Name**', 'กด **"+"** เพิ่มเกณฑ์: ชื่อเกณฑ์, คำอธิบาย, น้ำหนัก (%) — **รวมทุกเกณฑ์ต้องเท่ากับ 100%**', 'กด **"Create Template"**'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());
  children.push(makeTable(
    ['เกณฑ์เริ่มต้น', 'น้ำหนัก'],
    [['Price Competitiveness','30%'],['Quality','25%'],['Delivery','20%'],['Service','15%'],['ESG Compliance','10%']],
    [4500, 4526]
  ));

  children.push(h2('13.3 ประเมิน Supplier'));
  ['กด **"Score Supplier"**', 'เลือก **Supplier** (เฉพาะที่อนุมัติแล้ว)', 'เลือก **Template** (เกณฑ์ที่จะใช้)', 'กรอก **Period** เช่น Q1 2026', 'ให้คะแนนแต่ละเกณฑ์ (1–5) โดยเลื่อน Slider', '(ไม่บังคับ) กรอก Comment สำหรับแต่ละเกณฑ์', 'กด **"Submit Evaluation"**'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());
  children.push(makeTable(
    ['คะแนน', 'ความหมาย', 'สี'],
    [['5','Excellent / ดีเยี่ยม','เขียว'],['4','Good / ดี','น้ำเงิน'],['3','Average / ปานกลาง','เหลือง'],['2','Below Average / ต่ำกว่าเกณฑ์','ส้ม'],['1','Poor / แย่','แดง']],
    [1500, 3500, 4026]
  ));

  children.push(h2('13.4 เปรียบเทียบ Supplier (Comparison)'));
  ['กด **"Compare"**', 'เลือก Template', 'ระบบแสดง **Auto-Ranking** จัดอันดับจากคะแนนสูงสุด พร้อมเหรียญ', 'ดู **Detailed Matrix** ตารางเปรียบเทียบคะแนนแต่ละเกณฑ์'].forEach(t => children.push(numItem(t)));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. รายงาน
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('14. รายงานและวิเคราะห์'));
  children.push(body('เมนู **Reports** สำหรับ Admin, เจ้าหน้าที่จัดซื้อ, ผู้บริหาร'));

  children.push(makeTable(
    ['การ์ด KPI', 'คำอธิบาย'],
    [['Total Spend (YTD)','ยอดจัดซื้อรวมในปีนี้ (฿)'],['Savings Rate','อัตราการประหยัด (%)'],['RFQ Win Rate','อัตราความสำเร็จของ RFQ (%)'],['Active Suppliers','จำนวน Supplier ที่ Active']],
    [3000, 6026]
  ));
  children.push(emptyPara());
  children.push(makeTable(
    ['แท็บ', 'กราฟ', 'รายละเอียด'],
    [
      ['Spending Trends', 'Area Chart + Bar Chart', 'ยอดจัดซื้อรายเดือน 12 เดือน และการประหยัด 6 เดือนหลัง'],
      ['RFQ Analytics', 'Bar Chart + Line Chart', 'จำนวน RFQ (Created/Awarded/Cancelled) และ Cycle Time'],
      ['Supplier Performance', 'Pie + Radar + Table', 'สัดส่วนสถานะ, เปรียบเทียบ 5 มิติ, อันดับ Supplier'],
    ],
    [2200, 2500, 4326]
  ));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. ตั้งค่าระบบ
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('15. ตั้งค่าระบบ'));
  children.push(body('เมนู **Admin Settings** สำหรับ Admin เท่านั้น'));

  children.push(h2('15.1 แท็บ: Users (จัดการผู้ใช้)'));
  children.push(body('**สร้างผู้ใช้ใหม่:** กด "Create User" → กรอก Full Name, Email, Password, Role → กด "Create"'));
  children.push(note('Role ที่เลือกได้: Admin / Procurement Officer / Approver / Executive / Supplier'));

  children.push(h2('15.2 แท็บ: Email (ตั้งค่าอีเมล)'));
  children.push(makeTable(
    ['ฟิลด์ SMTP', 'คำอธิบาย'],
    [
      ['SMTP Host', 'ที่อยู่ Server เช่น smtp.gmail.com'],
      ['Port', 'เช่น 587'],
      ['Username', 'อีเมลสำหรับส่ง'],
      ['Password', 'รหัสผ่าน'],
      ['ชื่อผู้ส่ง', 'ชื่อที่จะแสดงในอีเมล'],
      ['อีเมลผู้ส่ง', 'อีเมลที่จะแสดงเป็น "From"'],
    ],
    [3000, 6026]
  ));
  children.push(emptyPara());
  children.push(body('**เหตุการณ์ที่ส่งอีเมล:**'));
  ['Supplier ลงทะเบียนใหม่ → แจ้ง Admin', 'อนุมัติ Supplier → แจ้ง Supplier', 'ปฏิเสธ Supplier → แจ้ง Supplier'].forEach(t => children.push(bullet(t)));
  children.push(body('**ตัวแปรในเทมเพลต:** {{company_name}}, {{supplier_name}}, {{login_url}}, {{reason}}'));
  children.push(body('กด **"บันทึกการตั้งค่า"** เมื่อแก้ไขเสร็จ'));

  children.push(h2('15.3 แท็บ: Config (น้ำหนักคะแนน)'));
  children.push(makeTable(
    ['เกณฑ์', 'น้ำหนัก'],
    [['Service Score','40%'],['Commercial Score','25%'],['ESG Score','20%'],['Reliability','15%']],
    [4000, 5026]
  ));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 16. การอนุมัติ Supplier
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('16. การอนุมัติ Supplier'));
  children.push(body('เมนู **Supplier Approvals** สำหรับ Admin เท่านั้น'));

  children.push(makeTable(
    ['การ์ด', 'สี', 'ความหมาย'],
    [['รอตรวจสอบ','เหลือง','Supplier ส่งข้อมูลมาแล้ว รอตรวจสอบ'],['กำลังตรวจสอบ','น้ำเงิน','อยู่ระหว่างพิจารณา'],['ทั้งหมด','เทา','จำนวนรวมทั้งสองสถานะ']],
    [2500, 1500, 5026]
  ));
  children.push(emptyPara());

  children.push(h2('16.1 ขั้นตอนการอนุมัติ'));
  ['กดปุ่ม **"ตรวจสอบ"** เพื่อเปิดรายละเอียด', 'ตรวจสอบ: ข้อมูลบริษัท, ข้อมูลติดต่อ, เอกสาร (ดาวน์โหลดตรวจสอบ)'].forEach(t => children.push(numItem(t)));
  children.push(body('**กรณีอนุมัติ:** กด "อนุมัติ" → ระบบเปิดใช้งานบัญชี Supplier และส่งแจ้งเตือน'));
  children.push(body('**กรณีปฏิเสธ:** กรอก "เหตุผลกรณีปฏิเสธ" (บังคับ) → กด "ปฏิเสธ" → ระบบส่งแจ้งเตือนพร้อมเหตุผล'));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 17. ระบบแจ้งเตือน
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('17. ระบบแจ้งเตือน'));
  children.push(body('**ไอคอนกระดิ่ง** ที่มุมบนขวาของหน้า'));
  ['**ตัวเลขสีแดง** บนไอคอน = จำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน', 'คลิกไอคอนเพื่อดูรายการแจ้งเตือนล่าสุด (20 รายการ)', 'คลิกที่แจ้งเตือนเพื่ออ่านและไปยังหน้าที่เกี่ยวข้อง', 'กด **"อ่านทั้งหมด"** เพื่อทำเครื่องหมายว่าอ่านแล้วทั้งหมด'].forEach(t => children.push(bullet(t)));
  children.push(emptyPara());
  children.push(makeTable(
    ['เหตุการณ์', 'ผู้รับแจ้งเตือน'],
    [['Supplier ลงทะเบียนใหม่','Admin ทุกคน'],['Supplier ได้รับการอนุมัติ','Supplier นั้น'],['Supplier ถูกปฏิเสธ','Supplier นั้น (พร้อมเหตุผล)']],
    [4500, 4526]
  ));
  children.push(note('การแจ้งเตือนอัปเดตแบบ Real-time โดยไม่ต้อง Refresh หน้า'));
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // 18. FAQ
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(h1('18. คำถามที่พบบ่อย (FAQ)'));

  const faqs = [
    ['ลืมรหัสผ่าน ต้องทำอย่างไร?', 'ติดต่อผู้ดูแลระบบ (Admin) เพื่อรีเซ็ตรหัสผ่านให้'],
    ['ทำไม Supplier ถึงเข้าสู่ระบบไม่ได้หลังลงทะเบียน?', 'ต้องรอผู้ดูแลระบบอนุมัติก่อน เมื่ออนุมัติแล้วจึงจะเข้าสู่ระบบได้'],
    ['สร้าง RFQ แล้ว Publish ไม่ได้?', 'ตรวจสอบว่าได้เชิญ Supplier อย่างน้อย 1 รายแล้วในแท็บ "Invited Suppliers"'],
    ['ทำไม Supplier บางรายไม่ปรากฏในรายการเชิญ RFQ?', 'เฉพาะ Supplier ที่มีสถานะ Approved เท่านั้นที่จะปรากฏ'],
    ['ไฟล์เอกสารที่อัปโหลดได้สูงสุดเท่าไหร่?', 'สูงสุด 10 MB ต่อไฟล์ รองรับ PDF, JPG, PNG, DOC, DOCX'],
    ['ใครสามารถอนุมัติ Award ได้?', 'เฉพาะ Admin และ Approver เท่านั้น'],
    ['จะเปลี่ยนบทบาทผู้ใช้ได้อย่างไร?', 'Admin สามารถจัดการบทบาทได้ที่เมนู Admin Settings → Users'],
    ['ประมูล (Bidding) หยุดเองได้ไหม?', 'ใช่ ระบบปิดอัตโนมัติเมื่อถึงเวลา End Time หรือผู้ดูแลกด Close Auction'],
    ['คะแนน ESG คำนวณจากอะไร?', 'ค่าเฉลี่ยของ Environmental + Social + Governance (แต่ละด้าน 0–100)'],
  ];

  faqs.forEach(([q, a]) => {
    children.push(para([new TextRun({ text: 'Q: ' + q, font: FONT, size: FONT_BODY, bold: true, color: '1F3864' })], { before: 160, after: 60 }));
    children.push(para([new TextRun({ text: 'A: ' + a, font: FONT, size: FONT_BODY, color: '333333' })], { before: 0, after: 160, indent: 360 }));
  });
  children.push(emptyPara());

  // ═══════════════════════════════════════════════════════════════════════════
  // APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(h1('ภาคผนวก'));

  children.push(h2('ภาคผนวก ก: รายละเอียดสถานะทั้งหมด'));
  const workflows = [
    ['Supplier',     'draft → submitted → review → approved / rejected'],
    ['RFQ',          'draft → published → closed → evaluation → awarded'],
    ['Bidding',      'scheduled → active → closed / cancelled'],
    ['Award',        'pending → approved / rejected / revise'],
    ['Final Quotation', 'pending → selected → ready_for_po → (create award) / rejected'],
  ];
  workflows.forEach(([label, flow]) => {
    children.push(body(`**${label}:**`));
    children.push(codeStyle(flow));
    children.push(emptyPara());
  });

  children.push(h2('ภาคผนวก ข: ประเภทเอกสาร Supplier'));
  children.push(makeTable(
    ['รหัส', 'ชื่อเอกสาร'],
    [
      ['company_certificate', 'หนังสือรับรองบริษัท'],
      ['vat_registration', 'ภพ.20'],
      ['commercial_registration', 'หนังสือจดทะเบียนพาณิชย์'],
      ['director_id', 'สำเนาบัตรประชาชนกรรมการ'],
      ['bank_certificate', 'หนังสือรับรองบัญชีธนาคาร'],
      ['financial_statement', 'งบการเงิน'],
      ['other', 'เอกสารอื่นๆ'],
    ],
    [4000, 5026]
  ));
  children.push(emptyPara());

  children.push(h2('ภาคผนวก ค: เมนูและสิทธิ์การเข้าถึง'));
  children.push(makeTable(
    ['เมนู', 'Path', 'บทบาทที่เข้าถึงได้'],
    [
      ['Dashboard', '/', 'ทุกบทบาท'],
      ['Supplier Portal', '/supplier-portal', 'Supplier'],
      ['Suppliers', '/suppliers', 'Admin, เจ้าหน้าที่จัดซื้อ, ผู้อนุมัติ, ผู้บริหาร'],
      ['Price Lists', '/price-lists', 'Admin, เจ้าหน้าที่จัดซื้อ, Supplier'],
      ['RFQ', '/rfq', 'Admin, เจ้าหน้าที่จัดซื้อ, Supplier'],
      ['e-Bidding', '/bidding', 'Admin, เจ้าหน้าที่จัดซื้อ, Supplier'],
      ['Final Quotations', '/final-quotations', 'Admin, เจ้าหน้าที่จัดซื้อ, ผู้อนุมัติ'],
      ['Awards', '/awards', 'Admin, เจ้าหน้าที่จัดซื้อ, ผู้อนุมัติ, ผู้บริหาร'],
      ['Evaluations', '/evaluations', 'Admin, เจ้าหน้าที่จัดซื้อ'],
      ['Reports', '/reports', 'Admin, เจ้าหน้าที่จัดซื้อ, ผู้บริหาร'],
      ['Admin Settings', '/admin', 'Admin'],
      ['Supplier Approvals', '/admin/supplier-approvals', 'Admin'],
    ],
    [2500, 2500, 4026]
  ));
  children.push(emptyPara());

  // Footer note
  children.push(new Paragraph({ children: [], border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } }, spacing: { before: 480, after: 120 } }));
  children.push(para([new TextRun({ text: 'เอกสารนี้จัดทำขึ้นสำหรับระบบ Smart Procurement เวอร์ชัน 1.0 — NSL Foods PLC', font: FONT, size: 20, color: COLOR_MUTED })], { align: AlignmentType.CENTER }));

  return children;
}

// ─── Build Document ────────────────────────────────────────────────────────────
const children = buildDocument();

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: FONT, size: FONT_BODY } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: FONT_H1, bold: true, font: FONT, color: COLOR_H1 },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: FONT_H2, bold: true, font: FONT, color: COLOR_H2 },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: FONT_H3, bold: true, font: FONT, color: COLOR_H3 },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: FONT } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } }, run: { font: FONT } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'Smart Procurement — คู่มือการใช้งาน', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ text: '\tNSL Foods PLC', font: FONT, size: 18, color: COLOR_MUTED }),
          ],
          tabStops: [{ type: 'right', position: 9026 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
          spacing: { before: 0, after: 120 },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'เวอร์ชัน 1.0  |  เมษายน 2569\t', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ text: 'หน้า ', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ text: ' / ', font: FONT, size: 18, color: COLOR_MUTED }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR_MUTED }),
          ],
          tabStops: [{ type: 'right', position: 9026 }],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 1 } },
          spacing: { before: 120, after: 0 },
        })],
      }),
    },
    children,
  }],
});

const outDir  = path.join(__dirname);
const outPath = path.join(outDir, 'คู่มือการใช้งาน-Smart-Procurement.docx');

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outPath, buffer);
  console.log('✅ Created:', outPath);
  console.log('   Size:', (buffer.length / 1024).toFixed(1), 'KB');
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
