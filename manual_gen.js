const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents, ExternalHyperlink, Bookmark,
} = require('docx');
const fs = require('fs');

// ── Colors ──────────────────────────────────────────────────────────────────
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

// ── Borders helpers ──────────────────────────────────────────────────────────
const border  = (color = C.midGray) => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color = C.midGray) => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });
const noBorder = { style: BorderStyle.NONE, size: 0, color: C.white };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// ── Helpers ──────────────────────────────────────────────────────────────────
const sp   = (n) => new Paragraph({ children: [], spacing: { after: n } });
const br   = ()  => new Paragraph({ children: [new PageBreak()] });

const h1 = (text, anchor) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  pageBreakBefore: true,
  children: anchor
    ? [new Bookmark({ id: anchor, children: [new TextRun(text)] })]
    : [new TextRun(text)],
});

const h2 = (text, anchor) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: anchor
    ? [new Bookmark({ id: anchor, children: [new TextRun(text)] })]
    : [new TextRun(text)],
  spacing: { before: 200, after: 80 },
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun(text)],
  spacing: { before: 160, after: 60 },
});

const body = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: 'Angsana New', size: 26, color: C.darkText, ...opts })],
  spacing: { after: 80 },
});

const note = (text) => new Paragraph({
  children: [
    new TextRun({ text: 'หมายเหตุ: ', font: 'Angsana New', size: 24, bold: true, color: C.orange }),
    new TextRun({ text, font: 'Angsana New', size: 24, color: '555555' }),
  ],
  spacing: { before: 60, after: 80 },
  indent: { left: 360 },
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  children: [new TextRun({ text, font: 'Angsana New', size: 26, color: C.darkText })],
  spacing: { after: 60 },
});

const numItem = (text, level = 0) => new Paragraph({
  numbering: { reference: 'numbers', level },
  children: [new TextRun({ text, font: 'Angsana New', size: 26, color: C.darkText })],
  spacing: { after: 60 },
});

// Info box (teal background)
const infoBox = (label, text) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [9360],
  rows: [new TableRow({ children: [new TableCell({
    borders: { top: border(C.teal), bottom: border(C.teal), left: { style: BorderStyle.SINGLE, size: 12, color: C.teal }, right: border(C.teal) },
    width: { size: 9360, type: WidthType.DXA },
    shading: { fill: C.lightTeal, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    children: [new Paragraph({ children: [
      new TextRun({ text: label + ': ', font: 'Angsana New', size: 24, bold: true, color: C.teal }),
      new TextRun({ text, font: 'Angsana New', size: 24, color: C.darkText }),
    ], spacing: { after: 0 } })],
  })})]},
});

// Warning box (orange background)
const warnBox = (text) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [9360],
  rows: [new TableRow({ children: [new TableCell({
    borders: { top: border(C.orange), bottom: border(C.orange), left: { style: BorderStyle.SINGLE, size: 12, color: C.orange }, right: border(C.orange) },
    width: { size: 9360, type: WidthType.DXA },
    shading: { fill: C.lightOrange, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 200, right: 200 },
    children: [new Paragraph({ children: [
      new TextRun({ text: 'สำคัญ: ', font: 'Angsana New', size: 24, bold: true, color: C.orange }),
      new TextRun({ text, font: 'Angsana New', size: 24, color: C.darkText }),
    ], spacing: { after: 0 } })],
  })})]},
});

// Step flow table
const stepTable = (steps) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [800, 8560],
  rows: steps.map((s, i) => new TableRow({ children: [
    new TableCell({
      borders: noBorders,
      width: { size: 800, type: WidthType.DXA },
      shading: { fill: C.teal, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [
        new TextRun({ text: `${i + 1}`, font: 'Arial', size: 28, bold: true, color: C.white }),
      ] })],
    }),
    new TableCell({
      borders: { top: noBorder, bottom: border(), left: noBorder, right: noBorder },
      width: { size: 8560, type: WidthType.DXA },
      shading: { fill: i % 2 === 0 ? C.gray : C.white, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 200, right: 200 },
      children: [new Paragraph({ spacing: { after: 0 }, children: [
        new TextRun({ text: s, font: 'Angsana New', size: 26, color: C.darkText }),
      ] })],
    }),
  ]})),
});

// Role-access badge row
const roleTable = (roles) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: Array(roles.length).fill(Math.floor(9360 / roles.length)),
  rows: [new TableRow({ children: roles.map(([role, hasAccess]) => new TableCell({
    borders: borders(C.midGray),
    width: { size: Math.floor(9360 / roles.length), type: WidthType.DXA },
    shading: { fill: hasAccess ? C.teal : C.gray, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [
      new TextRun({ text: role, font: 'Angsana New', size: 22, bold: hasAccess, color: hasAccess ? C.white : '888888' }),
    ] })],
  }))})],
});

// Status table
const statusTable = (statuses) => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2400, 6960],
  rows: [
    new TableRow({ children: [
      new TableCell({ borders: borders(C.teal), width: { size: 2400, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'สถานะ', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
      new TableCell({ borders: borders(C.teal), width: { size: 6960, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'ความหมาย', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
    ]}),
    ...statuses.map(([status, desc], i) => new TableRow({ children: [
      new TableCell({ borders: borders(), width: { size: 2400, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: status, font: 'Courier New', size: 22, bold: true, color: C.teal })] })] }),
      new TableCell({ borders: borders(), width: { size: 6960, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: desc, font: 'Angsana New', size: 24, color: C.darkText })] })] }),
    ]})),
  ],
});

