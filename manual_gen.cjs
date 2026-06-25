'use strict';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents,
} = require('docx');
const fs = require('fs');

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  teal:       '056A7A',
  orange:     'F37920',
  darkNav:    '0C1726',
  lightTeal:  'E8F4F6',
  lightOrange:'FEF3EA',
  gray:       'F5F5F5',
  midGray:    'CCCCCC',
  darkText:   '1A2B3C',
  white:      'FFFFFF',
};

// ─── Border helpers ───────────────────────────────────────────────────────────
function bdr(color) {
  if (!color) color = C.midGray;
  return { style: BorderStyle.SINGLE, size: 1, color: color };
}
function bdrs(color) {
  var b = bdr(color);
  return { top: b, bottom: b, left: b, right: b };
}
var noBdr  = { style: BorderStyle.NONE, size: 0, color: C.white };
var noBdrs = { top: noBdr, bottom: noBdr, left: noBdr, right: noBdr };

// ─── Basic paragraph helpers ─────────────────────────────────────────────────
function sp(n) {
  return new Paragraph({ children: [], spacing: { after: n } });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children: [new TextRun(text)],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun(text)],
    spacing: { before: 200, after: 80 },
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun(text)],
    spacing: { before: 160, after: 60 },
  });
}

function body(text) {
  return new Paragraph({
    children: [new TextRun({ text: text, font: 'Angsana New', size: 26, color: C.darkText })],
    spacing: { after: 80 },
  });
}

function bullet(text, level) {
  if (!level) level = 0;
  return new Paragraph({
    numbering: { reference: 'bullets', level: level },
    children: [new TextRun({ text: text, font: 'Angsana New', size: 26, color: C.darkText })],
    spacing: { after: 60 },
  });
}

function numItem(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    children: [new TextRun({ text: text, font: 'Angsana New', size: 26, color: C.darkText })],
    spacing: { after: 60 },
  });
}

// ─── Info / Warn boxes ────────────────────────────────────────────────────────
function infoBox(label, text) {
  var cellPara = new Paragraph({
    spacing: { after: 0 },
    children: [
      new TextRun({ text: label + ': ', font: 'Angsana New', size: 24, bold: true, color: C.teal }),
      new TextRun({ text: text, font: 'Angsana New', size: 24, color: C.darkText }),
    ],
  });
  var cell = new TableCell({
    borders: { top: bdr(C.teal), bottom: bdr(C.teal), left: { style: BorderStyle.SINGLE, size: 12, color: C.teal }, right: bdr(C.teal) },
    width: { size: 9026, type: WidthType.DXA },
    shading: { fill: C.lightTeal, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    children: [cellPara],
  });
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [9026],
    rows: [new TableRow({ children: [cell] })],
  });
}

function warnBox(text) {
  var cellPara = new Paragraph({
    spacing: { after: 0 },
    children: [
      new TextRun({ text: 'สำคัญ: ', font: 'Angsana New', size: 24, bold: true, color: C.orange }),
      new TextRun({ text: text, font: 'Angsana New', size: 24, color: C.darkText }),
    ],
  });
  var cell = new TableCell({
    borders: { top: bdr(C.orange), bottom: bdr(C.orange), left: { style: BorderStyle.SINGLE, size: 12, color: C.orange }, right: bdr(C.orange) },
    width: { size: 9026, type: WidthType.DXA },
    shading: { fill: C.lightOrange, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    children: [cellPara],
  });
  return new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [9026],
    rows: [new TableRow({ children: [cell] })],
  });
}

// ─── Step table ───────────────────────────────────────────────────────────────
function stepTable(steps) {
  var rows = steps.map(function(s, i) {
    var numCell = new TableCell({
      borders: noBdrs,
      width: { size: 800, type: WidthType.DXA },
      shading: { fill: C.teal, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({ text: String(i + 1), font: 'Arial', size: 28, bold: true, color: C.white })],
      })],
    });
    var textCell = new TableCell({
      borders: { top: noBdr, bottom: bdr(), left: noBdr, right: noBdr },
      width: { size: 8226, type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? C.gray : C.white, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 200, right: 200 },
      children: [new Paragraph({
        spacing: { after: 0 },
        children: [new TextRun({ text: s, font: 'Angsana New', size: 26, color: C.darkText })],
      })],
    });
    return new TableRow({ children: [numCell, textCell] });
  });
  return new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [800, 8226], rows: rows });
}

// ─── Status table ─────────────────────────────────────────────────────────────
function statusTable(items) {
  var headerRow = new TableRow({
    children: [
      new TableCell({ borders: bdrs(C.teal), width: { size: 2400, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'สถานะ', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
      new TableCell({ borders: bdrs(C.teal), width: { size: 6626, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'ความหมาย', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
    ],
  });
  var dataRows = items.map(function(item, i) {
    var shade = i % 2 === 0 ? C.lightTeal : C.white;
    return new TableRow({
      children: [
        new TableCell({ borders: bdrs(), width: { size: 2400, type: WidthType.DXA }, shading: { fill: shade, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: item[0], font: 'Courier New', size: 22, bold: true, color: C.teal })] })] }),
        new TableCell({ borders: bdrs(), width: { size: 6626, type: WidthType.DXA }, shading: { fill: shade, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: item[1], font: 'Angsana New', size: 24, color: C.darkText })] })] }),
      ],
    });
  });
  return new Table({ width: { size: 9026, type: WidthType.DXA }, columnWidths: [2400, 6626], rows: [headerRow].concat(dataRows) });
}

