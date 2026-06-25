const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, VerticalAlign,
} = require('docx');
const fs = require('fs');
const path = require('path');

// A4 page, 2cm margins
const PAGE_W = 11906;
const MARGIN = 1134; // ~2cm in DXA
const CONTENT_W = PAGE_W - MARGIN * 2; // 9638

const border = (color = 'CCCCCC') => ({ style: BorderStyle.SINGLE, size: 1, color });
const cellBorders = { top: border(), bottom: border(), left: border(), right: border() };
const headerBorders = { top: border('2E75B6'), bottom: border('2E75B6'), left: border('2E75B6'), right: border('2E75B6') };

function hCell(text, w, opts = {}) {
  return new TableCell({
    borders: headerBorders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: '2E75B6', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 160, right: 160 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18, font: 'TH Sarabun New' })],
    })],
    ...opts,
  });
}

function dCell(text, w, opts = {}) {
  const isRequired = text === 'จำเป็น';
  return new TableCell({
    borders: cellBorders,
    width: { size: w, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 160, right: 160 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({
        text,
        size: 18,
        font: 'TH Sarabun New',
        bold: isRequired,
        color: isRequired ? 'C0392B' : '000000',
      })],
    })],
    ...opts,
  });
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 4 } },
    children: [new TextRun({ text, bold: true, size: 28, color: '2E75B6', font: 'TH Sarabun New' })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 22, color: '1A5276', font: 'TH Sarabun New' })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 20, font: 'TH Sarabun New', ...opts })],
  });
}

function bulletItem(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 20, font: 'TH Sarabun New' })],
  });
}

function numberedItem(text) {
  return new Paragraph({
    numbering: { reference: 'numbers', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 20, font: 'TH Sarabun New' })],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 120 }, children: [] });
}

// ─── Column reference table ───
const COL_W = [2100, 2000, 1200, 2338, 2000]; // sum = 9638
const columns = [
  ['Supplier Code',         'รหัสผู้จัดจำหน่าย',         'ไม่จำเป็น',  'ข้อความอิสระ',                                    'SUP-001'],
  ['Company Name',          'ชื่อบริษัท',                 'จำเป็น',     'ข้อความอิสระ',                                    'บริษัท ไทยฟู้ด จำกัด'],
  ['Tax ID',                'เลขผู้เสียภาษี',             'ไม่จำเป็น',  'ตัวเลข 13 หลัก',                                 '0105560001111'],
  ['Email',                 'อีเมล',                      'ไม่จำเป็น',  'รูปแบบอีเมล',                                     'info@co.th'],
  ['Phone',                 'เบอร์โทรศัพท์',              'ไม่จำเป็น',  'ข้อความอิสระ',                                    '02-123-4567'],
  ['Address',               'ที่อยู่',                    'ไม่จำเป็น',  'ข้อความอิสระ',                                    '123 ถ.สีลม'],
  ['City',                  'เมือง/จังหวัด',              'ไม่จำเป็น',  'ข้อความอิสระ',                                    'กรุงเทพมหานคร'],
  ['Country',               'รหัสประเทศ',                 'ไม่จำเป็น',  'ISO 2 ตัวอักษร',                                  'TH'],
  ['Website',               'เว็บไซต์',                   'ไม่จำเป็น',  'URL',                                             'https://co.th'],
  ['Supplier Type',         'ประเภทผู้จัดจำหน่าย',        'ไม่จำเป็น',  'approved / new / nominated / critical / blocked', 'approved'],
  ['Status',                'สถานะ',                      'ไม่จำเป็น',  'approved / draft / submitted / review / rejected / suspended', 'approved'],
  ['Risk Level',            'ระดับความเสี่ยง',            'ไม่จำเป็น',  'low / medium / high / critical',                  'low'],
  ['QA Approval Status',    'สถานะอนุมัติ QA',            'ไม่จำเป็น',  'approved / not_required / pending / rejected',    'approved'],
  ['Certificate Type',      'ประเภทใบรับรอง',             'ไม่จำเป็น',  'ข้อความอิสระ (GMP, ISO22000, HACCP…)',           'GMP'],
  ['Certificate Expiry Date','วันหมดอายุใบรับรอง',        'ไม่จำเป็น',  'YYYY-MM-DD',                                      '2026-12-31'],
  ['Tier',                  'ระดับ Tier',                 'ไม่จำเป็น',  'critical_tier_1 / non_critical_tier_1',           'critical_tier_1'],
  ['Notes',                 'หมายเหตุ',                   'ไม่จำเป็น',  'ข้อความอิสระ',                                    'นำเข้าจากระบบ SAP'],
  ['Is Preferred',          'ผู้จัดจำหน่ายที่ต้องการ',    'ไม่จำเป็น',  'TRUE หรือ FALSE',                                 'TRUE'],
  ['Is Blacklisted',        'ขึ้นบัญชีดำ',               'ไม่จำเป็น',  'TRUE หรือ FALSE',                                 'FALSE'],
];