// ── Cover Page ───────────────────────────────────────────────────────────────
const coverSection = {
  properties: {
    page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
  },
  children: [
    new Paragraph({ spacing: { before: 1800, after: 0 }, alignment: AlignmentType.CENTER, children: [] }),
    // Dark header bar via shading trick using a table
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [9026],
      rows: [new TableRow({ children: [new TableCell({
        borders: noBorders,
        width: { size: 9026, type: WidthType.DXA },
        shading: { fill: C.darkNav, type: ShadingType.CLEAR },
        margins: { top: 400, bottom: 400, left: 500, right: 500 },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
            new TextRun({ text: 'SMART PROCUREMENT SYSTEM', font: 'Arial', size: 48, bold: true, color: C.orange }),
          ]}),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
            new TextRun({ text: 'NSL Foods PLC', font: 'Arial', size: 32, bold: false, color: C.white }),
          ]}),
        ],
      })})]},
    ),
    sp(400),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
      new TextRun({ text: 'คู่มือผู้สอนการใช้งานระบบ', font: 'Angsana New', size: 52, bold: true, color: C.teal }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [
      new TextRun({ text: 'Trainer\'s Complete Reference Guide', font: 'Arial', size: 28, color: '666666' }),
    ]}),
    sp(600),
    new Table({
      width: { size: 6000, type: WidthType.DXA },
      columnWidths: [2800, 3200],
      rows: [
        [['จัดทำโดย', 'ทีมพัฒนาระบบ SmartProcure'],
         ['เวอร์ชัน', '1.0'],
         ['วันที่', 'เมษายน 2569'],
         ['ภาษา', 'ภาษาไทย / English'],
        ].map(([k, v]) => new TableRow({ children: [
          new TableCell({ borders: borders(C.midGray), width: { size: 2800, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k, font: 'Angsana New', size: 26, bold: true, color: C.white })] })] }),
          new TableCell({ borders: borders(C.midGray), width: { size: 3200, type: WidthType.DXA }, shading: { fill: C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: v, font: 'Angsana New', size: 26, color: C.darkText })] })] }),
        ]}))[0],
        [['จัดทำโดย', 'ทีมพัฒนาระบบ SmartProcure'],
         ['เวอร์ชัน', '1.0'],
         ['วันที่', 'เมษายน 2569'],
         ['ภาษา', 'ภาษาไทย / English'],
        ].map(([k, v]) => new TableRow({ children: [
          new TableCell({ borders: borders(C.midGray), width: { size: 2800, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k, font: 'Angsana New', size: 26, bold: true, color: C.white })] })] }),
          new TableCell({ borders: borders(C.midGray), width: { size: 3200, type: WidthType.DXA }, shading: { fill: C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: v, font: 'Angsana New', size: 26, color: C.darkText })] })] }),
        ]}))[1],
        [['จัดทำโดย', 'ทีมพัฒนาระบบ SmartProcure'],
         ['เวอร์ชัน', '1.0'],
         ['วันที่', 'เมษายน 2569'],
         ['ภาษา', 'ภาษาไทย / English'],
        ].map(([k, v]) => new TableRow({ children: [
          new TableCell({ borders: borders(C.midGray), width: { size: 2800, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k, font: 'Angsana New', size: 26, bold: true, color: C.white })] })] }),
          new TableCell({ borders: borders(C.midGray), width: { size: 3200, type: WidthType.DXA }, shading: { fill: C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: v, font: 'Angsana New', size: 26, color: C.darkText })] })] }),
        ]}))[2],
        [['จัดทำโดย', 'ทีมพัฒนาระบบ SmartProcure'],
         ['เวอร์ชัน', '1.0'],
         ['วันที่', 'เมษายน 2569'],
         ['ภาษา', 'ภาษาไทย / English'],
        ].map(([k, v]) => new TableRow({ children: [
          new TableCell({ borders: borders(C.midGray), width: { size: 2800, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k, font: 'Angsana New', size: 26, bold: true, color: C.white })] })] }),
          new TableCell({ borders: borders(C.midGray), width: { size: 3200, type: WidthType.DXA }, shading: { fill: C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: v, font: 'Angsana New', size: 26, color: C.darkText })] })] }),
        ]}))[3],
      ],
    }),
  ],
};