// ─── Generic multi-column table ───────────────────────────────────────────────
function dataTable(headers, rows, widths) {
  var total = widths.reduce(function(a, b) { return a + b; }, 0);
  var headerRow = new TableRow({
    children: headers.map(function(h, i) {
      return new TableCell({
        borders: bdrs(C.teal),
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: C.teal, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: h, font: 'Angsana New', size: 24, bold: true, color: C.white })] })],
      });
    }),
  });
  var dataRows = rows.map(function(cols, i) {
    var shade = i % 2 === 0 ? C.lightTeal : C.white;
    return new TableRow({
      children: cols.map(function(col, j) {
        return new TableCell({
          borders: bdrs(),
          width: { size: widths[j], type: WidthType.DXA },
          shading: { fill: shade, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: col, font: 'Angsana New', size: j === 0 ? 22 : 23, bold: j === 0, color: j === 0 ? C.teal : C.darkText })] })],
        });
      }),
    });
  });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [headerRow].concat(dataRows) });
}

// ─── Cover info row ───────────────────────────────────────────────────────────
function coverRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({ borders: bdrs(C.midGray), width: { size: 2800, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: label, font: 'Angsana New', size: 26, bold: true, color: C.white })] })] }),
      new TableCell({ borders: bdrs(C.midGray), width: { size: 3200, type: WidthType.DXA }, shading: { fill: C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: value, font: 'Angsana New', size: 26, color: C.darkText })] })] }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOCUMENT CONTENT
// ─────────────────────────────────────────────────────────────────────────────

