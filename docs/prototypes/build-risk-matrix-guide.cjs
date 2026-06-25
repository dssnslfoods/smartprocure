'use strict';
const pptxgen = require('/Users/golf/.nvm/versions/node/v22.22.2/lib/node_modules/pptxgenjs');

// ── Palette ────────────────────────────────────────────────────────────────
const NAVY  = '1B3A5C';
const TEAL  = '028090';
const GOLD  = 'E8A020';
const WHITE = 'FFFFFF';
const DARK  = '1E293B';
const MUTED = '64748B';

// ── Helpers ────────────────────────────────────────────────────────────────
const mkShadow = () => ({ type: 'outer', blur: 8, offset: 2, angle: 135, color: '000000', opacity: 0.10 });

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 10" × 5.625"
pres.title  = 'คู่มือ ABC-XYZ 9×9 Sub-Tier Matrix';

// ─── Header bar helper ─────────────────────────────────────────────────────
function addHeader(s, txt) {
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.65, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText(txt, { x: 0.4, y: 0, w: 9.2, h: 0.65, fontSize: 20, color: WHITE, bold: true, valign: 'middle', margin: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 1 – Cover
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  s.addShape(pres.shapes.RECTANGLE, { x: 0,    y: 0, w: 0.25, h: 5.625, fill: { color: TEAL }, line: { color: TEAL } });
  s.addShape(pres.shapes.RECTANGLE, { x: 9.75, y: 0, w: 0.25, h: 5.625, fill: { color: GOLD }, line: { color: GOLD } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.25, y: 3.8, w: 9.5, h: 0.07, fill: { color: TEAL }, line: { color: TEAL } });

  s.addText('SUPPLIER RISK INTELLIGENCE', {
    x: 0.5, y: 1.1, w: 9, h: 0.4, fontSize: 11, color: TEAL, bold: true,
    align: 'center', margin: 0, charSpacing: 5,
  });
  s.addText('คู่มือ ABC-XYZ\n9 × 9 Sub-Tier Matrix', {
    x: 0.5, y: 1.55, w: 9, h: 2.0, fontSize: 44, color: WHITE, bold: true,
    align: 'center', valign: 'middle',
  });
  s.addText('แนวคิด · สูตรคำนวณ · วิธีใช้ · Action Plan', {
    x: 0.5, y: 3.55, w: 9, h: 0.45, fontSize: 16, color: 'CADCFC', italic: true,
    align: 'center', margin: 0,
  });
  s.addText('Smart Procurement  ·  NSL Foods PLC', {
    x: 0.5, y: 5.1, w: 9, h: 0.32, fontSize: 10, color: MUTED, align: 'center', margin: 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 2 – ทำไมต้อง 9×9
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'ทำไมต้องอัปเกรดจาก 3×3 → 9×9?');

  // Left: problems
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 0.82, w: 4.3, h: 4.45, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 0.82, w: 4.3, h: 0.47, fill: { color: 'FEE2E2' }, line: { color: 'FECACA', pt: 1 } });
  s.addText('❌  ปัญหาของ 3×3 เดิม', {
    x: 0.5, y: 0.84, w: 4.05, h: 0.43, fontSize: 12.5, color: 'DC2626', bold: true, valign: 'middle', margin: 0,
  });
  const probs = [
    'ข้อมูล 96% กระจุกใน CX — วิเคราะห์ไม่ได้',
    'คอลัมน์ Y/Z ว่างเปล่าทั้งหมด',
    'XYZ วัดแค่จำนวน supplier ขาด demand risk',
    '4 ระดับ (Critical / Bottleneck / Important / Routine) หยาบเกิน',
    'ไม่มี P-Score ต่อเนื่อง → ลำดับ priority ผิดพลาด',
  ];
  probs.forEach((t, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y: 1.42 + i * 0.65, w: 0.22, h: 0.22,
      fill: { color: 'F87171' }, line: { color: 'F87171' },
    });
    s.addText(t, { x: 0.82, y: 1.39 + i * 0.65, w: 3.7, h: 0.58, fontSize: 11.5, color: DARK });
  });

  // Right: solutions
  s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 0.82, w: 4.3, h: 4.45, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 0.82, w: 4.3, h: 0.47, fill: { color: 'DCFCE7' }, line: { color: 'BBF7D0', pt: 1 } });
  s.addText('✅  สิ่งที่ 9×9 Sub-Tier แก้ได้', {
    x: 5.45, y: 0.84, w: 4.05, h: 0.43, fontSize: 12.5, color: '15803D', bold: true, valign: 'middle', margin: 0,
  });
  const sols = [
    '81 ช่อง → กระจายตัวดีขึ้น Gini ลดลง',
    'XYZ = 0.6·(1/n_supplier) + 0.4·CV(demand)',
    'P-Score ต่อเนื่อง 0–1 → จัดลำดับแม่นยำ',
    '5 ระดับ P1–P5 พร้อม Action Plan ชัดเจน',
    'วิเคราะห์ risk ต่อ supplier ได้ทันที',
  ];
  sols.forEach((t, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 5.45, y: 1.42 + i * 0.65, w: 0.22, h: 0.22,
      fill: { color: '4ADE80' }, line: { color: '4ADE80' },
    });
    s.addText(t, { x: 5.77, y: 1.39 + i * 0.65, w: 3.7, h: 0.58, fontSize: 11.5, color: DARK });
  });

  // Arrow
  s.addText('→', { x: 4.55, y: 2.7, w: 0.75, h: 0.5, fontSize: 30, color: TEAL, align: 'center', bold: true, margin: 0 });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 3 – แกน ABC (Pareto)
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'แกน ABC  ·  มูลค่าซื้อสะสม (Pareto Analysis)');

  // Concept card (left)
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 0.82, w: 4.15, h: 4.5, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 0.82, w: 4.15, h: 0.42, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText('หลักการ', { x: 0.5, y: 0.84, w: 3.9, h: 0.38, fontSize: 13, color: WHITE, bold: true, valign: 'middle', margin: 0 });

  const conceptLines = [
    ['เรียงลำดับ item จากมูลค่าซื้อ สูงสุด → ต่ำสุด', false],
    ['คำนวณ cumulative % ของ spend ทั้งหมด', false],
    ['', false],
    ['Item ที่ cumulative % ถึง 50% แรก → A+ tier', true],
    ['Item ยาวท้ายสุด (99.5–100%) → C− tier', true],
    ['', false],
    ['ทำไมไม่ใช้ threshold ตายตัว?', false],
    ['เพราะ spend distribution แตกต่างกันในแต่ละบริษัท — cumulative % ทำให้ tier ปรับตามข้อมูลจริง', false],
  ];
  let yCur = 1.36;
  conceptLines.forEach(([txt, hl]) => {
    if (!txt) { yCur += 0.18; return; }
    s.addText(txt, {
      x: 0.5, y: yCur, w: 3.85, h: 0.42,
      fontSize: 11.5, color: hl ? TEAL : DARK, bold: hl,
    });
    yCur += 0.44;
  });

  // Pareto bar chart (right)
  s.addShape(pres.shapes.RECTANGLE, { x: 4.85, y: 0.82, w: 4.8, h: 4.5, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 4.85, y: 0.82, w: 4.8, h: 0.42, fill: { color: NAVY }, line: { color: NAVY } });
  s.addText('กราฟ Pareto Spend (ตัวอย่าง)', { x: 5.0, y: 0.84, w: 4.5, h: 0.38, fontSize: 12, color: WHITE, bold: true, valign: 'middle', margin: 0 });

  const barData = [
    { label: 'A+', h: 2.05, color: 'DC2626', pct: '50%' },
    { label: 'A',  h: 1.15, color: 'EF4444', pct: '+20%' },
    { label: 'A−', h: 0.70, color: 'F87171', pct: '+10%' },
    { label: 'B+', h: 0.48, color: 'F97316', pct: '+7%' },
    { label: 'B',  h: 0.38, color: 'FB923C', pct: '+6%' },
    { label: 'B−', h: 0.27, color: 'FCA5A5', pct: '+2%' },
    { label: 'C+', h: 0.20, color: '4ADE80', pct: '+3%' },
    { label: 'C',  h: 0.14, color: '22C55E', pct: '+1.5%' },
    { label: 'C−', h: 0.08, color: '15803D', pct: '+0.5%' },
  ];
  const BASE_Y = 4.85;
  const BAR_W = 0.38;
  const START_X = 5.05;
  barData.forEach((b, i) => {
    const bx = START_X + i * (BAR_W + 0.1);
    s.addShape(pres.shapes.RECTANGLE, { x: bx, y: BASE_Y - b.h, w: BAR_W, h: b.h, fill: { color: b.color }, line: { color: b.color } });
    s.addText(b.label, { x: bx - 0.02, y: BASE_Y + 0.03, w: BAR_W + 0.04, h: 0.22, fontSize: 8.5, color: DARK, align: 'center', margin: 0 });
    s.addText(b.pct, { x: bx - 0.02, y: BASE_Y - b.h - 0.22, w: BAR_W + 0.04, h: 0.20, fontSize: 7.5, color: b.color, bold: true, align: 'center', margin: 0 });
  });
  s.addShape(pres.shapes.LINE, { x: START_X - 0.05, y: BASE_Y, w: 4.1, h: 0, line: { color: DARK, width: 1.2 } });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 4 – เกณฑ์ ABC Sub-Tier
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'เกณฑ์แบ่ง ABC · 9 Sub-Tier');

  const rows = [
    { tier: 'A+', cum: '0 – 50%',       desc: 'Vital few — items กลุ่มเล็กที่รวมกันเป็น 50% ของงบซื้อทั้งหมด',   color: 'DC2626', bg: 'FEE2E2' },
    { tier: 'A',  cum: '50 – 70%',      desc: 'สำคัญมาก — เพิ่มอีก 20% ของ spend',                             color: 'EF4444', bg: 'FEE2E2' },
    { tier: 'A−', cum: '70 – 80%',      desc: 'สำคัญ — อยู่ใน top 80% ของ Pareto',                             color: 'F87171', bg: 'FEF2F2' },
    { tier: 'B+', cum: '80 – 87%',      desc: 'ปานกลาง-สูง — ถัดจาก A tier',                                  color: 'EA580C', bg: 'FFEDD5' },
    { tier: 'B',  cum: '87 – 93%',      desc: 'ปานกลาง — รักษาระดับ spend ปกติ',                              color: 'F97316', bg: 'FFEDD5' },
    { tier: 'B−', cum: '93 – 95%',      desc: 'ปานกลาง-ต่ำ — เข้าสู่ช่วง long tail',                          color: 'FB923C', bg: 'FFF7ED' },
    { tier: 'C+', cum: '95 – 98%',      desc: 'ต่ำ — เริ่ม long tail มีหลายรายการ',                            color: '16A34A', bg: 'DCFCE7' },
    { tier: 'C',  cum: '98 – 99.5%',    desc: 'ต่ำมาก — routine procurement',                                  color: '15803D', bg: 'F0FDF4' },
    { tier: 'C−', cum: '99.5 – 100%',   desc: 'Trivial many — item เป็นพัน ๆ รายการ สั่งซื้ออัตโนมัติได้',     color: '14532D', bg: 'F0FDF4' },
  ];

  // Column headers
  s.addText('Tier', { x: 0.35, y: 0.7, w: 0.88, h: 0.14, fontSize: 8.5, color: MUTED, align: 'center', margin: 0 });
  s.addText('Cumulative Spend', { x: 1.28, y: 0.7, w: 1.95, h: 0.14, fontSize: 8.5, color: MUTED, margin: 0 });
  s.addText('ความหมาย', { x: 3.28, y: 0.7, w: 6.35, h: 0.14, fontSize: 8.5, color: MUTED, margin: 0 });

  rows.forEach((r, i) => {
    const y = 0.82 + i * 0.495;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 9.3, h: 0.47, fill: { color: r.bg }, line: { color: 'E2E8F0', pt: 0.5 } });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 0.88, h: 0.47, fill: { color: r.color }, line: { color: r.color } });
    s.addText(r.tier, { x: 0.35, y, w: 0.88, h: 0.47, fontSize: 16, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0 });
    s.addText(r.cum,  { x: 1.28, y: y + 0.04, w: 1.95, h: 0.40, fontSize: 12, color: r.color, bold: true, valign: 'middle', margin: 0 });
    s.addText(r.desc, { x: 3.28, y: y + 0.04, w: 6.32, h: 0.40, fontSize: 11,  color: DARK,    valign: 'middle', margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 5 – แกน XYZ (Supply Risk Score)
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'แกน XYZ  ·  Supply Risk Score');

  // Formula box
  s.addShape(pres.shapes.RECTANGLE, { x: 1.0, y: 0.85, w: 8.0, h: 1.05, fill: { color: NAVY }, line: { color: NAVY }, shadow: mkShadow() });
  s.addText('Supply Risk Score  =  0.6 × (1 / n_supplier)  +  0.4 × CV(demand)', {
    x: 1.0, y: 0.85, w: 8.0, h: 1.05, fontSize: 18, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0,
  });

  // Factor 1 card
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 2.12, w: 4.3, h: 3.18, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 2.12, w: 4.3, h: 0.5,  fill: { color: TEAL  }, line: { color: TEAL  } });
  s.addText('① 1 / n_supplier  ·  น้ำหนัก 60%', { x: 0.5, y: 2.14, w: 4.05, h: 0.46, fontSize: 13, color: WHITE, bold: true, valign: 'middle', margin: 0 });
  const f1lines = [
    ['n_supplier = จำนวน supplier ที่ active ใน 12 เดือน', false],
    ['', false],
    ['1/1 = 1.000  →  single source  (เสี่ยงสูงสุด)', true],
    ['1/2 = 0.500  →  dual source', true],
    ['1/3 = 0.333  →  3 suppliers', true],
    ['1/5 = 0.200  →  5 suppliers  (เสี่ยงต่ำ)', true],
    ['', false],
    ['ใช้ inversion (1/n) เพราะ:', false],
    ['ยิ่งน้อย supplier → score ยิ่งสูง = เสี่ยงมาก', false],
  ];
  let yf1 = 2.75;
  f1lines.forEach(([t, hl]) => {
    if (!t) { yf1 += 0.15; return; }
    s.addText(t, { x: 0.52, y: yf1, w: 4.0, h: 0.38, fontSize: 11.5, color: hl ? TEAL : DARK, bold: hl, margin: 0 });
    yf1 += 0.38;
  });

  // Factor 2 card
  s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 2.12, w: 4.3, h: 3.18, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 2.12, w: 4.3, h: 0.5,  fill: { color: GOLD  }, line: { color: GOLD  } });
  s.addText('② CV(demand)  ·  น้ำหนัก 40%', { x: 5.45, y: 2.14, w: 4.05, h: 0.46, fontSize: 13, color: WHITE, bold: true, valign: 'middle', margin: 0 });
  const f2lines = [
    ['CV = Standard Deviation / Mean ของ demand รายเดือน', false],
    ['', false],
    ['CV < 0.25  →  สม่ำเสมอ พยากรณ์ได้', true],
    ['CV 0.25–0.50  →  ผันผวนเล็กน้อย', true],
    ['CV 0.50–1.0  →  ผันผวนปานกลาง', true],
    ['CV > 1.0  →  ผันผวนสูง / ตามฤดูกาล', true],
    ['', false],
    ['ใช้ min(1, CV) เพื่อ cap ค่าไว้ที่ 1.0', false],
    ['เพื่อไม่ให้ outlier ทำลาย score range', false],
  ];
  let yf2 = 2.75;
  f2lines.forEach(([t, hl]) => {
    if (!t) { yf2 += 0.15; return; }
    s.addText(t, { x: 5.45, y: yf2, w: 4.0, h: 0.38, fontSize: 11.5, color: hl ? GOLD : DARK, bold: hl, margin: 0 });
    yf2 += 0.38;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 6 – ทำไมน้ำหนัก 60:40
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'ทำไมน้ำหนัก 60% : 40% ?');

  s.addText('องค์ประกอบ Supply Risk Score', { x: 0.4, y: 0.8, w: 9.2, h: 0.38, fontSize: 14, color: NAVY, bold: true, align: 'center', margin: 0 });

  // Weight bar
  s.addShape(pres.shapes.RECTANGLE, { x: 1.8, y: 1.3, w: 6.4, h: 0.6,  fill: { color: TEAL }, line: { color: TEAL } });
  s.addText('① จำนวนคู่ค้า (1/n_supplier)  →  60%', { x: 1.8, y: 1.3, w: 6.4, h: 0.6, fontSize: 14, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0 });
  s.addShape(pres.shapes.RECTANGLE, { x: 1.8, y: 1.98, w: 4.27, h: 0.55, fill: { color: GOLD }, line: { color: GOLD } });
  s.addText('② CV(demand)  →  40%', { x: 1.8, y: 1.98, w: 4.27, h: 0.55, fontSize: 14, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0 });
  s.addShape(pres.shapes.RECTANGLE, { x: 6.07, y: 1.98, w: 2.13, h: 0.55, fill: { color: 'CBD5E1' }, line: { color: 'CBD5E1' } });

  // 3 reason cards
  const reasons = [
    {
      icon: '🔒', title: 'Single-source risk ควบคุมได้โดยตรง',
      body: 'การมี supplier รายเดียวคือความเสี่ยงที่ procurement team แก้ได้เลย (หา 2nd source) ความสำเร็จวัดได้ชัดเจน',
    },
    {
      icon: '📊', title: 'CV ขึ้นอยู่กับ demand จริง',
      body: 'ความผันผวนของ demand บางส่วนไม่ได้อยู่ที่ supplier — แต่สำคัญต่อ safety stock planning',
    },
    {
      icon: '⚙️', title: 'ปรับได้ตามบริบทบริษัท',
      body: 'FMCG / Fashion (demand ผันผวน) อาจเพิ่ม CV → 50% · Process industry อาจลด CV → 30%',
    },
  ];
  reasons.forEach((r, i) => {
    const rx = 0.35 + i * 3.22;
    s.addShape(pres.shapes.RECTANGLE, { x: rx, y: 2.75, w: 3.05, h: 2.65, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
    s.addText(r.icon,  { x: rx, y: 2.85, w: 3.05, h: 0.45, fontSize: 24, align: 'center', margin: 0 });
    s.addText(r.title, { x: rx + 0.12, y: 3.35, w: 2.82, h: 0.52, fontSize: 12, color: NAVY, bold: true, align: 'center', margin: 0 });
    s.addText(r.body,  { x: rx + 0.15, y: 3.9,  w: 2.75, h: 1.4,  fontSize: 10.5, color: DARK });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 7 – เกณฑ์ XYZ Sub-Tier
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'เกณฑ์แบ่ง XYZ · 9 Sub-Tier (Supply Risk Score)');

  const rows = [
    { tier: 'X+', range: '≥ 0.85',       nsup: '1 ราย',    cv: 'สูง',     desc: 'Single source + demand ผันผวน — เสี่ยงวิกฤต',           color: 'DC2626', bg: 'FEE2E2' },
    { tier: 'X',  range: '0.70 – 0.85',  nsup: '1 ราย',    cv: 'ปานกลาง', desc: 'Single source — demand คาดการณ์ได้บ้าง',               color: 'EF4444', bg: 'FEE2E2' },
    { tier: 'X−', range: '0.55 – 0.70',  nsup: '1 ราย',    cv: 'ต่ำ',     desc: 'Single source แต่ demand สม่ำเสมอ',                     color: 'F87171', bg: 'FEF2F2' },
    { tier: 'Y+', range: '0.45 – 0.55',  nsup: '2 ราย',    cv: 'สูง',     desc: '2 suppliers แต่ demand ผันผวน',                         color: 'EA580C', bg: 'FFEDD5' },
    { tier: 'Y',  range: '0.30 – 0.45',  nsup: '2–3 ราย',  cv: 'ปานกลาง', desc: '2–3 suppliers — balance ระหว่าง risk',                  color: 'F97316', bg: 'FFEDD5' },
    { tier: 'Y−', range: '0.20 – 0.30',  nsup: '3–4 ราย',  cv: 'ต่ำ',     desc: '3–4 suppliers + demand คาดการณ์ได้',                    color: 'FB923C', bg: 'FFF7ED' },
    { tier: 'Z+', range: '0.15 – 0.20',  nsup: '5+ ราย',   cv: 'สูง',     desc: 'หลาย supplier แต่ demand ผันผวน',                       color: '16A34A', bg: 'DCFCE7' },
    { tier: 'Z',  range: '0.08 – 0.15',  nsup: '5+ ราย',   cv: 'ต่ำ',     desc: 'หลาย supplier + demand สม่ำเสมอ',                       color: '15803D', bg: 'F0FDF4' },
    { tier: 'Z−', range: '< 0.08',        nsup: '5+ ราย',   cv: 'ต่ำมาก',  desc: 'Commodity — หลาย supplier + demand แทบไม่ผันผวน',       color: '14532D', bg: 'F0FDF4' },
  ];

  s.addText('Tier',         { x: 0.35, y: 0.70, w: 0.88, h: 0.13, fontSize: 8, color: MUTED, align: 'center', margin: 0 });
  s.addText('Risk Score',   { x: 1.28, y: 0.70, w: 1.55, h: 0.13, fontSize: 8, color: MUTED, margin: 0 });
  s.addText('n_supplier',   { x: 2.88, y: 0.70, w: 1.15, h: 0.13, fontSize: 8, color: MUTED, align: 'center', margin: 0 });
  s.addText('CV',           { x: 4.08, y: 0.70, w: 1.0,  h: 0.13, fontSize: 8, color: MUTED, align: 'center', margin: 0 });
  s.addText('ความหมาย',     { x: 5.15, y: 0.70, w: 4.5,  h: 0.13, fontSize: 8, color: MUTED, margin: 0 });

  rows.forEach((r, i) => {
    const y = 0.82 + i * 0.487;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 9.3, h: 0.46, fill: { color: r.bg }, line: { color: 'E2E8F0', pt: 0.5 } });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y, w: 0.88, h: 0.46, fill: { color: r.color }, line: { color: r.color } });
    s.addText(r.tier, { x: 0.35, y, w: 0.88, h: 0.46, fontSize: 14, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0 });
    s.addText(r.range, { x: 1.28, y: y+0.04, w: 1.55, h: 0.40, fontSize: 10.5, color: r.color, bold: true, valign: 'middle', margin: 0 });
    s.addText(r.nsup,  { x: 2.88, y: y+0.04, w: 1.15, h: 0.40, fontSize: 10.5, color: DARK, align: 'center', valign: 'middle', margin: 0 });
    s.addText(r.cv,    { x: 4.08, y: y+0.04, w: 1.0,  h: 0.40, fontSize: 10.5, color: DARK, align: 'center', valign: 'middle', margin: 0 });
    s.addText(r.desc,  { x: 5.15, y: y+0.04, w: 4.45, h: 0.40, fontSize: 10.5, color: DARK, valign: 'middle', margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 8 – P-Score Formula
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'P-Score  ·  Priority Score รวม 2 แกน + Criticality');

  s.addShape(pres.shapes.RECTANGLE, { x: 0.7, y: 0.85, w: 8.6, h: 0.95, fill: { color: NAVY }, line: { color: NAVY }, shadow: mkShadow() });
  s.addText('P-Score  =  0.55 × ABC_score  +  0.35 × XYZ_score  +  0.10 × Criticality', {
    x: 0.7, y: 0.85, w: 8.6, h: 0.95, fontSize: 17, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0,
  });

  const parts = [
    { label: 'ABC_score', w: '0.55', formula: '1 − (abcIdx / 8)', eg: 'A+ → 1.00\nA   → 0.875\nC−  → 0.00', color: TEAL, bg: 'E0F7FA' },
    { label: 'XYZ_score', w: '0.35', formula: '1 − (xyzIdx / 8)', eg: 'X+ → 1.00\nX   → 0.875\nZ−  → 0.00', color: GOLD, bg: 'FFF8E1' },
    { label: 'Criticality', w: '0.10', formula: '0 หรือ 1 (binary flag)', eg: '1 = ESG risk\n1 = Lead time > 60 วัน\n1 = สินค้าควบคุม', color: '7C3AED', bg: 'EDE9FE' },
  ];
  parts.forEach((p, i) => {
    const px = 0.35 + i * 3.12;
    s.addShape(pres.shapes.RECTANGLE, { x: px, y: 2.05, w: 3.0, h: 3.15, fill: { color: p.bg }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x: px, y: 2.05, w: 3.0, h: 0.48, fill: { color: p.color }, line: { color: p.color } });
    s.addText(`${p.label}  ×  ${p.w}`, { x: px+0.05, y: 2.07, w: 2.9, h: 0.44, fontSize: 13, color: WHITE, bold: true, valign: 'middle', margin: 0 });
    s.addText('สูตร', { x: px+0.15, y: 2.64, w: 2.7, h: 0.28, fontSize: 10, color: MUTED, bold: true, margin: 0 });
    s.addText(p.formula, { x: px+0.15, y: 2.9,  w: 2.7, h: 0.38, fontSize: 12, color: p.color, bold: true, margin: 0 });
    s.addText('ตัวอย่าง', { x: px+0.15, y: 3.36, w: 2.7, h: 0.28, fontSize: 10, color: MUTED, bold: true, margin: 0 });
    s.addText(p.eg, { x: px+0.15, y: 3.62, w: 2.7, h: 1.48, fontSize: 11.5, color: DARK });
  });

  // P-tier bar at bottom
  const pBands = [
    { lbl: 'P1 Critical  ≥ 0.75',     color: 'EF4444' },
    { lbl: 'P2 High  0.55–0.75',       color: 'F97316' },
    { lbl: 'P3 Medium  0.40–0.55',     color: 'EAB308' },
    { lbl: 'P4 Low  0.25–0.40',        color: '84CC16' },
    { lbl: 'P5 Routine  < 0.25',       color: '14B8A6' },
  ];
  pBands.forEach((b, i) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35 + i * 1.86, y: 5.22, w: 1.86, h: 0.3, fill: { color: b.color }, line: { color: b.color } });
    s.addText(b.lbl, { x: 0.35 + i * 1.86, y: 5.22, w: 1.86, h: 0.3, fontSize: 8.5, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 9 – ตัวอย่าง Step-by-Step
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'ตัวอย่าง Step-by-Step การคำนวณ');

  s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: 0.82, w: 9.3, h: 0.43, fill: { color: 'EFF6FF' }, line: { color: '93C5FD', pt: 1 } });
  s.addText('🧪  Item: สารปรุงแต่งกลิ่น A001  |  Spend ฿2.8M / ปี  ·  1 supplier  ·  CV demand = 0.65  ·  Criticality = 1', {
    x: 0.5, y: 0.83, w: 9.05, h: 0.41, fontSize: 11.5, color: NAVY, bold: true, valign: 'middle', margin: 0,
  });

  const steps = [
    {
      num: '01', title: 'คำนวณ ABC Tier',
      lines: [
        '· Total spend ทั้งหมด = ฿50M · Item นี้ spend ฿2.8M (cumulative % ณ จุดนี้ = 62%)',
        '· อยู่ใน 50–70% → Tier A  ·  abcIdx = 1',
        '· ABC_score = 1 − 1/8 = 0.875',
      ],
      result: 'Tier A  →  ABC_score = 0.875',
      rcolor: 'EF4444', rbg: 'FEE2E2',
    },
    {
      num: '02', title: 'คำนวณ XYZ / Supply Risk Score',
      lines: [
        '· n_supplier = 1  →  1/n = 1.000',
        '· CV(demand) = 0.65  →  min(1, 0.65) = 0.650',
        '· Supply Risk = 0.6 × 1.000 + 0.4 × 0.650 = 0.600 + 0.260 = 0.860',
      ],
      result: '0.860 ≥ 0.85  →  Tier X+  →  xyzIdx = 0  →  XYZ_score = 1.000',
      rcolor: 'DC2626', rbg: 'FEE2E2',
    },
    {
      num: '03', title: 'คำนวณ P-Score และ P-Tier',
      lines: [
        '· P = 0.55 × 0.875  +  0.35 × 1.000  +  0.10 × 1',
        '· P = 0.481         +  0.350          +  0.100  =  0.931',
        '· P-Score = 0.931 ≥ 0.75  →  P1 Critical',
      ],
      result: '⚠️  P1 · Critical — ต้องทำ BCP + หา 2nd source ทันที',
      rcolor: 'DC2626', rbg: 'FEE2E2',
    },
  ];

  steps.forEach((st, i) => {
    const sy = 1.42 + i * 1.35;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, sy, y: sy, w: 9.3, h: 1.27, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.35, y: sy, w: 0.65, h: 1.27, fill: { color: st.rcolor }, line: { color: st.rcolor } });
    s.addText(st.num, { x: 0.35, y: sy + 0.05, w: 0.65, h: 0.5, fontSize: 20, color: WHITE, bold: true, align: 'center', margin: 0 });
    s.addText(st.title, { x: 1.06, y: sy + 0.05, w: 8.5, h: 0.32, fontSize: 12.5, color: NAVY, bold: true, margin: 0 });
    st.lines.forEach((ln, j) => {
      s.addText(ln, { x: 1.08, y: sy + 0.38 + j * 0.22, w: 8.12, h: 0.22, fontSize: 10.5, color: DARK, margin: 0 });
    });
    s.addShape(pres.shapes.RECTANGLE, { x: 1.04, y: sy + 1.04, w: 8.17, h: 0.20, fill: { color: st.rbg }, line: { color: st.rcolor, pt: 0.5 } });
    s.addText('✓  ' + st.result, { x: 1.06, y: sy + 1.04, w: 8.1, h: 0.20, fontSize: 9.5, color: st.rcolor, bold: true, valign: 'middle', margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 10 – 9×9 Heat Map
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, '9 × 9 Sub-Tier Matrix  ·  Heat Map Overview');

  const ABC_L = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−'];
  const XYZ_L = ['X+', 'X', 'X−', 'Y+', 'Y', 'Y−', 'Z+', 'Z', 'Z−'];

  function cellCol(ai, xi) {
    const sc = ai + xi;
    if (sc <= 1)  return { bg: 'FEE2E2', bd: 'F87171', tx: 'DC2626' };
    if (sc <= 3)  return { bg: 'FEE2E2', bd: 'FCA5A5', tx: 'EF4444' };
    if (sc <= 5)  return { bg: 'FFEDD5', bd: 'FDBA74', tx: 'EA580C' };
    if (sc <= 7)  return { bg: 'FFF7ED', bd: 'FDBA74', tx: 'F97316' };
    if (sc <= 9)  return { bg: 'FEF9C3', bd: 'FCD34D', tx: 'CA8A04' };
    if (sc <= 11) return { bg: 'FEFCE8', bd: 'FDE68A', tx: 'B45309' };
    if (sc <= 13) return { bg: 'ECFCCB', bd: 'BEF264', tx: '4D7C0F' };
    if (sc <= 15) return { bg: 'F0FDF4', bd: '86EFAC', tx: '15803D' };
    return               { bg: 'F0FDFA', bd: '5EEAD4', tx: '0F766E' };
  }
  function pLbl(ai, xi) {
    const sc = ai + xi;
    if (sc <= 3)  return 'P1';
    if (sc <= 7)  return 'P2';
    if (sc <= 11) return 'P3';
    if (sc <= 14) return 'P4';
    return 'P5';
  }

  const CW = 0.82; const CH = 0.42;
  const GX = 1.35; const GY = 1.38;

  // Group headers
  const grps = [
    { lbl: 'X · Single / High Risk',    x: GX },
    { lbl: 'Y · 2–4 Suppliers',         x: GX + CW * 3 },
    { lbl: 'Z · 5+ Suppliers',          x: GX + CW * 6 },
  ];
  grps.forEach(g => {
    s.addShape(pres.shapes.RECTANGLE, { x: g.x, y: 0.75, w: CW * 3 - 0.04, h: 0.26, fill: { color: NAVY }, line: { color: NAVY } });
    s.addText(g.lbl, { x: g.x, y: 0.75, w: CW * 3 - 0.04, h: 0.26, fontSize: 8.5, color: WHITE, bold: true, align: 'center', valign: 'middle', margin: 0 });
  });

  // Col sub-labels
  XYZ_L.forEach((l, c) => {
    s.addText(l, { x: GX + c * CW, y: 1.03, w: CW - 0.02, h: 0.3, fontSize: 9.5, color: MUTED, bold: true, align: 'center', margin: 0 });
  });

  // Row labels
  ABC_L.forEach((l, r) => {
    s.addText(l, { x: 0.35, y: GY + r * CH, w: 0.95, h: CH - 0.02, fontSize: 10.5, color: DARK, bold: true, align: 'right', valign: 'middle', margin: 0 });
  });

  // Cells
  ABC_L.forEach((_, r) => {
    XYZ_L.forEach((__, c) => {
      const col = cellCol(r, c);
      const cx = GX + c * CW;
      const cy = GY + r * CH;
      s.addShape(pres.shapes.RECTANGLE, { x: cx, y: cy, w: CW - 0.03, h: CH - 0.03, fill: { color: col.bg }, line: { color: col.bd, pt: 0.8 } });
      s.addText(pLbl(r, c), { x: cx, y: cy, w: CW - 0.03, h: CH - 0.03, fontSize: 10, color: col.tx, bold: true, align: 'center', valign: 'middle', margin: 0 });
    });
  });

  // Legend
  const legs = [
    { lbl: 'P1 Critical', color: 'EF4444' },
    { lbl: 'P2 High',     color: 'F97316' },
    { lbl: 'P3 Medium',   color: 'EAB308' },
    { lbl: 'P4 Low',      color: '84CC16' },
    { lbl: 'P5 Routine',  color: '14B8A6' },
  ];
  s.addText('ระดับ:', { x: 0.35, y: 5.22, w: 0.9, h: 0.28, fontSize: 9, color: DARK, bold: true, valign: 'middle', margin: 0 });
  legs.forEach((lg, i) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 1.3 + i * 1.7, y: 5.25, w: 0.22, h: 0.22, fill: { color: lg.color }, line: { color: lg.color } });
    s.addText(lg.lbl, { x: 1.56 + i * 1.7, y: 5.22, w: 1.45, h: 0.28, fontSize: 9, color: DARK, valign: 'middle', margin: 0 });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 11 – Action Plan P1–P5
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: 'F5F7FA' };
  addHeader(s, 'Risk Mitigation Playbook  ·  P1 → P5');

  const cards = [
    {
      tier: 'P1', name: 'Critical',  kpi: 'Score ≥ 0.75', color: 'DC2626', bg: 'FEF2F2',
      acts: ['Dual / Multi-sourcing — หา 2nd source ทันที', 'Safety stock 60–90 วัน', 'BCP + supplier audit รายไตรมาส', 'Long-term contract + escalation clause'],
    },
    {
      tier: 'P2', name: 'High',      kpi: 'Score 0.55–0.75', color: 'EA580C', bg: 'FFF7ED',
      acts: ['Qualify backup supplier ภายใน 6 เดือน', 'SLA + KPI monitoring', 'Frame agreement 12–24 เดือน', 'Risk review ทุก 6 เดือน'],
    },
    {
      tier: 'P3', name: 'Medium',    kpi: 'Score 0.40–0.55', color: 'CA8A04', bg: 'FEFCE8',
      acts: ['RFQ ทุก 6–12 เดือน', 'Monitor demand variance', 'Periodic price benchmark'],
    },
    {
      tier: 'P4', name: 'Low',       kpi: 'Score 0.25–0.40', color: '4D7C0F', bg: 'F7FEE7',
      acts: ['Frame agreement', 'E-catalog / standardize', 'ลด admin & transaction cost'],
    },
    {
      tier: 'P5', name: 'Routine',   kpi: 'Score < 0.25', color: '0F766E', bg: 'F0FDFA',
      acts: ['Auto-PO / consignment', 'Vendor consolidation', 'Self-service portal'],
    },
  ];

  cards.forEach((c, i) => {
    const cx = 0.33 + i * 1.87;
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: 0.82, w: 1.79, h: 4.55, fill: { color: WHITE }, line: { color: 'E2E8F0', pt: 1 }, shadow: mkShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: 0.82, w: 1.79, h: 0.78, fill: { color: c.color }, line: { color: c.color } });
    s.addText(c.tier, { x: cx, y: 0.85, w: 1.79, h: 0.4, fontSize: 22, color: WHITE, bold: true, align: 'center', margin: 0 });
    s.addText(c.name, { x: cx, y: 1.22, w: 1.79, h: 0.3,  fontSize: 11, color: WHITE, align: 'center', margin: 0 });
    s.addShape(pres.shapes.RECTANGLE, { x: cx, y: 1.6, w: 1.79, h: 0.3, fill: { color: c.bg }, line: { color: c.bg } });
    s.addText(c.kpi, { x: cx, y: 1.6, w: 1.79, h: 0.3, fontSize: 9, color: c.color, bold: true, align: 'center', valign: 'middle', margin: 0 });
    c.acts.forEach((a, j) => {
      s.addShape(pres.shapes.OVAL, { x: cx + 0.12, y: 2.02 + j * 0.72, w: 0.2, h: 0.2, fill: { color: c.color }, line: { color: c.color } });
      s.addText(a, { x: cx + 0.36, y: 1.99 + j * 0.72, w: 1.36, h: 0.68, fontSize: 9.5, color: DARK, valign: 'top' });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SLIDE 12 – Summary
// ═══════════════════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  s.addShape(pres.shapes.RECTANGLE, { x: 0,    y: 0, w: 0.2, h: 5.625, fill: { color: TEAL }, line: { color: TEAL } });
  s.addShape(pres.shapes.RECTANGLE, { x: 9.8,  y: 0, w: 0.2, h: 5.625, fill: { color: GOLD }, line: { color: GOLD } });

  s.addText('สรุปแนวคิดสำคัญ', {
    x: 0.4, y: 0.3, w: 9.2, h: 0.55, fontSize: 28, color: WHITE, bold: true, align: 'center', margin: 0,
  });
  s.addText('ABC-XYZ 9×9 Sub-Tier Matrix for Supplier Risk Analysis', {
    x: 0.4, y: 0.85, w: 9.2, h: 0.32, fontSize: 13, color: TEAL, italic: true, align: 'center', margin: 0,
  });

  const pts = [
    { icon: '📐', txt: 'ABC ใช้ cumulative spend % → 9 sub-tier กระจายตัวตาม Pareto จริง — ไม่ใช้ threshold ตายตัว' },
    { icon: '🔗', txt: 'XYZ = Supply Risk Score: 0.6·(1/n_supplier) + 0.4·CV(demand) — รวม 2 ปัจจัยเชิงปริมาณ' },
    { icon: '🎯', txt: 'P-Score ต่อเนื่อง 0–1 = 0.55·ABC + 0.35·XYZ + 0.10·Criticality → เรียงลำดับ priority แม่นยำ' },
    { icon: '📊', txt: '81 ช่อง (9×9) กระจายตัวดีกว่า 3×3 — วัดได้ด้วย Gini coefficient ที่ต่ำลง' },
    { icon: '⚡', txt: 'P1–P5 Action Plan: P1 = dual-source + BCP 90 วัน  ·  P5 = Auto-PO + vendor consolidation' },
  ];

  pts.forEach((pt, i) => {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.65, y: 1.35 + i * 0.77, w: 8.7, h: 0.68,
      fill: { color: 'FFFFFF', transparency: 90 }, line: { color: 'FFFFFF', transparency: 80, pt: 0.5 },
    });
    s.addText(pt.icon, { x: 0.78, y: 1.37 + i * 0.77, w: 0.52, h: 0.64, fontSize: 20, align: 'center', valign: 'middle', margin: 0 });
    s.addText(pt.txt,  { x: 1.38, y: 1.37 + i * 0.77, w: 7.8,  h: 0.64, fontSize: 12.5, color: WHITE, valign: 'middle', margin: 0 });
  });

  s.addText('Smart Procurement  ·  NSL Foods PLC', {
    x: 0.4, y: 5.33, w: 9.2, h: 0.22, fontSize: 9, color: MUTED, align: 'center', margin: 0,
  });
}

// ── Write ──────────────────────────────────────────────────────────────────
const OUT = '/Users/golf/Desktop/ABC-XYZ-SubTier-Matrix-Guide.pptx';
pres.writeFile({ fileName: OUT })
  .then(() => console.log('✅ Saved:', OUT))
  .catch(err => { console.error('❌', err.message); process.exit(1); });