// ── Main Section content ──────────────────────────────────────────────────────
const mainChildren = [

  // TOC
  new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('สารบัญ')] }),
  new TableOfContents('สารบัญ', { hyperlink: true, headingStyleRange: '1-3' }),

  // ── CH1: Overview ─────────────────────────────────────────────────────────
  h1('บทที่ 1: ภาพรวมระบบ Smart Procurement', 'ch1'),
  body('Smart Procurement เป็นแพลตฟอร์มดิจิทัลสำหรับ NSL Foods PLC ที่รวมกระบวนการจัดซื้อจัดจ้างทั้งหมดไว้ในระบบเดียว ตั้งแต่การลงทะเบียน Supplier การออก RFQ การประมูล e-Bidding ไปจนถึงการอนุมัติ Award และการประเมินผล'),
  sp(100),

  h2('1.1 วัตถุประสงค์ของระบบ'),
  bullet('บริหารฐานข้อมูล Supplier แบบรวมศูนย์'),
  bullet('ลดกระดาษและขั้นตอนด้วย Digital Workflow'),
  bullet('เพิ่มความโปร่งใสในกระบวนการจัดซื้อ'),
  bullet('รองรับการประมูลออนไลน์แบบ Reverse Auction'),
  bullet('ติดตาม KPI และรายงานเชิงวิเคราะห์แบบ Real-time'),
  sp(120),

  h2('1.2 กลุ่มผู้ใช้งานและสิทธิ์ (User Roles)'),
  new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [2200, 1600, 5226],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: borders(C.teal), width: { size: 2200, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'Role', font: 'Arial', size: 24, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 1600, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'ชื่อ', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 5226, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'สิทธิ์การเข้าถึง', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
      ]}),
      ...([
        ['admin', 'ผู้ดูแลระบบ', 'เข้าถึงทุกโมดูล จัดการ User สิทธิ์ ตั้งค่าระบบ อนุมัติ Supplier'],
        ['procurement_officer', 'เจ้าหน้าที่จัดซื้อ', 'สร้าง/จัดการ RFQ, Supplier, e-Bidding, Evaluation'],
        ['approver', 'ผู้อนุมัติ', 'อนุมัติ Supplier และ Award ดูรายงาน'],
        ['executive', 'ผู้บริหาร', 'ดู Dashboard และรายงานเท่านั้น (Read-only)'],
        ['supplier', 'Supplier', 'Supplier Portal, ดู RFQ ที่ได้รับเชิญ'],
      ].map(([role, name, desc], i) => new TableRow({ children: [
        new TableCell({ borders: borders(), width: { size: 2200, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: role, font: 'Courier New', size: 22, bold: true, color: C.teal })] })] }),
        new TableCell({ borders: borders(), width: { size: 1600, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: name, font: 'Angsana New', size: 24, color: C.darkText })] })] }),
        new TableCell({ borders: borders(), width: { size: 5226, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: desc, font: 'Angsana New', size: 24, color: C.darkText })] })] }),
      ]}))),
    ],
  }),
  sp(120),

  h2('1.3 ภาพรวม Workflow หลักของระบบ'),
  body('กระบวนการจัดซื้อในระบบ SmartProcure ประกอบด้วย 6 ขั้นตอนหลัก:'),
  stepTable([
    'ลงทะเบียน Supplier — Supplier สมัครผ่านระบบ ระบุข้อมูลบริษัท ผู้ติดต่อ เอกสาร และสร้าง Account',
    'อนุมัติ Supplier — Admin ตรวจสอบและอนุมัติ/ปฏิเสธ Supplier ที่ยื่นสมัคร',
    'ออก RFQ — เจ้าหน้าที่จัดซื้อสร้าง RFQ พร้อม Line Items และเชิญ Supplier ที่ได้รับอนุมัติ',
    'e-Bidding (ถ้ามี) — จัดประมูลออนไลน์แบบ Reverse Auction เพื่อได้ราคาที่ดีที่สุด',
    'Award — เจ้าหน้าที่เสนอ Award ให้ผู้อนุมัติตัดสินใจ',
    'ประเมินผล — ประเมินคะแนน Supplier หลังจบงาน เพื่อใช้ในการจัดซื้อครั้งต่อไป',
  ]),
  sp(120),

  // ── CH2: Login ──────────────────────────────────────────────────────────
  h1('บทที่ 2: การเข้าสู่ระบบ (Login)', 'ch2'),
  body('หน้า Login เป็นจุดเข้าสู่ระบบสำหรับผู้ใช้ทุก Role ยกเว้น Supplier ใหม่ที่ต้องลงทะเบียนก่อน'),
  sp(80),

  h2('2.1 วิธีเข้าสู่ระบบ'),
  stepTable([
    'เปิด Browser และไปที่ URL ของระบบ: https://smartprocurement-2026.web.app',
    'กรอก Email Address ที่ได้รับจากผู้ดูแลระบบ',
    'กรอก Password (อย่างน้อย 6 ตัวอักษร)',
    'กดปุ่ม Sign In เพื่อเข้าสู่ระบบ',
    'ระบบจะตรวจสอบสิทธิ์และพาไปยัง Dashboard โดยอัตโนมัติ',
  ]),
  sp(100),

  h2('2.2 สิ่งที่ต้องรู้สำหรับผู้สอน'),
  warnBox('Supplier ที่ยังไม่ได้รับการอนุมัติจาก Admin จะไม่สามารถเข้าสู่ระบบได้ ระบบจะแสดงข้อความ "บัญชีของท่านอยู่ระหว่างการตรวจสอบ"'),
  sp(80),
  bullet('หากลืมรหัสผ่าน ต้องติดต่อ Admin เพื่อ Reset Password ผ่านหน้า Admin Settings'),
  bullet('ระบบจะจำ Session ไว้ ไม่ต้อง Login ใหม่ทุกครั้งที่เปิด Browser'),
  bullet('การออกจากระบบ: กดปุ่ม "Sign out" ที่ด้านล่างของ Sidebar'),
  sp(120),

  // ── CH3: Dashboard ──────────────────────────────────────────────────────
  h1('บทที่ 3: Dashboard', 'ch3'),
  body('Dashboard คือหน้าหลักที่แสดง KPI สำคัญและ Activity ล่าสุดของระบบ ผู้ใช้ทุก Role เห็น Dashboard แต่ข้อมูลที่แสดงอาจแตกต่างกันตามสิทธิ์'),
  sp(80),

  h2('3.1 ส่วนประกอบของ Dashboard'),
  h3('KPI Cards (การ์ดสรุปตัวเลขสำคัญ)'),
  new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [2500, 6526],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: borders(C.teal), width: { size: 2500, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'การ์ด', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 6526, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'ความหมาย', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
      ]}),
      ...([
        ['Total Suppliers', 'จำนวน Supplier ทั้งหมด แยกย่อยเป็น Approved / Pending'],
        ['Open RFQs', 'จำนวน RFQ ที่กำลังดำเนินการ แสดง Draft แยกต่างหาก'],
        ['Active Auctions', 'การประมูล e-Bidding ที่กำลัง Active อยู่'],
        ['Pending Awards', 'จำนวน Award ที่รอการอนุมัติ'],
      ].map(([k, v], i) => new TableRow({ children: [
        new TableCell({ borders: borders(), width: { size: 2500, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k, font: 'Arial', size: 22, bold: true, color: C.teal })] })] }),
        new TableCell({ borders: borders(), width: { size: 6526, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: v, font: 'Angsana New', size: 24, color: C.darkText })] })] }),
      ]}))),
    ],
  }),
  sp(100),
  h3('ส่วนข้อมูลเพิ่มเติม'),
  bullet('Supplier Status Distribution — กราฟแสดงสัดส่วน Supplier แยกตามสถานะ'),
  bullet('Recent Activity — รายการกิจกรรมล่าสุดในระบบ (คลิกเพื่อไปยังรายการนั้นได้)'),
  bullet('Top-rated Suppliers — Supplier ที่ได้คะแนนประเมินสูงสุด'),
  sp(120),

  // ── CH4: Suppliers ─────────────────────────────────────────────────────
  h1('บทที่ 4: การจัดการ Supplier', 'ch4'),
  body('โมดูล Suppliers เป็นศูนย์กลางของฐานข้อมูล Supplier ครอบคลุมตั้งแต่การสร้าง ตรวจสอบ อนุมัติ และบริหารจัดการข้อมูล'),
  sp(80),

  h2('4.1 สถานะของ Supplier'),
  statusTable([
    ['draft', 'สร้างโดยเจ้าหน้าที่ ยังไม่ได้ส่งตรวจสอบ'],
    ['submitted', 'Supplier ลงทะเบียนเองหรือส่งข้อมูลแล้ว รอตรวจสอบ'],
    ['review', 'Admin กำลังตรวจสอบอยู่'],
    ['approved', 'อนุมัติแล้ว สามารถเข้าระบบและร่วม RFQ ได้'],
    ['rejected', 'ปฏิเสธการลงทะเบียน'],
    ['suspended', 'ระงับการใช้งานชั่วคราว'],
  ]),
  sp(100),

  h2('4.2 การสร้าง Supplier ใหม่ (Admin/เจ้าหน้าที่จัดซื้อ)'),
  stepTable([
    'ไปที่เมนู Suppliers > กดปุ่ม "เพิ่ม Supplier"',
    'กรอกข้อมูลบริษัท: ชื่อบริษัท (จำเป็น), Tax ID, อีเมล, เบอร์โทร, ที่อยู่, เว็บไซต์',
    'เลือก Tier ของ Supplier (Critical Tier 1 หรือ Non-Critical Tier 1)',
    'กด Save — ระบบจะบันทึกด้วยสถานะ "draft"',
    'เปิด Supplier ที่สร้าง > เพิ่มผู้ติดต่อในแท็บ "Contacts"',
    'อัปโหลดเอกสารในแท็บ "Documents" (ถ้ามี)',
    'กด "ส่งตรวจสอบ" เพื่อเปลี่ยนสถานะเป็น submitted',
  ]),
  sp(100),

  h2('4.3 การเปลี่ยนสถานะ Supplier'),
  body('การเปลี่ยนสถานะทำได้จากหน้า Supplier Detail โดยกดปุ่มด้านบนขวา:'),
  bullet('draft → submitted: กด "ส่งตรวจสอบ" (Send for Review)'),
  bullet('submitted → review: กด "เริ่มตรวจสอบ" (Start Review) — Admin เท่านั้น'),
  bullet('review → approved: กด "อนุมัติ" — Admin เท่านั้น'),
  bullet('review → rejected: กด "ปฏิเสธ" พร้อมระบุเหตุผล — Admin เท่านั้น'),
  bullet('rejected → draft: กด "กลับ Draft" เพื่อแก้ไขและส่งใหม่'),
  sp(80),
  infoBox('สิทธิ์', 'Admin และ Procurement Officer สามารถแก้ไขข้อมูล Supplier ได้ | Admin เท่านั้นที่อนุมัติ/ปฏิเสธได้'),
  sp(100),

  h2('4.4 แท็บข้อมูลใน Supplier Detail'),
  h3('แท็บ Information'),
  bullet('ข้อมูลทั่วไปของบริษัท: ชื่อ, Tax ID, ที่อยู่, เว็บไซต์, Tier'),
  bullet('Flag พิเศษ: Is Preferred (Supplier ที่ได้รับการพิจารณาเป็นพิเศษ), Is Blacklisted (ห้ามใช้งาน)'),
  h3('แท็บ Contacts'),
  bullet('รายชื่อผู้ติดต่อของ Supplier: ชื่อ, ตำแหน่ง, อีเมล, เบอร์โทร'),
  bullet('กำหนดได้ว่าใครเป็น Primary Contact'),
  h3('แท็บ Documents'),
  bullet('เอกสารประกอบ: หนังสือรับรองบริษัท, ภพ.20, หนังสือจดทะเบียนพาณิชย์, สำเนาบัตรประชาชน, หนังสือรับรองบัญชีธนาคาร, งบการเงิน, อื่นๆ'),
  bullet('ดาวน์โหลดเอกสารได้โดยคลิกที่ชื่อไฟล์'),
  h3('แท็บ ESG Profile'),
  bullet('ข้อมูลด้านสิ่งแวดล้อม สังคม และธรรมาภิบาล (Environmental, Social, Governance)'),
  sp(120),

  // ── CH5: Supplier Registration ─────────────────────────────────────────
  h1('บทที่ 5: การลงทะเบียน Supplier (Self-Service)', 'ch5'),
  body('Supplier สามารถลงทะเบียนด้วยตนเองผ่านหน้า Register ซึ่งเป็น Wizard 5 ขั้นตอน โดยไม่ต้องเข้าสู่ระบบก่อน'),
  sp(80),

  h2('5.1 ขั้นตอนการลงทะเบียน (5 Steps)'),
  stepTable([
    'Step 1 — ข้อมูลบริษัท: ชื่อบริษัท (จำเป็น), Tax ID (จำเป็น), เว็บไซต์, ที่อยู่, เมือง, ประเทศ, เบอร์โทร',
    'Step 2 — ข้อมูลผู้ติดต่อ: ชื่อผู้ติดต่อ (จำเป็น), ตำแหน่ง, อีเมลผู้ติดต่อ (จำเป็น), เบอร์โทร',
    'Step 3 — ข้อมูลธนาคาร: ชื่อธนาคาร, สาขา, ชื่อบัญชี, เลขบัญชี, ประเภทบัญชี, SWIFT Code',
    'Step 4 — เอกสาร: อัปโหลดเอกสารอย่างน้อย 1 ไฟล์ (PDF, JPG, PNG, DOC, DOCX) เลือกประเภทเอกสาร',
    'Step 5 — สร้าง Account: ชื่อ-นามสกุล (จำเป็น), อีเมลสำหรับ Login (จำเป็น), รหัสผ่าน (อย่างน้อย 6 ตัว), ยืนยันรหัสผ่าน',
  ]),
  sp(100),

  h2('5.2 สิ่งที่เกิดขึ้นหลังลงทะเบียน'),
  bullet('ระบบสร้าง Account อัตโนมัติและกำหนด Role เป็น "supplier"'),
  bullet('สถานะ Supplier ถูกตั้งเป็น "submitted" ทันที'),
  bullet('Admin ทุกคนได้รับ Notification แจ้งเตือนว่ามี Supplier ลงทะเบียนใหม่'),
  bullet('ระบบ Sign Out Supplier ออกโดยอัตโนมัติ — ต้องรอ Admin อนุมัติก่อนจึงจะ Login ได้'),
  sp(80),
  warnBox('Supplier ที่ลงทะเบียนแล้วแต่ยังไม่ได้รับการอนุมัติจะไม่สามารถเข้าระบบได้ หากพยายาม Login จะเห็นข้อความแจ้งให้รอการอนุมัติ'),
  sp(120),

  // ── CH6: Supplier Approvals ────────────────────────────────────────────
  h1('บทที่ 6: การอนุมัติ Supplier (Admin)', 'ch6'),
  body('หน้า Supplier Approvals เป็นหน้าสำหรับ Admin โดยเฉพาะ ใช้ตรวจสอบและอนุมัติหรือปฏิเสธ Supplier ที่ลงทะเบียนใหม่'),
  sp(80),

  h2('6.1 วิธีอนุมัติ Supplier'),
  stepTable([
    'ไปที่เมนู Supplier Approvals (Admin เท่านั้น)',
    'ดูรายการ Supplier ที่มีสถานะ "submitted" หรือ "review"',
    'คลิกที่ชื่อ Supplier เพื่อดูรายละเอียด: ข้อมูลบริษัท, ผู้ติดต่อ, เอกสาร',
    'ดาวน์โหลดและตรวจสอบเอกสารประกอบ',
    'กดปุ่ม "อนุมัติ" — ระบบจะแจ้ง Supplier ทางอีเมล (ถ้าตั้งค่าไว้) และ Supplier สามารถ Login ได้',
    'หรือกดปุ่ม "ปฏิเสธ" พร้อมระบุเหตุผล — ระบบจะแจ้ง Supplier พร้อมเหตุผล',
  ]),
  sp(100),

  h2('6.2 สรุป KPI บนหน้า Supplier Approvals'),
  bullet('รอตรวจสอบ (submitted): รายการที่ยังไม่ได้เริ่มดำเนินการ'),
  bullet('กำลังตรวจสอบ (review): รายการที่ Admin กำลังดูอยู่'),
  bullet('อนุมัติแล้ว (approved): รายการที่ผ่านแล้ว'),
  bullet('ปฏิเสธ (rejected): รายการที่ไม่ผ่าน'),
  sp(120),

  // ── CH7: Price Lists ───────────────────────────────────────────────────
  h1('บทที่ 7: ราคามาตรฐาน (Price Lists)', 'ch7'),
  body('Price Lists คือรายการราคาที่ Supplier ยื่นเสนอให้ระบบ ใช้เป็นข้อมูลอ้างอิงในการออก RFQ และเปรียบเทียบราคา'),
  sp(80),

  h2('7.1 ข้อมูลใน Price List'),
  bullet('Title — ชื่อของ Price List'),
  bullet('Supplier — Supplier ที่เสนอราคา'),
  bullet('Valid Until — วันหมดอายุของราคา'),
  bullet('Status — สถานะของ Price List'),
  sp(80),
  infoBox('สิทธิ์การเข้าถึง', 'Admin และ Supplier สามารถสร้างและจัดการ Price List ได้ | Procurement Officer สามารถดูได้'),
  sp(120),

  // ── CH8: RFQ ───────────────────────────────────────────────────────────
  h1('บทที่ 8: การขอราคา (RFQ - Request for Quotation)', 'ch8'),
  body('RFQ คือกระบวนการออกใบขอราคาจาก Supplier เป็นขั้นตอนหลักในการจัดซื้อ โดยเจ้าหน้าที่จัดซื้อสร้าง RFQ พร้อมรายการสินค้า/บริการ แล้วเชิญ Supplier ที่ได้รับอนุมัติให้ตอบราคา'),
  sp(80),

  h2('8.1 สถานะของ RFQ'),
  statusTable([
    ['draft', 'สร้างแล้วแต่ยังไม่เผยแพร่ ยังแก้ไขได้'],
    ['published', 'เผยแพร่แล้ว Supplier ที่ได้รับเชิญสามารถส่งราคาได้'],
    ['closed', 'ปิดรับการส่งราคาแล้ว'],
    ['evaluation', 'อยู่ระหว่างการประเมินและเปรียบเทียบราคา'],
    ['awarded', 'เลือก Supplier ได้แล้ว'],
  ]),
  sp(100),

  h2('8.2 การสร้าง RFQ'),
  stepTable([
    'ไปที่เมนู RFQ > กดปุ่ม "สร้าง RFQ"',
    'กรอกข้อมูลหัว: ชื่อ RFQ (จำเป็น), คำอธิบาย, วันกำหนดส่งราคา (Deadline), หมายเหตุ',
    'เพิ่ม Line Items: คลิก "+ เพิ่มรายการ" กรอกชื่อสินค้า (จำเป็น), คำอธิบาย, จำนวน, หน่วย, ข้อกำหนดพิเศษ',
    'กด Save — ระบบสร้าง RFQ Number อัตโนมัติ (RFQ-{timestamp}) สถานะ: draft',
    'เปิด RFQ ที่สร้าง > แท็บ "Invited Suppliers" > เลือก Supplier ที่ต้องการเชิญ',
    'กด "เชิญ Supplier" — Supplier ที่เลือกจะได้รับการแจ้งเตือน',
    'กด "Publish RFQ" เพื่อเผยแพร่ (ต้องมี Supplier อย่างน้อย 1 ราย)',
  ]),
  sp(100),

  h2('8.3 การจัดการ RFQ (RFQ Detail)'),
  h3('แท็บ Details & Items'),
  bullet('ดูข้อมูลหัว RFQ และรายการสินค้าทั้งหมด'),
  h3('แท็บ Invited Suppliers'),
  bullet('ดูรายชื่อ Supplier ที่ได้รับเชิญ (ฝั่งซ้าย)'),
  bullet('เพิ่ม/ลบ Supplier (ทำได้เฉพาะสถานะ draft)'),
  bullet('ฝั่งขวาแสดง Supplier ที่พร้อมเชิญ (approved ทั้งหมด)'),
  h3('แท็บ Quotations'),
  bullet('ดูใบเสนอราคาที่ Supplier ส่งมา'),
  bullet('เปรียบเทียบราคาระหว่าง Supplier'),
  sp(80),
  infoBox('สิทธิ์', 'Admin และ Procurement Officer เท่านั้นที่สร้างและจัดการ RFQ ได้ | ทุก Role สามารถดูได้'),
  sp(120),

  // ── CH9: e-Bidding ─────────────────────────────────────────────────────
  h1('บทที่ 9: การประมูลออนไลน์ (e-Bidding)', 'ch9'),
  body('e-Bidding คือการประมูลแบบ Reverse Auction ที่ Supplier แข่งขันเสนอราคาต่ำที่สุด ใช้ร่วมกับ RFQ หรือใช้แยกก็ได้'),
  sp(80),

  h2('9.1 สถานะของ Bidding Event'),
  statusTable([
    ['scheduled', 'กำหนดการไว้แล้ว แต่ยังไม่ถึงเวลาเริ่ม'],
    ['active', 'กำลังประมูลอยู่ Supplier ส่งราคาได้'],
    ['closed', 'ปิดการประมูลแล้ว'],
    ['cancelled', 'ยกเลิกการประมูล'],
  ]),
  sp(100),

  h2('9.2 การสร้าง Bidding Event'),
  stepTable([
    'ไปที่เมนู e-Bidding > กดปุ่ม "สร้าง Bidding Event"',
    'กรอกชื่อ Event (จำเป็น) และคำอธิบาย',
    'เลือก RFQ ที่เกี่ยวข้อง (ถ้ามี) จาก Dropdown',
    'กำหนดวันและเวลาเริ่ม (Start Time) และสิ้นสุด (End Time)',
    'ตั้งค่าจำนวน Round สูงสุด (ค่าเริ่มต้น = 3 Rounds)',
    'กด Save — สถานะ: scheduled',
  ]),
  sp(80),
  infoBox('Max Rounds', 'ระบบรองรับการประมูลหลาย Round เพื่อให้ Supplier มีโอกาสปรับราคาได้ ระบบจะแสดง Round ปัจจุบัน (current_round / max_rounds)'),
  sp(120),

  // ── CH10: Final Quotations ─────────────────────────────────────────────
  h1('บทที่ 10: ใบเสนอราคาสุดท้าย (Final Quotations)', 'ch10'),
  body('Final Quotations คือสรุปใบเสนอราคาที่ผ่านการคัดเลือกจาก RFQ หรือ e-Bidding แล้ว ใช้เพื่อเปรียบเทียบและตัดสินใจ Award'),
  sp(80),
  bullet('เจ้าหน้าที่จัดซื้อดูและจัดการ Final Quotations จากหน้านี้'),
  bullet('สามารถค้นหาและกรองตามสถานะได้'),
  bullet('ใช้ข้อมูลนี้ประกอบการสร้าง Award'),
  sp(120),

  // ── CH11: Awards ───────────────────────────────────────────────────────
  h1('บทที่ 11: การอนุมัติจัดซื้อ (Awards)', 'ch11'),
  body('Awards คือขั้นตอนสุดท้ายของกระบวนการจัดซื้อ เจ้าหน้าที่เสนอ Award แล้วให้ผู้อนุมัติตัดสินใจ'),
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
    'เจ้าหน้าที่จัดซื้อสร้าง Award โดยระบุ Supplier ที่เลือก, RFQ ที่เกี่ยวข้อง, มูลค่า Award และ Recommendation',
    'Award มีสถานะ "pending" รอการพิจารณา',
    'ผู้อนุมัติ (Admin หรือ Approver) เข้าดูรายละเอียด Award',
    'ผู้อนุมัติกด "อนุมัติ" — ระบบตั้ง status=approved และ ready_for_po=true',
    'หรือกด "ปฏิเสธ" พร้อมระบุเหตุผล',
    'หรือกด "ส่งกลับแก้ไข" (Revise) พร้อมระบุสิ่งที่ต้องแก้',
    'เมื่อ Award approved — สามารถออก Purchase Order ได้ (นอกระบบ)',
  ]),
  sp(80),
  infoBox('KPI Cards', 'หน้า Awards แสดงสรุปตัวเลข: Total Awards | Pending Approval | Approved | PO Ready'),
  sp(120),

  // ── CH12: Evaluations ─────────────────────────────────────────────────
  h1('บทที่ 12: การประเมินผล Supplier (Evaluations)', 'ch12'),
  body('Evaluations ใช้วัดประสิทธิภาพของ Supplier หลังจบงาน คะแนนที่ได้จะแสดงใน Dashboard และใช้ประกอบการตัดสินใจ RFQ ครั้งต่อไป'),
  sp(80),

  h2('12.1 เกณฑ์การให้คะแนน (Scoring Weights)'),
  new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [4513, 4513],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: borders(C.teal), width: { size: 4513, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'เกณฑ์', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 4513, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'น้ำหนัก', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
      ]}),
      ...([['Service Score (คุณภาพบริการ)', '40%'], ['Commercial Score (ราคา/เงื่อนไขการค้า)', '25%'], ['ESG Score (สิ่งแวดล้อม/สังคม/ธรรมาภิบาล)', '20%'], ['Reliability (ความน่าเชื่อถือ/ตรงเวลา)', '15%']].map(([k, v], i) => new TableRow({ children: [
        new TableCell({ borders: borders(), width: { size: 4513, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: k, font: 'Angsana New', size: 24, color: C.darkText })] })] }),
        new TableCell({ borders: borders(), width: { size: 4513, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: v, font: 'Arial', size: 26, bold: true, color: C.orange })] })] }),
      ]}))),
    ],
  }),
  sp(100),

  h2('12.2 การแปลความหมายคะแนน'),
  bullet('4.0 - 5.0: ดีเยี่ยม (แสดงด้วยสีเขียว) — Supplier แนะนำให้ใช้งานต่อ'),
  bullet('3.0 - 3.9: ดี (แสดงด้วยสีน้ำเงิน) — ใช้งานได้ปกติ'),
  bullet('2.0 - 2.9: พอใช้ (แสดงด้วยสีเหลือง) — ต้องติดตามและพัฒนา'),
  bullet('ต่ำกว่า 2.0: ต้องปรับปรุง (แสดงด้วยสีแดง) — พิจารณาระงับการใช้งาน'),
  sp(100),

  h2('12.3 Evaluation Templates'),
  body('Template ใช้กำหนดเกณฑ์การประเมินมาตรฐาน เจ้าหน้าที่สามารถสร้าง Template ใหม่ได้จากแท็บ Templates แล้วนำไปใช้กับการประเมิน Supplier แต่ละราย'),
  sp(120),

  // ── CH13: Reports ─────────────────────────────────────────────────────
  h1('บทที่ 13: รายงานและการวิเคราะห์ (Reports)', 'ch13'),
  body('หน้า Reports รวมรายงานเชิงวิเคราะห์แบบ Real-time ช่วยผู้บริหารและเจ้าหน้าที่ติดตาม KPI การจัดซื้อ'),
  sp(80),

  h2('13.1 KPI Cards หลัก'),
  bullet('Total Spend (YTD) — ยอดจัดซื้อสะสมตั้งแต่ต้นปี (ล้านบาท)'),
  bullet('Savings Rate — อัตราการประหยัดเทียบกับราคาอ้างอิง (%)'),
  bullet('RFQ Win Rate — อัตราความสำเร็จของ RFQ ที่นำไปสู่การ Award (%)'),
  bullet('Active Suppliers — จำนวน Supplier ที่ active อยู่'),
  sp(100),

  h2('13.2 รายงานแยกตามหมวด'),
  h3('Spending Trends'),
  bullet('กราฟ Monthly Procurement Spending — ยอดจัดซื้อรายเดือน 12 เดือนย้อนหลัง'),
  bullet('กราฟ Savings Breakdown — การประหยัดจากการประมูลและการเจรจา'),
  h3('RFQ Analytics'),
  bullet('กราฟ RFQ Activity — จำนวน RFQ ที่สร้าง/อนุมัติ/ยกเลิก รายเดือน'),
  bullet('กราฟ RFQ Cycle Time — เวลาเฉลี่ยในการดำเนินการ RFQ จนถึง Award (วัน)'),
  h3('Supplier Performance'),
  bullet('Pie Chart — สัดส่วน Supplier แยกตามสถานะ'),
  bullet('Radar Chart — เปรียบเทียบ Supplier ชั้นนำในแต่ละมิติ'),
  bullet('ตารางคะแนน — รายชื่อ Supplier ที่มีคะแนนสูงสุด'),
  sp(120),

  // ── CH14: Supplier Portal ─────────────────────────────────────────────
  h1('บทที่ 14: Supplier Portal (สำหรับ Supplier)', 'ch14'),
  body('Supplier Portal คือหน้าที่ Supplier ใช้จัดการข้อมูลของตนเอง หลังจากได้รับการอนุมัติแล้ว'),
  sp(80),

  h2('14.1 ข้อมูลที่ Supplier จัดการเองได้'),
  h3('แท็บ Company Info'),
  bullet('แก้ไขข้อมูลบริษัท: ชื่อ, Tax ID, เว็บไซต์, ที่อยู่, เบอร์โทร, อีเมล, หมายเหตุ'),
  bullet('กด Save เพื่อบันทึก'),
  h3('แท็บ Contacts'),
  bullet('เพิ่ม/แก้ไข/ลบ ผู้ติดต่อ'),
  bullet('กำหนด Primary Contact'),
  h3('แท็บ Documents'),
  bullet('อัปโหลดเอกสารเพิ่มเติม: เลือกประเภทเอกสาร > เลือกไฟล์ > กด Upload'),
  bullet('ดาวน์โหลดหรือลบเอกสารเดิม'),
  sp(80),
  infoBox('สถานะ Supplier', 'Supplier จะเห็นสถานะตนเองที่มุมบนขวาของ Portal: Draft / Pending Review / Under Review / Approved / Rejected / Suspended'),
  sp(120),

  // ── CH15: Admin Settings ──────────────────────────────────────────────
  h1('บทที่ 15: ตั้งค่าระบบ (Admin Settings)', 'ch15'),
  body('Admin Settings เป็นหน้าสำหรับ Admin เท่านั้น ใช้จัดการ User, Role, การส่งอีเมล และค่า Config ของระบบ'),
  sp(80),

  h2('15.1 การจัดการ User (แท็บ Users)'),
  h3('การสร้าง User ใหม่'),
  stepTable([
    'กดปุ่ม "สร้างผู้ใช้"',
    'กรอกชื่อ-นามสกุล (จำเป็น), อีเมล (จำเป็น), รหัสผ่าน (จำเป็น)',
    'เลือก Role: admin, procurement_officer, approver, executive, supplier',
    'กด "สร้างผู้ใช้" — User สามารถ Login ได้ทันที',
  ]),
  sp(80),
  h3('การ Reset Password'),
  bullet('กดปุ่ม "Reset Password" ข้างชื่อ User'),
  bullet('กรอกรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร) แล้วกด "บันทึก"'),
  sp(80),
  h3('การเปิด/ปิด User'),
  bullet('Toggle สวิตช์ Active/Inactive ข้างชื่อ User เพื่อเปิดหรือปิดการใช้งาน'),
  bullet('User ที่ถูกปิด (Inactive) จะไม่สามารถ Login ได้'),
  sp(80),
  warnBox('การสร้าง User ในระบบต้องใช้ Service Role Key (VITE_SUPABASE_SERVICE_ROLE_KEY) หากยังไม่ได้ตั้งค่า ฟีเจอร์นี้จะไม่ทำงาน ให้ติดต่อทีม IT'),
  sp(100),

  h2('15.2 การตั้งค่าอีเมล (แท็บ Email)'),
  bullet('เปิด/ปิดการส่งอีเมลแจ้งเตือน (Toggle Email Enabled)'),
  bullet('กำหนด SMTP Server: Host, Port (ค่าเริ่มต้น 587), Username, Password'),
  bullet('กำหนดชื่อและอีเมลผู้ส่ง'),
  bullet('เลือกเหตุการณ์ที่จะส่งอีเมล: Supplier ลงทะเบียนใหม่ / อนุมัติ Supplier / ปฏิเสธ Supplier'),
  bullet('แก้ไข Template อีเมลอนุมัติและปฏิเสธ (รองรับตัวแปร: {{company_name}}, {{supplier_name}}, {{login_url}}, {{reason}})'),
  sp(100),

  h2('15.3 Role ในระบบ (แท็บ Roles)'),
  new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [2500, 1800, 4726],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: borders(C.teal), width: { size: 2500, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'Role', font: 'Arial', size: 22, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 1800, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'ชื่อไทย', font: 'Angsana New', size: 22, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 4726, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'สิทธิ์หลัก', font: 'Angsana New', size: 22, bold: true, color: C.white })] })] }),
      ]}),
      ...([
        ['admin', 'ผู้ดูแลระบบ', 'เข้าถึงทุกส่วน จัดการ User, อนุมัติ Supplier, ตั้งค่าระบบ'],
        ['procurement_officer', 'เจ้าหน้าที่จัดซื้อ', 'สร้าง RFQ, จัดการ Supplier, สร้าง e-Bidding, ประเมินผล'],
        ['approver', 'ผู้อนุมัติ', 'อนุมัติ Supplier Registration, อนุมัติ Award, ดูรายงาน'],
        ['executive', 'ผู้บริหาร', 'ดู Dashboard และรายงานเท่านั้น ไม่สามารถแก้ไขได้'],
        ['supplier', 'Supplier', 'เข้าถึง Supplier Portal, ดู RFQ ที่ได้รับเชิญ'],
      ].map(([role, name, desc], i) => new TableRow({ children: [
        new TableCell({ borders: borders(), width: { size: 2500, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: role, font: 'Courier New', size: 20, bold: true, color: C.teal })] })] }),
        new TableCell({ borders: borders(), width: { size: 1800, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: name, font: 'Angsana New', size: 22, color: C.darkText })] })] }),
        new TableCell({ borders: borders(), width: { size: 4726, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: desc, font: 'Angsana New', size: 22, color: C.darkText })] })] }),
      ]}))),
    ],
  }),
  sp(120),

  // ── CH16: Tips for Trainers ───────────────────────────────────────────
  h1('บทที่ 16: คำแนะนำสำหรับผู้สอน', 'ch16'),

  h2('16.1 ลำดับการสอนที่แนะนำ'),
  numItem('เริ่มจากภาพรวม Workflow ทั้งหมด (บทที่ 1) ให้ผู้เรียนเห็นภาพก่อน'),
  numItem('สาธิตการ Login และ Dashboard (บทที่ 2-3) เพื่อให้คุ้นเคยกับ UI'),
  numItem('สอนการลงทะเบียน Supplier แบบ Self-Service (บทที่ 5) — ให้ผู้เรียนทำเอง'),
  numItem('สอนการอนุมัติ Supplier (บทที่ 6) ในฐานะ Admin'),
  numItem('สาธิต End-to-End: RFQ → e-Bidding → Award (บทที่ 8-11)'),
  numItem('สอนการประเมินผล Supplier (บทที่ 12)'),
  numItem('ปิดด้วย Admin Settings และการจัดการ User (บทที่ 15)'),
  sp(100),

  h2('16.2 Scenarios สำหรับการฝึกปฏิบัติ'),
  h3('Scenario 1: กระบวนการจัดซื้อครบวงจร (ใช้เวลา ~30 นาที)'),
  bullet('ผู้เรียน A เล่นเป็น Supplier — ลงทะเบียนผ่านหน้า Register'),
  bullet('ผู้เรียน B เล่นเป็น Admin — อนุมัติ Supplier'),
  bullet('ผู้เรียน B สร้าง RFQ และเชิญ Supplier A'),
  bullet('ผู้เรียน A เข้า Supplier Portal และตอบ RFQ'),
  bullet('ผู้เรียน B ปิด RFQ และสร้าง Award'),
  bullet('ผู้เรียน C เล่นเป็น Approver — อนุมัติ Award'),
  sp(80),
  h3('Scenario 2: จัดการ Supplier Database (ใช้เวลา ~15 นาที)'),
  bullet('สร้าง Supplier ใหม่ด้วยตนเองพร้อมเอกสาร'),
  bullet('เปลี่ยนสถานะตามลำดับ: draft → submitted → review → approved'),
  bullet('ทดลองตั้งค่า is_preferred และ is_blacklisted'),
  sp(100),

  h2('16.3 คำถามที่พบบ่อย (FAQ)'),
  new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [4000, 5026],
    rows: [
      new TableRow({ children: [
        new TableCell({ borders: borders(C.teal), width: { size: 4000, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'คำถาม', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
        new TableCell({ borders: borders(C.teal), width: { size: 5026, type: WidthType.DXA }, shading: { fill: C.teal, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'คำตอบ', font: 'Angsana New', size: 24, bold: true, color: C.white })] })] }),
      ]}),
      ...([
        ['Supplier Login ไม่ได้ ทำอย่างไร?', 'ตรวจสอบว่า Admin อนุมัติแล้วหรือยัง หากยังให้ Admin ไปที่ Supplier Approvals แล้วอนุมัติ'],
        ['ลืมรหัสผ่าน ทำอย่างไร?', 'Admin ไปที่ Admin Settings > Users > กดปุ่ม Reset Password ข้างชื่อผู้ใช้'],
        ['เพิ่ม Supplier เข้า RFQ ไม่ได้?', 'ตรวจสอบว่า RFQ ยังอยู่สถานะ "draft" และ Supplier ที่ต้องการเชิญมีสถานะ "approved"'],
        ['Award อนุมัติแล้ว แต่ PO ออกได้ที่ไหน?', 'ระบบนี้ดูแลถึงขั้น Award Approval เท่านั้น การออก PO ทำในระบบ ERP แยกต่างหาก'],
        ['คะแนน Supplier มาจากไหน?', 'จากการประเมินใน Evaluations Module โดยเจ้าหน้าที่จัดซื้อ ใช้ Template และเกณฑ์ 4 ด้าน'],
        ['จะดูรายงานส่งออก Excel ได้ไหม?', 'ระบบแสดงข้อมูลใน Charts ปัจจุบัน การ Export Excel เป็น Feature ที่จะเพิ่มในอนาคต'],
      ].map(([q, a], i) => new TableRow({ children: [
        new TableCell({ borders: borders(), width: { size: 4000, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: q, font: 'Angsana New', size: 22, bold: true, color: C.darkText })] })] }),
        new TableCell({ borders: borders(), width: { size: 5026, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? C.lightTeal : C.white, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: a, font: 'Angsana New', size: 22, color: C.darkText })] })] }),
      ]}))),
    ],
  }),
  sp(80),
];

// ── Build Document ────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }, { level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Angsana New', size: 26 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 40, bold: true, font: 'Arial', color: C.white }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0, shading: { fill: C.teal, type: ShadingType.CLEAR } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: 'Arial', color: C.teal }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.teal, space: 4 } } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: 'Arial', color: C.orange }, paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: [
    // Cover page (no header/footer)
    {
      ...coverSection,
      properties: {
        ...coverSection.properties,
        titlePage: true,
      },
    },
    // Main content with header/footer
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
            new TextRun({ text: '  |  ลิขสิทธิ์ 2569 NSL Foods PLC', font: 'Angsana New', size: 18, color: '888888' }),
          ],
        })] }),
      },
      children: mainChildren,
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/Users/golf/Desktop/SmartProcure_TrainerManual.docx', buffer);
  console.log('Done: SmartProcure_TrainerManual.docx');
});