var mainChildren = [

  // TOC
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('สารบัญ')] }),
  new TableOfContents('สารบัญ', { hyperlink: true, headingStyleRange: '1-3' }),

  // ── Chapter 1 ────────────────────────────────────────────────────────────
  h1('บทที่ 1: ภาพรวมระบบ Smart Procurement'),
  body('Smart Procurement คือแพลตฟอร์มดิจิทัลของ NSL Foods PLC ที่รวมกระบวนการจัดซื้อทั้งหมดไว้ในระบบเดียว ตั้งแต่การลงทะเบียน Supplier การออก RFQ การประมูล e-Bidding ไปจนถึงการอนุมัติ Award และการประเมินผล'),
  sp(80),
  h2('1.1 วัตถุประสงค์'),
  bullet('บริหารฐานข้อมูล Supplier แบบรวมศูนย์ในที่เดียว'),
  bullet('ลดกระดาษและขั้นตอนด้วย Digital Workflow อัตโนมัติ'),
  bullet('เพิ่มความโปร่งใสในกระบวนการจัดซื้อทุกขั้นตอน'),
  bullet('รองรับการประมูลออนไลน์ Reverse Auction (e-Bidding)'),
  bullet('ติดตาม KPI และรายงานเชิงวิเคราะห์แบบ Real-time'),
  sp(100),

  h2('1.2 กลุ่มผู้ใช้งานและสิทธิ์ (User Roles)'),
  dataTable(
    ['Role', 'ชื่อ', 'สิทธิ์หลัก'],
    [
      ['admin', 'ผู้ดูแลระบบ', 'เข้าถึงทุกโมดูล จัดการ User อนุมัติ Supplier ตั้งค่าระบบ'],
      ['procurement_officer', 'เจ้าหน้าที่จัดซื้อ', 'สร้าง/จัดการ RFQ, Supplier, e-Bidding, Evaluation'],
      ['approver', 'ผู้อนุมัติ', 'อนุมัติ Supplier Registration และ Award ดูรายงาน'],
      ['executive', 'ผู้บริหาร', 'ดู Dashboard และรายงานเท่านั้น (Read-only)'],
      ['supplier', 'Supplier', 'Supplier Portal เข้าถึงข้อมูลตนเองเท่านั้น'],
    ],
    [1700, 1900, 5426]
  ),
  sp(100),

  h2('1.3 ภาพรวม Workflow หลัก 6 ขั้นตอน'),
  stepTable([
    'ลงทะเบียน Supplier — Supplier สมัครผ่านระบบ ระบุข้อมูลบริษัท ผู้ติดต่อ เอกสาร และสร้าง Account',
    'อนุมัติ Supplier — Admin ตรวจสอบเอกสาร แล้วอนุมัติหรือปฏิเสธ',
    'ออก RFQ — เจ้าหน้าที่จัดซื้อสร้าง RFQ พร้อม Line Items และเชิญ Supplier ที่ได้รับอนุมัติ',
    'e-Bidding (ถ้ามี) — จัดประมูลออนไลน์แบบ Reverse Auction เพื่อได้ราคาต่ำสุด',
    'Award — เจ้าหน้าที่เสนอ Award ให้ผู้อนุมัติตัดสินใจ',
    'ประเมินผล — ประเมินคะแนน Supplier หลังจบงาน ใช้ประกอบการตัดสินใจครั้งต่อไป',
  ]),
  sp(80),

  // ── Chapter 2 ────────────────────────────────────────────────────────────
  h1('บทที่ 2: การเข้าสู่ระบบ (Login)'),
  body('หน้า Login เป็นจุดเข้าสู่ระบบสำหรับผู้ใช้ทุก Role ที่ URL: https://smartprocurement-2026.web.app'),
  sp(80),

  h2('2.1 วิธีเข้าสู่ระบบ'),
  stepTable([
    'เปิด Browser แล้วไปที่ URL ของระบบ',
    'กรอก Email Address ที่ได้รับจากผู้ดูแลระบบ',
    'กรอก Password (อย่างน้อย 6 ตัวอักษร)',
    'กดปุ่ม Sign In',
    'ระบบตรวจสอบสิทธิ์แล้วพาไปยัง Dashboard โดยอัตโนมัติ',
  ]),
  sp(80),

  h2('2.2 ข้อควรระวัง'),
  warnBox('Supplier ที่ยังไม่ได้รับการอนุมัติจาก Admin จะไม่สามารถเข้าระบบได้ จะเห็นข้อความ "บัญชีของท่านอยู่ระหว่างการตรวจสอบ"'),
  sp(80),
  bullet('ลืมรหัสผ่าน: ต้องติดต่อ Admin เพื่อ Reset Password ผ่าน Admin Settings'),
  bullet('ระบบจำ Session ไว้ ไม่ต้อง Login ใหม่ทุกครั้งที่เปิด Browser'),
  bullet('ออกจากระบบ: กดปุ่ม "Sign out" ด้านล่างซ้ายของ Sidebar'),
  sp(80),

  // ── Chapter 3 ────────────────────────────────────────────────────────────
  h1('บทที่ 3: Dashboard'),
  body('Dashboard คือหน้าหลักที่แสดง KPI สำคัญและ Activity ล่าสุด ผู้ใช้ทุก Role เห็น Dashboard แต่ข้อมูลกรองตามสิทธิ์'),
  sp(80),

  h2('3.1 KPI Cards'),
  dataTable(
    ['การ์ด', 'ความหมาย'],
    [
      ['Total Suppliers', 'Supplier ทั้งหมดในระบบ แยก Approved / Pending'],
      ['Open RFQs', 'RFQ ที่กำลังดำเนินการ แสดง Draft แยกต่างหาก'],
      ['Active Auctions', 'e-Bidding ที่กำลัง Active ขณะนี้'],
      ['Pending Awards', 'Award ที่รอการอนุมัติ'],
    ],
    [3000, 6026]
  ),
  sp(80),

  h2('3.2 ส่วนอื่นๆ ใน Dashboard'),
  bullet('Supplier Status Distribution — สัดส่วน Supplier แยกตามสถานะ'),
  bullet('Recent Activity — กิจกรรมล่าสุดในระบบ คลิกเพื่อไปยังรายการนั้นได้ทันที'),
  bullet('Top-rated Suppliers — Supplier ที่ได้คะแนนประเมินสูงสุด (เต็ม 5.0)'),
  sp(80),

  // ── Chapter 4 ────────────────────────────────────────────────────────────
  h1('บทที่ 4: การจัดการ Supplier'),
  body('โมดูล Suppliers เป็นศูนย์กลางฐานข้อมูล Supplier ครอบคลุมการสร้าง ตรวจสอบ อนุมัติ และบริหารข้อมูลทั้งหมด'),
  sp(80),

  h2('4.1 สถานะของ Supplier'),
  statusTable([
    ['draft', 'สร้างโดยเจ้าหน้าที่ ยังไม่ได้ส่งตรวจสอบ'],
    ['submitted', 'ส่งข้อมูลแล้ว รอการตรวจสอบจาก Admin'],
    ['review', 'Admin กำลังตรวจสอบอยู่'],
    ['approved', 'อนุมัติแล้ว เข้าระบบและร่วม RFQ ได้'],
    ['rejected', 'ปฏิเสธการลงทะเบียน'],
    ['suspended', 'ระงับการใช้งานชั่วคราว'],
  ]),
  sp(100),

  h2('4.2 การสร้าง Supplier ใหม่'),
  stepTable([
    'ไปที่เมนู Suppliers > กดปุ่ม "เพิ่ม Supplier"',
    'กรอกชื่อบริษัท (จำเป็น), Tax ID, อีเมล, เบอร์โทร, ที่อยู่, เว็บไซต์',
    'เลือก Tier: Critical Tier 1 หรือ Non-Critical Tier 1',
    'กด Save — ระบบบันทึกด้วยสถานะ "draft"',
    'เปิด Supplier > แท็บ Contacts > เพิ่มผู้ติดต่อ',
    'แท็บ Documents > อัปโหลดเอกสารที่เกี่ยวข้อง',
    'กด "ส่งตรวจสอบ" เพื่อเปลี่ยนสถานะเป็น submitted',
  ]),
  sp(80),

  h2('4.3 การเปลี่ยนสถานะ Supplier'),
  bullet('draft → submitted: กด "ส่งตรวจสอบ" (เจ้าหน้าที่ทำได้)'),
  bullet('submitted → review: กด "เริ่มตรวจสอบ" (Admin เท่านั้น)'),
  bullet('review → approved: กด "อนุมัติ" (Admin เท่านั้น)'),
  bullet('review → rejected: กด "ปฏิเสธ" พร้อมระบุเหตุผล (Admin เท่านั้น)'),
  bullet('rejected → draft: กด "กลับ Draft" เพื่อแก้ไขและส่งใหม่'),
  sp(80),
  infoBox('สิทธิ์', 'Admin และ Procurement Officer แก้ไขข้อมูล Supplier ได้ | Admin เท่านั้นที่อนุมัติหรือปฏิเสธได้'),
  sp(80),

  h2('4.4 แท็บใน Supplier Detail'),
  h3('Information'),
  bullet('ข้อมูลบริษัท: ชื่อ, Tax ID, ที่อยู่, เว็บไซต์, Tier'),
  bullet('Flag: Is Preferred (Supplier ที่ต้องการใช้งาน) | Is Blacklisted (ห้ามใช้งาน)'),
  h3('Contacts'),
  bullet('รายชื่อผู้ติดต่อ: ชื่อ, ตำแหน่ง, อีเมล, เบอร์โทร | กำหนด Primary Contact ได้'),
  h3('Documents'),
  bullet('เอกสาร: หนังสือรับรองบริษัท, ภพ.20, หนังสือจดทะเบียนพาณิชย์, สำเนาบัตรประชาชน, หนังสือรับรองบัญชีธนาคาร, งบการเงิน, อื่นๆ'),
  h3('ESG Profile'),
  bullet('ข้อมูลด้านสิ่งแวดล้อม สังคม และธรรมาภิบาล (Environmental, Social, Governance)'),
  sp(80),

  // ── Chapter 5 ────────────────────────────────────────────────────────────
  h1('บทที่ 5: การลงทะเบียน Supplier (Self-Service)'),
  body('Supplier ลงทะเบียนด้วยตนเองผ่านหน้า Register โดยไม่ต้องมี Account ก่อน เป็น Wizard 5 ขั้นตอน'),
  sp(80),

  h2('5.1 ขั้นตอนการลงทะเบียน'),
  stepTable([
    'Step 1 - ข้อมูลบริษัท: ชื่อบริษัท (จำเป็น), Tax ID (จำเป็น), เว็บไซต์, ที่อยู่, เมือง, ประเทศ, เบอร์โทร',
    'Step 2 - ข้อมูลผู้ติดต่อ: ชื่อ (จำเป็น), ตำแหน่ง, อีเมล (จำเป็น), เบอร์โทร',
    'Step 3 - ข้อมูลธนาคาร: ชื่อธนาคาร, สาขา, ชื่อบัญชี, เลขบัญชี, ประเภทบัญชี, SWIFT Code',
    'Step 4 - เอกสาร: อัปโหลดอย่างน้อย 1 ไฟล์ (PDF/JPG/PNG/DOC/DOCX) เลือกประเภทเอกสาร',
    'Step 5 - Account: ชื่อ-นามสกุล (จำเป็น), อีเมล Login (จำเป็น), รหัสผ่าน (min 6 ตัว), ยืนยันรหัสผ่าน',
  ]),
  sp(80),

  h2('5.2 สิ่งที่เกิดขึ้นหลังลงทะเบียน'),
  bullet('ระบบสร้าง Account อัตโนมัติ กำหนด Role = supplier'),
  bullet('สถานะ Supplier = "submitted" ทันที'),
  bullet('Admin ทุกคนได้รับ Notification ใน App'),
  bullet('ระบบ Sign Out Supplier ออก — ต้องรอ Admin อนุมัติก่อนจึงจะ Login ได้'),
  sp(80),
  warnBox('Supplier ที่ลงทะเบียนแล้วแต่ยังไม่ได้รับการอนุมัติจะไม่สามารถ Login ได้ ระบบแสดงข้อความให้รอการอนุมัติ'),
  sp(80),

  // ── Chapter 6 ────────────────────────────────────────────────────────────
  h1('บทที่ 6: การอนุมัติ Supplier'),
  body('หน้า Supplier Approvals สำหรับ Admin เท่านั้น ใช้ตรวจสอบและอนุมัติ/ปฏิเสธ Supplier ที่ลงทะเบียนใหม่'),
  sp(80),

  h2('6.1 KPI บนหน้า Supplier Approvals'),
  bullet('รอตรวจสอบ (submitted) — Supplier ที่ยังไม่ได้เริ่มดำเนินการ'),
  bullet('กำลังตรวจสอบ (review) — Admin กำลังดูอยู่'),
  bullet('อนุมัติแล้ว (approved) — ผ่านแล้ว'),
  bullet('ปฏิเสธ (rejected) — ไม่ผ่าน'),
  sp(80),

  h2('6.2 วิธีอนุมัติ Supplier'),
  stepTable([
    'ไปที่เมนู Supplier Approvals (Admin เท่านั้น)',
    'คลิก Supplier ที่มีสถานะ submitted หรือ review เพื่อดูรายละเอียด',
    'ตรวจสอบข้อมูลบริษัท ผู้ติดต่อ และดาวน์โหลดเอกสาร',
    'กด "อนุมัติ" — Supplier ได้รับอีเมลแจ้งและ Login ได้ทันที',
    'หรือกด "ปฏิเสธ" พร้อมระบุเหตุผล — Supplier ได้รับอีเมลพร้อมเหตุผล',
  ]),
  sp(80),
  infoBox('หมายเหตุ', 'หลังอนุมัติ Supplier จะปรากฏในรายการ Suppliers ทั่วไป และเชิญเข้า RFQ ได้ทันที'),
  sp(80),

  // ── Chapter 7 ────────────────────────────────────────────────────────────
  h1('บทที่ 7: ราคามาตรฐาน (Price Lists)'),
  body('Price Lists คือรายการราคาที่ Supplier ยื่นเสนอ ใช้เป็นข้อมูลอ้างอิงในการออก RFQ และเปรียบเทียบราคา'),
  sp(80),
  bullet('Title — ชื่อของ Price List'),
  bullet('Supplier — Supplier ที่เสนอราคา'),
  bullet('Valid Until — วันหมดอายุของราคา'),
  bullet('Status — สถานะปัจจุบัน'),
  sp(80),
  infoBox('สิทธิ์', 'Admin และ Supplier สร้าง/จัดการ Price List ได้ | Procurement Officer ดูได้'),
  sp(80),

  // ── Chapter 8 ────────────────────────────────────────────────────────────
  h1('บทที่ 8: การขอราคา (RFQ - Request for Quotation)'),
  body('RFQ คือกระบวนการออกใบขอราคาจาก Supplier เจ้าหน้าที่จัดซื้อสร้าง RFQ พร้อมรายการสินค้า/บริการ แล้วเชิญ Supplier ที่ Approved ตอบราคา'),
  sp(80),

  h2('8.1 สถานะของ RFQ'),
  statusTable([
    ['draft', 'สร้างแล้วแต่ยังไม่เผยแพร่ แก้ไขได้'],
    ['published', 'เผยแพร่แล้ว Supplier ส่งราคาได้'],
    ['closed', 'ปิดรับการส่งราคาแล้ว'],
    ['evaluation', 'อยู่ระหว่างประเมินเปรียบเทียบราคา'],
    ['awarded', 'เลือก Supplier ได้แล้ว'],
  ]),
  sp(100),

  h2('8.2 การสร้าง RFQ'),
  stepTable([
    'ไปที่เมนู RFQ > กดปุ่ม "สร้าง RFQ"',
    'กรอกข้อมูลหัว: ชื่อ RFQ (จำเป็น), คำอธิบาย, Deadline, หมายเหตุ',
    'เพิ่ม Line Items: กด "+ เพิ่มรายการ" กรอกชื่อสินค้า จำนวน หน่วย ข้อกำหนด',
    'กด Save — ระบบสร้าง RFQ Number อัตโนมัติ สถานะ: draft',
    'แท็บ "Invited Suppliers" > เลือก Supplier ที่ต้องการเชิญ > กด "เชิญ Supplier"',
    'กด "Publish RFQ" เพื่อเผยแพร่ (ต้องมี Supplier อย่างน้อย 1 ราย)',
  ]),
  sp(80),

  h2('8.3 แท็บใน RFQ Detail'),
  h3('Details & Items'),
  bullet('ข้อมูลหัว RFQ และรายการสินค้าทั้งหมด'),
  h3('Invited Suppliers'),
  bullet('ฝั่งซ้าย: Supplier ที่ได้รับเชิญ | ฝั่งขวา: Supplier พร้อมเชิญ (approved)'),
  bullet('เพิ่ม/ลบ Supplier ได้เฉพาะสถานะ draft'),
  h3('Quotations'),
  bullet('ดูใบเสนอราคาที่ Supplier ส่งมา และเปรียบเทียบราคา'),
  sp(80),
  infoBox('สิทธิ์', 'Admin และ Procurement Officer สร้าง/จัดการ RFQ | ทุก Role ดูได้'),
  sp(80),

  // ── Chapter 9 ────────────────────────────────────────────────────────────
  h1('บทที่ 9: การประมูลออนไลน์ (e-Bidding)'),
  body('e-Bidding คือการประมูลแบบ Reverse Auction ที่ Supplier แข่งขันเสนอราคาต่ำที่สุด ใช้ร่วมกับ RFQ หรือแยกก็ได้'),
  sp(80),

  h2('9.1 สถานะของ Bidding Event'),
  statusTable([
    ['scheduled', 'กำหนดการแล้ว ยังไม่ถึงเวลาเริ่ม'],
    ['active', 'กำลังประมูลอยู่ Supplier ส่งราคาได้'],
    ['closed', 'ปิดการประมูลแล้ว'],
    ['cancelled', 'ยกเลิกการประมูล'],
  ]),
  sp(100),

  h2('9.2 การสร้าง Bidding Event'),
  stepTable([
    'ไปที่เมนู e-Bidding > กดปุ่ม "สร้าง Bidding Event"',
    'กรอกชื่อ Event (จำเป็น) และคำอธิบาย',
    'เลือก RFQ ที่เกี่ยวข้อง (ถ้ามี)',
    'กำหนดวัน-เวลาเริ่ม (Start Time) และสิ้นสุด (End Time)',
    'ตั้งจำนวน Round สูงสุด (ค่าเริ่มต้น = 3 Rounds)',
    'กด Save — สถานะ: scheduled',
  ]),
  sp(80),
  infoBox('Max Rounds', 'ระบบรองรับหลาย Round เพื่อให้ Supplier ปรับราคาได้ หน้ารายการแสดง current_round / max_rounds'),
  sp(80),

  // ── Chapter 10 ───────────────────────────────────────────────────────────
  h1('บทที่ 10: ใบเสนอราคาสุดท้าย (Final Quotations)'),
  body('Final Quotations คือสรุปใบเสนอราคาที่ผ่านการคัดเลือกจาก RFQ หรือ e-Bidding ใช้เพื่อเปรียบเทียบและตัดสินใจ Award'),
  sp(80),
  bullet('เจ้าหน้าที่จัดซื้อดูและจัดการ Final Quotations จากหน้านี้'),
  bullet('สามารถค้นหาและกรองตามสถานะได้'),
  bullet('ใช้ข้อมูลนี้ประกอบการสร้าง Award ในขั้นตอนถัดไป'),
  sp(80),

  // ── Chapter 11 ───────────────────────────────────────────────────────────
  h1('บทที่ 11: การอนุมัติจัดซื้อ (Awards)'),
  body('Awards คือขั้นตอนสุดท้ายก่อนออก Purchase Order เจ้าหน้าที่เสนอ Award แล้วให้ผู้อนุมัติตัดสินใจ'),
  sp(80),

  h2('11.1 สถานะของ Award'),
  statusTable([
    ['pending', 'รอการพิจารณาจากผู้อนุมัติ'],
    ['approved', 'อนุมัติแล้ว พร้อมออก Purchase Order'],
    ['rejected', 'ปฏิเสธ Award'],
    ['revise', 'ส่งกลับให้แก้ไข'],
  ]),
  sp(100),

  h2('11.2 กระบวนการ Award'),
  stepTable([
    'เจ้าหน้าที่สร้าง Award: ระบุ Supplier ที่เลือก, RFQ, มูลค่า Award, Recommendation',
    'Award มีสถานะ "pending" รอการพิจารณา',
    'ผู้อนุมัติ (Admin/Approver) เข้าดูรายละเอียด Award',
    'กด "อนุมัติ" — status=approved, ready_for_po=true',
    'หรือกด "ปฏิเสธ" พร้อมเหตุผล — status=rejected',
    'หรือกด "ส่งกลับแก้ไข" — status=revise พร้อมระบุสิ่งที่ต้องแก้',
    'เมื่อ approved — ดำเนินการออก PO ในระบบ ERP แยกต่างหาก',
  ]),
  sp(80),
  infoBox('KPI', 'หน้า Awards แสดง: Total Awards | Pending Approval | Approved | PO Ready'),
  sp(80),

  // ── Chapter 12 ───────────────────────────────────────────────────────────
  h1('บทที่ 12: การประเมินผล Supplier (Evaluations)'),
  body('Evaluations ใช้วัดประสิทธิภาพ Supplier หลังจบงาน คะแนนแสดงใน Dashboard และใช้ประกอบการตัดสินใจ RFQ ครั้งต่อไป'),
  sp(80),

  h2('12.1 เกณฑ์การให้คะแนน'),
  dataTable(
    ['เกณฑ์', 'น้ำหนัก'],
    [
      ['Service Score - คุณภาพบริการ', '40%'],
      ['Commercial Score - ราคา/เงื่อนไขการค้า', '25%'],
      ['ESG Score - สิ่งแวดล้อม/สังคม/ธรรมาภิบาล', '20%'],
      ['Reliability - ความน่าเชื่อถือ/ตรงเวลา', '15%'],
    ],
    [6026, 3000]
  ),
  sp(80),

  h2('12.2 การแปลความหมายคะแนน'),
  bullet('4.0 - 5.0: ดีเยี่ยม (สีเขียว) — Supplier แนะนำให้ใช้งานต่อ'),
  bullet('3.0 - 3.9: ดี (สีน้ำเงิน) — ใช้งานได้ปกติ'),
  bullet('2.0 - 2.9: พอใช้ (สีเหลือง) — ต้องติดตามและพัฒนา'),
  bullet('ต่ำกว่า 2.0: ต้องปรับปรุง (สีแดง) — พิจารณาระงับการใช้งาน'),
  sp(80),

  h2('12.3 Evaluation Templates'),
  body('Template ใช้กำหนดเกณฑ์มาตรฐาน สร้างได้จากแท็บ Templates แล้วนำไปใช้กับการประเมิน Supplier แต่ละราย'),
  sp(80),

  // ── Chapter 13 ───────────────────────────────────────────────────────────
  h1('บทที่ 13: รายงานและการวิเคราะห์ (Reports)'),
  body('หน้า Reports รวมรายงาน Real-time ช่วยผู้บริหารและเจ้าหน้าที่ติดตาม KPI การจัดซื้อ'),
  sp(80),

  h2('13.1 KPI Cards หลัก'),
  bullet('Total Spend (YTD) — ยอดจัดซื้อสะสมตั้งแต่ต้นปี (ล้านบาท)'),
  bullet('Savings Rate — อัตราการประหยัดเทียบราคาอ้างอิง (%)'),
  bullet('RFQ Win Rate — อัตราความสำเร็จของ RFQ ที่นำไปสู่ Award (%)'),
  bullet('Active Suppliers — จำนวน Supplier ที่ active อยู่'),
  sp(80),

  h2('13.2 รายงาน 3 หมวด'),
  h3('Spending Trends'),
  bullet('Monthly Procurement Spending — ยอดจัดซื้อรายเดือน 12 เดือน'),
  bullet('Savings Breakdown — การประหยัดจากการประมูลและการเจรจา'),
  h3('RFQ Analytics'),
  bullet('RFQ Activity — จำนวน RFQ สร้าง/อนุมัติ/ยกเลิก รายเดือน'),
  bullet('RFQ Cycle Time — เวลาเฉลี่ยดำเนินการ RFQ จนถึง Award (วัน)'),
  h3('Supplier Performance'),
  bullet('Pie Chart — สัดส่วน Supplier แยกตามสถานะ'),
  bullet('Radar Chart — เปรียบเทียบ Supplier ชั้นนำในแต่ละมิติ'),
  bullet('ตารางคะแนน — Supplier ที่มีคะแนนสูงสุด'),
  sp(80),

  // ── Chapter 14 ───────────────────────────────────────────────────────────
  h1('บทที่ 14: Supplier Portal'),
  body('Supplier Portal คือหน้าที่ Supplier ใช้จัดการข้อมูลตนเองหลังได้รับการอนุมัติแล้ว'),
  sp(80),

  h2('14.1 ข้อมูลที่ Supplier จัดการได้'),
  h3('Company Info'),
  bullet('แก้ไขข้อมูลบริษัท: ชื่อ, Tax ID, เว็บไซต์, ที่อยู่, เบอร์โทร, อีเมล, หมายเหตุ'),
  h3('Contacts'),
  bullet('เพิ่ม/แก้ไข/ลบ ผู้ติดต่อ | กำหนด Primary Contact'),
  h3('Documents'),
  bullet('อัปโหลดเอกสาร: เลือกประเภท > เลือกไฟล์ > กด Upload'),
  bullet('ดาวน์โหลดหรือลบเอกสารเดิม'),
  sp(80),
  infoBox('สถานะ', 'Supplier เห็นสถานะตนเองที่มุมบน: Draft / Pending Review / Under Review / Approved / Rejected / Suspended'),
  sp(80),

  // ── Chapter 15 ───────────────────────────────────────────────────────────
  h1('บทที่ 15: ตั้งค่าระบบ (Admin Settings)'),
  body('Admin Settings สำหรับ Admin เท่านั้น ใช้จัดการ User, Role, การส่งอีเมล และค่า Config'),
  sp(80),

  h2('15.1 การจัดการ User'),
  h3('การสร้าง User ใหม่'),
  stepTable([
    'กดปุ่ม "สร้างผู้ใช้"',
    'กรอกชื่อ-นามสกุล (จำเป็น), อีเมล (จำเป็น), รหัสผ่าน (จำเป็น)',
    'เลือก Role: admin / procurement_officer / approver / executive / supplier',
    'กด "สร้างผู้ใช้" — สามารถ Login ได้ทันที',
  ]),
  sp(80),
  h3('Reset Password'),
  bullet('กดปุ่ม "Reset Password" ข้างชื่อ User > กรอกรหัสผ่านใหม่ > กด "บันทึก"'),
  h3('เปิด/ปิด User'),
  bullet('Toggle สวิตช์ Active/Inactive — User ที่ Inactive จะ Login ไม่ได้'),
  sp(80),
  warnBox('การสร้าง User และ Reset Password ต้องใช้ Service Role Key หากยังไม่ตั้งค่า ฟีเจอร์นี้จะไม่ทำงาน ให้ติดต่อทีม IT'),
  sp(80),

  h2('15.2 การตั้งค่าอีเมล'),
  bullet('เปิด/ปิดการส่งอีเมลแจ้งเตือน'),
  bullet('SMTP Server: Host, Port (587), Username, Password'),
  bullet('เหตุการณ์: Supplier ลงทะเบียนใหม่ / อนุมัติ Supplier / ปฏิเสธ Supplier'),
  bullet('Template อีเมล: รองรับตัวแปร {{company_name}}, {{supplier_name}}, {{login_url}}, {{reason}}'),
  sp(80),

  h2('15.3 Role ในระบบ'),
  dataTable(
    ['Role', 'ชื่อ', 'สิทธิ์'],
    [
      ['admin', 'ผู้ดูแลระบบ', 'เข้าถึงทุกส่วน จัดการ User ตั้งค่าระบบ'],
      ['procurement_officer', 'เจ้าหน้าที่จัดซื้อ', 'สร้าง RFQ, จัดการ Supplier, e-Bidding, ประเมินผล'],
      ['approver', 'ผู้อนุมัติ', 'อนุมัติ Supplier Registration และ Award'],
      ['executive', 'ผู้บริหาร', 'ดู Dashboard และรายงานเท่านั้น'],
      ['supplier', 'Supplier', 'Supplier Portal เท่านั้น'],
    ],
    [1700, 1900, 5426]
  ),
  sp(80),

  // ── Chapter 16 ───────────────────────────────────────────────────────────
  h1('บทที่ 16: คำแนะนำสำหรับผู้สอน'),

  h2('16.1 ลำดับการสอนที่แนะนำ'),
  numItem('ภาพรวม Workflow ทั้งหมด (บทที่ 1) — ให้ผู้เรียนเห็นภาพก่อน'),
  numItem('Login และ Dashboard (บทที่ 2-3) — คุ้นเคยกับ UI'),
  numItem('ลงทะเบียน Supplier Self-Service (บทที่ 5) — ให้ผู้เรียนทำเอง'),
  numItem('อนุมัติ Supplier (บทที่ 6) — บทบาท Admin'),
  numItem('End-to-End: RFQ -> e-Bidding -> Award (บทที่ 8-11)'),
  numItem('การประเมินผล Supplier (บทที่ 12)'),
  numItem('Admin Settings และการจัดการ User (บทที่ 15)'),
  sp(80),

  h2('16.2 Scenarios ฝึกปฏิบัติ'),
  h3('Scenario 1: กระบวนการจัดซื้อครบวงจร (~30 นาที)'),
  bullet('ผู้เรียน A (Supplier): ลงทะเบียนผ่านหน้า Register'),
  bullet('ผู้เรียน B (Admin): อนุมัติ Supplier A'),
  bullet('ผู้เรียน B: สร้าง RFQ และเชิญ Supplier A'),
  bullet('ผู้เรียน A: เข้า Supplier Portal และตอบ RFQ'),
  bullet('ผู้เรียน B: ปิด RFQ และสร้าง Award'),
  bullet('ผู้เรียน C (Approver): อนุมัติ Award'),
  sp(80),
  h3('Scenario 2: จัดการ Supplier Database (~15 นาที)'),
  bullet('สร้าง Supplier ใหม่พร้อมเอกสาร'),
  bullet('เปลี่ยนสถานะตามลำดับ: draft -> submitted -> review -> approved'),
  bullet('ทดลองตั้ง is_preferred และ is_blacklisted'),
  sp(80),

  h2('16.3 คำถามที่พบบ่อย (FAQ)'),
  dataTable(
    ['คำถาม', 'คำตอบ'],
    [
      ['Supplier Login ไม่ได้?', 'ตรวจสอบว่า Admin อนุมัติแล้วหรือยัง ถ้ายังให้ Admin ไปที่ Supplier Approvals'],
      ['ลืมรหัสผ่าน?', 'Admin ไปที่ Admin Settings > Users > กด Reset Password'],
      ['เพิ่ม Supplier เข้า RFQ ไม่ได้?', 'RFQ ต้องอยู่สถานะ "draft" และ Supplier ต้องมีสถานะ "approved"'],
      ['Award approved แล้ว ออก PO ที่ไหน?', 'ระบบนี้ดูแลถึง Award เท่านั้น การออก PO ทำในระบบ ERP แยกต่างหาก'],
      ['คะแนน Supplier มาจากไหน?', 'จาก Evaluations Module โดยเจ้าหน้าที่ ใช้ Template และเกณฑ์ 4 ด้าน'],
      ['Export รายงานเป็น Excel ได้ไหม?', 'ยังไม่รองรับ ระบบแสดงข้อมูลใน Charts การ Export จะเพิ่มในอนาคต'],
    ],
    [3500, 5526]
  ),
  sp(80),
];