function buildColumnTable() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('คอลัมน์ (ชื่อหัวคอลัมน์)',  COL_W[0]),
      hCell('ความหมาย (ไทย)',              COL_W[1]),
      hCell('จำเป็น',                     COL_W[2]),
      hCell('ค่าที่อนุญาต / รูปแบบ',      COL_W[3]),
      hCell('ตัวอย่าง',                   COL_W[4]),
    ],
  });
  const dataRows = columns.map((row, i) => new TableRow({
    children: row.map((cell, ci) => {
      const shade = i % 2 === 0 ? 'F5F8FD' : 'FFFFFF';
      return new TableCell({
        borders: cellBorders,
        width: { size: COL_W[ci], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 160, right: 160 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({
            text: cell,
            size: 18,
            font: 'TH Sarabun New',
            bold: cell === 'จำเป็น',
            color: cell === 'จำเป็น' ? 'C0392B' : ci === 0 ? '1A5276' : '000000',
          })],
        })],
      });
    }),
  }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows: [headerRow, ...dataRows],
  });
}

// ─── Error table ───
const ERR_W = [3200, 3000, 3438];
const errors = [
  ['"Company Name จำเป็นต้องกรอก"',       'ไม่ได้กรอกชื่อบริษัท',                            'กรอก Company Name ทุกแถว'],
  ['"supplier_type ไม่ใช่ค่าที่อนุญาต"',  'พิมพ์ผิด เช่น "Approved" หรือ "APPROVED"',        'ใช้ตัวพิมพ์เล็กทั้งหมด เช่น "approved"'],
  ['"risk_level ไม่ใช่ค่าที่อนุญาต"',     'ค่า Risk ไม่ถูกต้อง',                              'ใช้เฉพาะ: low, medium, high, critical'],
  ['"ไม่พบหัวคอลัมน์"',                   'ไฟล์ไม่มีแถวหัวคอลัมน์',                          'ดาวน์โหลด Template ใหม่ แล้วใช้หัวคอลัมน์จาก Template'],
  ['Certificate Expiry Date แสดงผิด',      'รูปแบบวันที่ไม่ถูกต้อง',                          'ใช้รูปแบบ YYYY-MM-DD เช่น 2026-12-31'],
  ['"is_blacklisted ไม่ใช่ค่าที่อนุญาต"', 'ป้อนค่าที่ไม่ใช่ TRUE/FALSE',                     'ใช้ TRUE, FALSE, true, false หรือ 1, 0'],
];