// ─────────────────────────────────────────────────────────────────────────────
//  COVER PAGE CHILDREN
// ─────────────────────────────────────────────────────────────────────────────
var coverHeaderPara1 = new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 120 },
  children: [new TextRun({ text: 'SMART PROCUREMENT SYSTEM', font: 'Arial', size: 52, bold: true, color: C.orange })],
});
var coverHeaderPara2 = new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 0 },
  children: [new TextRun({ text: 'NSL Foods PLC', font: 'Arial', size: 32, color: C.white })],
});
var coverHeaderCell = new TableCell({
  borders: noBdrs,
  width: { size: 9026, type: WidthType.DXA },
  shading: { fill: C.darkNav, type: ShadingType.CLEAR },
  margins: { top: 500, bottom: 500, left: 600, right: 600 },
  children: [coverHeaderPara1, coverHeaderPara2],
});
var coverHeaderTable = new Table({
  width: { size: 9026, type: WidthType.DXA },
  columnWidths: [9026],
  rows: [new TableRow({ children: [coverHeaderCell] })],
});
var coverInfoTable = new Table({
  width: { size: 6000, type: WidthType.DXA },
  columnWidths: [2800, 3200],
  rows: [
    coverRow('จัดทำโดย', 'ทีมพัฒนาระบบ SmartProcure'),
    coverRow('เวอร์ชัน', '1.0'),
    coverRow('วันที่', 'เมษายน 2569'),
    coverRow('ภาษา', 'ภาษาไทย / English'),
  ],
});