function buildErrorTable() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      hCell('ข้อความผิดพลาด', ERR_W[0]),
      hCell('สาเหตุ',          ERR_W[1]),
      hCell('วิธีแก้ไข',      ERR_W[2]),
    ],
  });
  const dataRows = errors.map((row, i) => new TableRow({
    children: row.map((cell, ci) => {
      const shade = i % 2 === 0 ? 'FFF8F0' : 'FFFFFF';
      return new TableCell({
        borders: cellBorders,
        width: { size: ERR_W[ci], type: WidthType.DXA },
        shading: { fill: shade, type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 160, right: 160 },
        children: [new Paragraph({
          children: [new TextRun({
            text: cell,
            size: 18,
            font: 'TH Sarabun New',
            bold: ci === 0,
            color: ci === 0 ? 'C0392B' : '000000',
          })],
        })],
      });
    }),
  }));
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: ERR_W,
    rows: [headerRow, ...dataRows],
  });
}

// ─── Example rows table (Ex1) ───
function exampleLabel(text) {
  return new Paragraph({
    spacing: { before: 180, after: 80 },
    children: [new TextRun({ text, bold: true, size: 20, font: 'TH Sarabun New', color: '1A5276' })],
  });
}

function ex2col(rows) {
  const W = [3600, 6038];
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: W,
    rows: rows.map(([label, value], i) => new TableRow({
      children: [
        new TableCell({
          borders: cellBorders,
          width: { size: W[0], type: WidthType.DXA },
          shading: { fill: 'EBF5FB', type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 160, right: 160 },
          children: [new Paragraph({ children: [new TextRun({ text: label, size: 18, font: 'TH Sarabun New', bold: true })] })],
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: W[1], type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? 'FDFEFE' : 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 60, bottom: 60, left: 160, right: 160 },
          children: [new Paragraph({ children: [new TextRun({ text: value, size: 18, font: 'TH Sarabun New' })] })],
        }),
      ],
    })),
  });
}

const example1 = [
  ['Supplier Code',          'SUP-001'],
  ['Company Name',           'บริษัท ไทยฟู้ดส์ซัพพลาย จำกัด'],
  ['Tax ID',                 '0105560001111'],
  ['Email',                  'info@thaifoodsupply.co.th'],
  ['Phone',                  '02-111-0001'],
  ['City',                   'กรุงเทพมหานคร'],
  ['Country',                'TH'],
  ['Supplier Type',          'approved'],
  ['Status',                 'approved'],
  ['Risk Level',             'low'],
  ['QA Approval Status',     'approved'],
  ['Certificate Type',       'GMP'],
  ['Certificate Expiry Date','2026-12-31'],
  ['Tier',                   'critical_tier_1'],
  ['Is Preferred',           'TRUE'],
  ['Is Blacklisted',         'FALSE'],
  ['Notes',                  'นำเข้าจากระบบ SAP — ผู้จัดจำหน่ายหลักวัตถุดิบ'],
];

const example2 = [
  ['Supplier Code',       'SUP-002'],
  ['Company Name',        'บริษัท ABC Trading จำกัด'],
  ['Email',               'contact@abctrading.co.th'],
  ['Country',             'TH'],
  ['Supplier Type',       'new'],
  ['Status',              'submitted'],
  ['Risk Level',          'medium'],
  ['QA Approval Status',  'pending'],
  ['Is Blacklisted',      'FALSE'],
];

// ─── Build document ───
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '●',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 600, hanging: 360 } } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 640, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'TH Sarabun New', size: 20 } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'TH Sarabun New', color: '2E75B6' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'TH Sarabun New', color: '1A5276' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: 16838 },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2E75B6', space: 4 } },
          children: [
            new TextRun({ text: 'คู่มือการจัดทำข้อมูลนำเข้าผู้จัดจำหน่าย  |  Smart Procurement — NSL Foods PLC', size: 16, color: '666666', font: 'TH Sarabun New' }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: '2E75B6', space: 4 } },
          children: [
            new TextRun({ text: 'เวอร์ชัน 1.0  |  มิถุนายน 2569', size: 16, color: '666666', font: 'TH Sarabun New' }),
            new TextRun({ text: '\t', size: 16 }),
            new TextRun({ text: 'หน้า ', size: 16, color: '666666', font: 'TH Sarabun New' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '666666', font: 'TH Sarabun New' }),
          ],
        })],
      }),
    },
    children: [
      // ── Cover ──────────────────────────────────────────────────
      new Paragraph({ spacing: { before: 480, after: 0 }, children: [] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'คู่มือการจัดทำข้อมูลนำเข้าผู้จัดจำหน่าย', bold: true, size: 48, font: 'TH Sarabun New', color: '2E75B6' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Supplier Import Guide', size: 32, font: 'TH Sarabun New', color: '5D8AA8' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [new TextRun({ text: 'ระบบ Smart Procurement — NSL Foods PLC', size: 24, font: 'TH Sarabun New', color: '666666' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 4 } },
        spacing: { after: 320 },
        children: [],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'เวอร์ชัน 1.0  |  มิถุนายน 2569', size: 20, font: 'TH Sarabun New', color: '888888' })],
      }),

      // ── Section 1 ──────────────────────────────────────────────
      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E75B6', space: 4 } }, children: [new TextRun({ text: '1.  ภาพรวม', bold: true, size: 28, color: '2E75B6', font: 'TH Sarabun New' })] }),
      body('ระบบ Smart Procurement รองรับการนำเข้าข้อมูลผู้จัดจำหน่ายจำนวนมากผ่านไฟล์ Excel (.xlsx) เหมาะสำหรับการย้ายข้อมูลจากระบบเดิม (Data Migration) หรือการเพิ่มผู้จัดจำหน่ายพร้อมกันหลายรายในคราวเดียว'),
      spacer(),
      bulletItem('รองรับไฟล์ Excel รูปแบบ .xlsx เท่านั้น'),
      bulletItem('คอลัมน์สามารถเรียงลำดับสลับกันได้ ระบบจับคู่ด้วยชื่อหัวคอลัมน์โดยอัตโนมัติ'),
      bulletItem('ไม่จำเป็นต้องกรอกทุกคอลัมน์ — ใส่เฉพาะที่มีข้อมูล ระบบจะใช้ค่า default แทน'),
      bulletItem('ค่า default: Status = approved, Supplier Type = approved, Risk Level = low'),
      bulletItem('ระบบรองรับชื่อหัวคอลัมน์ได้ทั้ง "Company Name" และ "company_name" (case-insensitive)'),

      spacer(),

      // ── Section 2 ──────────────────────────────────────────────
      heading1('2.  ขั้นตอนการนำเข้าข้อมูล'),
      numberedItem('เข้าเมนู ผู้จัดจำหน่าย  →  นำเข้าข้อมูล (ต้องมีสิทธิ์ Admin)'),
      numberedItem('คลิก "ดาวน์โหลด Template (.xlsx)" เพื่อรับไฟล์ต้นแบบ'),
      numberedItem('เปิดไฟล์ด้วย Microsoft Excel หรือ Google Sheets'),
      numberedItem('กรอกข้อมูลตั้งแต่แถวที่ 3 เป็นต้นไป  (แถว 1 = คำอธิบายคอลัมน์  |  แถว 2 = หัวคอลัมน์)'),
      numberedItem('บันทึกไฟล์ในรูปแบบ .xlsx  (ห้ามบันทึกเป็น .xls หรือ .csv)'),
      numberedItem('อัปโหลดไฟล์โดยลากวางหรือคลิกเลือกไฟล์ในหน้า "นำเข้าข้อมูล"'),
      numberedItem('ตรวจสอบผลการตรวจสอบข้อมูล (Preview) หากพบข้อผิดพลาดให้แก้ไขไฟล์แล้วอัปโหลดใหม่'),
      numberedItem('กด "นำเข้า X รายการ" เพื่อบันทึกข้อมูลเข้าสู่ระบบ'),

      spacer(),

      // ── Section 3 ──────────────────────────────────────────────
      heading1('3.  คำอธิบายรายคอลัมน์'),
      body('ตารางด้านล่างแสดงคอลัมน์ทั้งหมด 19 คอลัมน์ที่รองรับในการนำเข้าข้อมูล'),
      spacer(),
      buildColumnTable(),
      spacer(),
      body('* คอลัมน์ที่มีเครื่องหมาย จำเป็น ต้องกรอกทุกแถว ส่วนคอลัมน์อื่น ๆ หากไม่มีข้อมูลสามารถปล่อยว่างได้', { color: 'C0392B', size: 18 }),

      spacer(),

      // ── Section 4 ──────────────────────────────────────────────
      heading1('4.  คำอธิบายค่าที่อนุญาต (Enum Values)'),

      heading2('4.1  Supplier Type — ประเภทผู้จัดจำหน่าย'),
      bulletItem('approved — ผู้จัดจำหน่ายที่ผ่านการอนุมัติแล้ว  (แนะนำสำหรับ migrate ข้อมูลเดิม)'),
      bulletItem('new — ผู้จัดจำหน่ายรายใหม่ที่ยังไม่ผ่านการประเมิน'),
      bulletItem('nominated — ผู้จัดจำหน่ายที่ถูกเสนอชื่อเข้ามา'),
      bulletItem('critical — ผู้จัดจำหน่ายที่มีความสำคัญสูงต่อกระบวนการผลิต'),
      bulletItem('blocked — ผู้จัดจำหน่ายที่ถูกระงับการใช้งาน (ไม่สามารถสั่งซื้อได้)'),
      spacer(),

      heading2('4.2  Status — สถานะ'),
      bulletItem('approved — อนุมัติแล้ว พร้อมใช้งานในระบบ  (แนะนำสำหรับ migrate)'),
      bulletItem('draft — ร่าง ยังไม่ส่งเพื่อพิจารณา'),
      bulletItem('submitted — ส่งเพื่อพิจารณาแล้ว รอการอนุมัติ'),
      bulletItem('review — อยู่ระหว่างการตรวจสอบ'),
      bulletItem('rejected — ถูกปฏิเสธ ต้องแก้ไขและส่งใหม่'),
      bulletItem('suspended — ถูกระงับชั่วคราว'),
      spacer(),

      heading2('4.3  Risk Level — ระดับความเสี่ยง'),
      bulletItem('low — ความเสี่ยงต่ำ ไม่ต้องการการอนุมัติพิเศษ'),
      bulletItem('medium — ความเสี่ยงปานกลาง ต้องติดตามอย่างสม่ำเสมอ'),
      bulletItem('high — ความเสี่ยงสูง ต้องได้รับการอนุมัติ QA ก่อนสั่งซื้อ'),
      bulletItem('critical — ความเสี่ยงร้ายแรง ระบบจะไม่อนุญาตให้มอบงาน'),
      spacer(),

      heading2('4.4  QA Approval Status — สถานะการอนุมัติ QA'),
      bulletItem('approved — QA อนุมัติแล้ว'),
      bulletItem('not_required — ไม่ต้องการการอนุมัติ QA (เช่น สินค้าที่ไม่เกี่ยวกับความปลอดภัยอาหาร)'),
      bulletItem('pending — รออนุมัติจาก QA'),
      bulletItem('rejected — QA ปฏิเสธ'),
      spacer(),

      heading2('4.5  Certificate Type — ประเภทใบรับรอง'),
      body('ป้อนชื่อมาตรฐานเป็นข้อความอิสระ ตัวอย่างค่าที่นิยมใช้:'),
      bulletItem('GMP  (Good Manufacturing Practice)'),
      bulletItem('ISO22000  (Food Safety Management)'),
      bulletItem('HACCP  (Hazard Analysis Critical Control Point)'),
      bulletItem('ISO9001  (Quality Management System)'),
      bulletItem('BRC  (British Retail Consortium)'),
      bulletItem('SQF  (Safe Quality Food)'),
      bulletItem('FSSC22000  (Food Safety System Certification)'),
      spacer(),

      heading2('4.6  Tier — ระดับ Tier'),
      bulletItem('critical_tier_1 — ผู้จัดจำหน่ายระดับ Critical Tier 1 (วัตถุดิบหลักที่ส่งผลต่อความปลอดภัยอาหาร)'),
      bulletItem('non_critical_tier_1 — ผู้จัดจำหน่ายระดับ Non-Critical Tier 1 (วัตถุดิบเสริมหรือบรรจุภัณฑ์)'),
      spacer(),

      heading2('4.7  Is Preferred / Is Blacklisted — ค่าบูลีน'),
      body('ป้อนค่า TRUE หรือ FALSE  ระบบรองรับรูปแบบต่อไปนี้ (ไม่คำนึงถึงตัวพิมพ์เล็ก/ใหญ่):'),
      bulletItem('TRUE, true, True, 1  → หมายถึง ใช่'),
      bulletItem('FALSE, false, False, 0  → หมายถึง ไม่ใช่'),

      spacer(),

      // ── Section 5 ──────────────────────────────────────────────
      heading1('5.  ตัวอย่างข้อมูลที่ถูกต้อง'),

      exampleLabel('ตัวอย่างที่ 1 — ผู้จัดจำหน่ายที่อนุมัติแล้วและมีใบรับรอง (เหมาะสำหรับ migrate จากระบบเดิม)'),
      ex2col(example1),
      spacer(),

      exampleLabel('ตัวอย่างที่ 2 — ผู้จัดจำหน่ายรายใหม่ที่ยังรอการอนุมัติ'),
      ex2col(example2),
      body('หมายเหตุ: คอลัมน์ที่ไม่ปรากฏในตัวอย่างที่ 2 สามารถปล่อยว่างได้ ระบบจะใช้ค่า default หรือบันทึกเป็นค่าว่าง', { color: '666666', size: 18 }),

      spacer(),

      // ── Section 6 ──────────────────────────────────────────────
      heading1('6.  ข้อผิดพลาดที่พบบ่อยและวิธีแก้ไข'),
      buildErrorTable(),

      spacer(),

      // ── Section 7 ──────────────────────────────────────────────
      heading1('7.  หมายเหตุสำคัญ'),
      bulletItem('ระบบจะกำหนด tenant_id ของ NSL Foods PLC ให้อัตโนมัติ — ไม่ต้องกรอกในไฟล์'),
      bulletItem('ระบบไม่ตรวจสอบข้อมูลซ้ำ — หาก Company Name ซ้ำกันจะสร้างรายการใหม่ขึ้นมา'),
      bulletItem('Certificate Expiry Date ต้องใช้รูปแบบ YYYY-MM-DD เช่น 2026-12-31  (ไม่ใช่ 31/12/2026)'),
      bulletItem('Google Sheets: ตรวจสอบให้แน่ใจว่าบันทึกเป็นไฟล์ .xlsx  (File → Download → Excel .xlsx)'),
      bulletItem('ไฟล์ที่ดาวน์โหลดมาจากระบบจะมีชีทคำอธิบายแนบมาด้วย — ไม่ต้องลบออก ระบบจะอ่านชีทแรกเท่านั้น'),
      bulletItem('จำนวนแถวสูงสุดที่แนะนำต่อครั้ง: 1,000 แถว หากมีมากกว่านี้ควรแบ่งอัปโหลดหลายรอบ'),

      spacer(),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 8 } },
        spacing: { before: 320, after: 0 },
        children: [new TextRun({ text: 'จัดทำโดย Smart Procurement System — NSL Foods PLC  |  เวอร์ชัน 1.0  |  มิถุนายน 2569', size: 16, color: '888888', font: 'TH Sarabun New' })],
      }),
    ],
  }],
});

const outPath = path.join(__dirname, '..', 'SmartProcure_SupplierImport_Guide.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('Created:', outPath);
});