var coverChildren = [
  sp(2000),
  coverHeaderTable,
  sp(400),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: 'คู่มือผู้สอนการใช้งานระบบ', font: 'Angsana New', size: 56, bold: true, color: C.teal })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: "Trainer's Complete Reference Guide", font: 'Arial', size: 28, color: '666666' })] }),
  coverInfoTable,
];

// ─────────────────────────────────────────────────────────────────────────────
//  BUILD DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────
var doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
      {
        reference: 'numbers',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Angsana New', size: 26 } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 40, bold: true, font: 'Arial', color: C.white },
        paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0, shading: { fill: C.teal, type: ShadingType.CLEAR } },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Arial', color: C.teal },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.teal, space: 4 } } },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: C.orange },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: coverChildren,
    },
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.teal, space: 4 } },
          children: [
            new TextRun({ text: 'Smart Procurement System', font: 'Arial', size: 18, color: C.teal }),
            new TextRun({ text: '  |  NSL Foods PLC', font: 'Arial', size: 18, color: '888888' }),
          ],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.midGray, space: 4 } },
          children: [
            new TextRun({ text: 'คู่มือผู้สอน  |  หน้า ', font: 'Angsana New', size: 18, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Angsana New', size: 18, color: C.teal }),
            new TextRun({ text: '  |  NSL Foods PLC  2569', font: 'Angsana New', size: 18, color: '888888' }),
          ],
        })] }),
      },
      children: mainChildren,
    },
  ],
});

Packer.toBuffer(doc).then(function(buffer) {
  fs.writeFileSync('/Users/golf/Desktop/SmartProcure_TrainerManual.docx', buffer);
  console.log('Done: SmartProcure_TrainerManual.docx saved to Desktop');
});
