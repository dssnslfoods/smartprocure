// Excel export/import for Price List checklist ↔ supplier quotation flow.
// Export uses ExcelJS for full styling; import still reads via SheetJS (browser-safe).
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export interface CatalogItemRow {
  id:               string;
  item_code:        string | null;
  item_name:        string;
  description:      string | null;
  unit:             string | null;
  reference_price:  number | null;
  target_quantity:  number | null;
  moq:              number | null;
  lead_time_days:   number | null;
  is_nominated:     boolean;
  designated_supplier_id: string | null;
}

export interface ChecklistMeta {
  catalogTitle:  string;
  catalogId:     string;
  category:      string;
  supplierName?: string;
  supplierId?:   string;
  rfqNumber?:    string;
  validUntil?:   string;
  notes?:        string;
}

// ─── Brand colors ─────────────────────────────────────────────────────────────
const NAVY   = '1E3A5F';
const BLUE   = '2563EB';
const TEAL   = '0F766E';
const AMBER  = 'D97706';
const WHITE  = 'FFFFFF';
const GRAY50 = 'F8FAFC';
const GRAY   = '64748B';
const LIGHT  = 'EFF6FF';   // very light blue — supplier-fill columns
const GOLD   = 'FEF3C7';   // nominated highlight

// ─── Style helpers ────────────────────────────────────────────────────────────
type FillPattern = ExcelJS.FillPatterns;

const solidFill = (hex: string): ExcelJS.Fill => ({
  type: 'pattern', pattern: 'solid' as FillPattern,
  fgColor: { argb: `FF${hex}` },
});

const font = (opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> => ({
  name: 'Calibri', size: 10, ...opts,
});

const border = (style: ExcelJS.BorderStyle = 'thin', hex = 'BFDBFE'): Partial<ExcelJS.Borders> => ({
  top:    { style, color: { argb: `FF${hex}` } },
  bottom: { style, color: { argb: `FF${hex}` } },
  left:   { style, color: { argb: `FF${hex}` } },
  right:  { style, color: { argb: `FF${hex}` } },
});

const alignment = (h: ExcelJS.Alignment['horizontal'] = 'left', wrap = false): Partial<ExcelJS.Alignment> => ({
  horizontal: h, vertical: 'middle', wrapText: wrap,
});

// Apply a full style preset to a cell
function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    bg?: string;
    fontColor?: string;
    bold?: boolean;
    italic?: boolean;
    size?: number;
    align?: ExcelJS.Alignment['horizontal'];
    wrap?: boolean;
    borderColor?: string;
    borderStyle?: ExcelJS.BorderStyle;
    numFmt?: string;
  } = {}
) {
  if (opts.bg) cell.fill = solidFill(opts.bg);
  cell.font = font({
    color: { argb: `FF${opts.fontColor ?? '1E293B'}` },
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    size: opts.size ?? 10,
  });
  cell.alignment = alignment(opts.align ?? 'left', opts.wrap ?? false);
  cell.border = border(opts.borderStyle ?? 'thin', opts.borderColor ?? 'E2E8F0');
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function exportChecklistToExcel(
  items: CatalogItemRow[],
  meta: ChecklistMeta
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'NSL Foods SmartProcure';
  wb.created = new Date();
  wb.modified = new Date();

  buildCoverSheet(wb, meta);
  buildChecklistSheet(wb, items, meta);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fname = `Checklist_${meta.category}_${(meta.supplierName || 'open').replace(/[^a-zA-Zก-๙0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  saveAs(blob, fname);
}

// ─── Sheet 1: Cover / Info ────────────────────────────────────────────────────
function buildCoverSheet(wb: ExcelJS.Workbook, meta: ChecklistMeta) {
  const ws = wb.addWorksheet('Cover', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  });

  ws.getColumn('A').width = 28;
  ws.getColumn('B').width = 52;
  ws.getColumn('C').width = 4;

  // ── Hero banner ──
  ws.mergeCells('A1:B3');
  const hero = ws.getCell('A1');
  hero.value = 'NSL Foods PLC';
  hero.fill = solidFill(NAVY);
  hero.font = font({ color: { argb: `FF${WHITE}` }, bold: true, size: 22 });
  hero.alignment = alignment('center');
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 22;

  ws.mergeCells('A4:B4');
  const sub = ws.getCell('A4');
  sub.value = 'PRICE LIST QUOTATION CHECKLIST';
  sub.fill = solidFill(BLUE);
  sub.font = font({ color: { argb: `FF${WHITE}` }, bold: true, size: 13, name: 'Calibri' });
  sub.alignment = alignment('center');
  ws.getRow(4).height = 26;

  ws.getRow(5).height = 12; // spacer

  // ── Info grid ──
  const infoRows: [string, string | undefined][] = [
    ['Catalog',     meta.catalogTitle],
    ['หมวดหมู่',    meta.category],
    ['RFQ No.',     meta.rfqNumber || '—'],
    ['Supplier',    meta.supplierName || 'เปิดให้ทุกราย'],
    ['ใช้ได้ถึง',  meta.validUntil  || '—'],
    ['Generated',   new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })],
  ];

  let r = 6;
  for (const [label, value] of infoRows) {
    ws.getRow(r).height = 22;
    const lCell = ws.getCell(`A${r}`);
    lCell.value = label;
    styleCell(lCell, { bg: GRAY50, bold: true, fontColor: NAVY, borderColor: 'CBD5E1' });

    const vCell = ws.getCell(`B${r}`);
    vCell.value = value;
    styleCell(vCell, { borderColor: 'CBD5E1' });
    r++;
  }

  // ── Hidden catalog ID (for import) ──
  ws.getRow(r).height = 1;
  ws.getCell(`A${r}`).value = 'Catalog ID';
  ws.getCell(`B${r}`).value = meta.catalogId;
  ws.getRow(r).hidden = true;
  r += 2;

  // ── Instructions box ──
  ws.getRow(r).height = 20;
  ws.mergeCells(`A${r}:B${r}`);
  const instrHdr = ws.getCell(`A${r}`);
  instrHdr.value = '📋  คำแนะนำการกรอกข้อมูล';
  instrHdr.fill = solidFill(TEAL);
  instrHdr.font = font({ color: { argb: `FF${WHITE}` }, bold: true, size: 11 });
  instrHdr.alignment = alignment('left');
  r++;

  const instructions = [
    '1)  กรอกข้อมูลเฉพาะในคอลัมน์ที่มีพื้นหลังสีฟ้า (ด้านขวาของเส้นแบ่ง)',
    '2)  คอลัมน์ "ราคาต่อหน่วย" บังคับกรอก — ปล่อยว่างหากไม่ต้องการเสนอรายการนั้น',
    '3)  ห้ามแก้ไขคอลัมน์ทางซ้าย (รหัสสินค้า, ชื่อ, ปริมาณ) และ Sheet ID ที่ซ่อนอยู่',
    '4)  รายการที่ระบุว่า ★ NOMINATED คือสินค้าที่กำหนด Supplier ไว้โดย QA เท่านั้น',
    '5)  บันทึกไฟล์และส่งกลับให้จัดซื้อเพื่อ Import เข้าระบบ',
  ];

  for (const instr of instructions) {
    ws.getRow(r).height = 18;
    ws.mergeCells(`A${r}:B${r}`);
    const ic = ws.getCell(`A${r}`);
    ic.value = instr;
    styleCell(ic, { bg: 'F0FDF4', fontColor: '166534', borderColor: 'BBF7D0', size: 9, wrap: true });
    r++;
  }

  r++;
  // ── Contact footer ──
  ws.mergeCells(`A${r}:B${r}`);
  const ft = ws.getCell(`A${r}`);
  ft.value = 'ติดต่อจัดซื้อ: procurement@nslfoods.co.th  |  ระบบ SmartProcure — NSL Foods PLC';
  ft.fill = solidFill(NAVY);
  ft.font = font({ color: { argb: `FF${WHITE}` }, size: 9, italic: true });
  ft.alignment = alignment('center');
  ws.getRow(r).height = 18;
}

// ─── Sheet 2: Checklist ───────────────────────────────────────────────────────
function buildChecklistSheet(
  wb: ExcelJS.Workbook,
  items: CatalogItemRow[],
  meta: ChecklistMeta
) {
  const ws = wb.addWorksheet('Checklist', {
    views: [{ showGridLines: false, state: 'frozen', xSplit: 0, ySplit: 5 }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddHeader: `&L&"Calibri,Bold"&12NSL Foods PLC — Price List Quotation Checklist&R${meta.catalogTitle} | ${meta.category}`,
      oddFooter: '&L&9ไฟล์นี้จัดทำโดยระบบ SmartProcure — NSL Foods PLC&R&9หน้า &P / &N',
    },
    properties: { tabColor: { argb: `FF${NAVY}` } },
  });

  // ── Column widths ──
  const cols = [
    { key: 'id',       width: 5,  hidden: true  },  // A — hidden ID
    { key: 'seq',      width: 5   },                  // B — #
    { key: 'code',     width: 14  },                  // C
    { key: 'name',     width: 36  },                  // D
    { key: 'desc',     width: 32  },                  // E
    { key: 'unit',     width: 8   },                  // F
    { key: 'qty',      width: 14  },                  // G target qty
    { key: 'ref',      width: 14  },                  // H reference price
    { key: 'divider',  width: 3   },                  // I divider
    { key: 'price',    width: 18  },                  // J ★ supplier fills
    { key: 'moq',      width: 12  },                  // K ★
    { key: 'lead',     width: 14  },                  // L ★
    { key: 'quoteno',  width: 22  },                  // M ★
    { key: 'notes',    width: 28  },                  // N ★
  ];
  ws.columns = cols.map(c => ({ key: c.key, width: c.width, hidden: c.hidden }));

  // ── Row 1: Document title banner ──
  ws.getRow(1).height = 30;
  ws.mergeCells('A1:H1');
  const titleLeft = ws.getCell('A1');
  titleLeft.value = `NSL Foods PLC  ·  PRICE LIST QUOTATION CHECKLIST  ·  ${meta.catalogTitle.toUpperCase()}`;
  titleLeft.fill = solidFill(NAVY);
  titleLeft.font = font({ color: { argb: `FF${WHITE}` }, bold: true, size: 13 });
  titleLeft.alignment = alignment('left');

  ws.mergeCells('J1:N1');
  const titleRight = ws.getCell('J1');
  titleRight.value = `RFQ: ${meta.rfqNumber || '—'}   |   ${meta.supplierName || 'เปิดให้ทุกราย'}`;
  titleRight.fill = solidFill(NAVY);
  titleRight.font = font({ color: { argb: `FFFFD700` }, bold: true, size: 11 });
  titleRight.alignment = alignment('right');

  // divider cell I1
  ws.getCell('I1').fill = solidFill(NAVY);

  // ── Row 2: Section labels ──
  ws.getRow(2).height = 18;
  ws.mergeCells('B2:H2');
  const readOnly = ws.getCell('B2');
  readOnly.value = '◀  ข้อมูลอ้างอิง (ห้ามแก้ไข)';
  readOnly.fill = solidFill('CBD5E1');
  readOnly.font = font({ color: { argb: `FF${GRAY}` }, bold: true, size: 9 });
  readOnly.alignment = alignment('right');

  ws.getCell('I2').fill = solidFill('334155');

  ws.mergeCells('J2:N2');
  const fillArea = ws.getCell('J2');
  fillArea.value = 'กรอกข้อมูลในส่วนนี้  ▶';
  fillArea.fill = solidFill(BLUE);
  fillArea.font = font({ color: { argb: `FF${WHITE}` }, bold: true, size: 9 });
  fillArea.alignment = alignment('left');

  // ── Row 3: Sub-header detail ──
  ws.getRow(3).height = 14;
  const gen = ws.getCell('B3');
  gen.value = `Generated: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  gen.font = font({ color: { argb: `FF${GRAY}` }, size: 8, italic: true });
  gen.fill = solidFill(GRAY50);
  ['C3','D3','E3','F3','G3','H3'].forEach(a => { ws.getCell(a).fill = solidFill(GRAY50); });
  ws.getCell('I3').fill = solidFill('334155');
  ['J3','K3','L3','M3','N3'].forEach(a => { ws.getCell(a).fill = solidFill(LIGHT); });

  // ── Row 4: spacer ──
  ws.getRow(4).height = 4;
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getRow(4).getCell(c);
    cell.fill = solidFill(c === 9 ? '334155' : c <= 8 ? 'E2E8F0' : 'BFDBFE');
  }

  // ── Row 5: Column headers ──
  ws.getRow(5).height = 32;
  const headers = [
    { col: 'A', label: 'ID',          bg: NAVY,    fc: WHITE, align: 'center' as const },
    { col: 'B', label: '#',           bg: NAVY,    fc: WHITE, align: 'center' as const },
    { col: 'C', label: 'รหัสสินค้า',  bg: NAVY,    fc: WHITE, align: 'center' as const },
    { col: 'D', label: 'ชื่อสินค้า',  bg: NAVY,    fc: WHITE, align: 'left'   as const },
    { col: 'E', label: 'รายละเอียด', bg: NAVY,    fc: WHITE, align: 'left'   as const },
    { col: 'F', label: 'หน่วย',       bg: NAVY,    fc: WHITE, align: 'center' as const },
    { col: 'G', label: 'ปริมาณที่ขอ', bg: NAVY,    fc: WHITE, align: 'center' as const },
    { col: 'H', label: 'ราคาอ้างอิง\n(บาท/หน่วย)', bg: '0F4C81', fc: WHITE, align: 'center' as const },
    { col: 'I', label: '',            bg: '1E293B', fc: WHITE, align: 'center' as const },
    { col: 'J', label: '★ ราคาต่อหน่วย\n(THB) *บังคับ*', bg: '1D4ED8', fc: WHITE, align: 'center' as const },
    { col: 'K', label: 'MOQ ที่เสนอ', bg: TEAL,    fc: WHITE, align: 'center' as const },
    { col: 'L', label: 'Lead Time\n(วัน)',          bg: TEAL,    fc: WHITE, align: 'center' as const },
    { col: 'M', label: 'เลขใบเสนอราคา\nอ้างอิง',  bg: TEAL,    fc: WHITE, align: 'center' as const },
    { col: 'N', label: 'หมายเหตุ',   bg: TEAL,    fc: WHITE, align: 'left'   as const },
  ];

  for (const h of headers) {
    const cell = ws.getCell(`${h.col}5`);
    cell.value = h.label;
    cell.fill = solidFill(h.bg);
    cell.font = font({ color: { argb: `FF${h.fc}` }, bold: true, size: 9 });
    cell.alignment = { horizontal: h.align, vertical: 'middle', wrapText: true };
    cell.border = {
      top:    { style: 'medium', color: { argb: `FF${WHITE}` } },
      bottom: { style: 'medium', color: { argb: `FF${WHITE}` } },
      left:   { style: 'thin',   color: { argb: `FF${WHITE}` } },
      right:  { style: 'thin',   color: { argb: `FF${WHITE}` } },
    };
  }

  // ── Data rows ──
  const totalRows = items.length;
  items.forEach((it, idx) => {
    const rowNum = idx + 6;
    const row = ws.getRow(rowNum);
    row.height = it.description ? 28 : 20;

    const isEven = idx % 2 === 0;
    const isNom  = it.is_nominated;
    const readBg = isNom ? GOLD : isEven ? WHITE : GRAY50;
    const fillBg = isNom ? 'FEF9C3' : isEven ? 'EFF6FF' : DBLUE(idx);

    // A: hidden ID
    const idCell = row.getCell(1);
    idCell.value = it.id;
    idCell.fill = solidFill(NAVY);
    idCell.font = font({ color: { argb: `FF${NAVY}` }, size: 7 });

    // B: sequence number
    const seqCell = row.getCell(2);
    seqCell.value = idx + 1;
    styleCell(seqCell, { bg: readBg, fontColor: GRAY, align: 'center', size: 9 });

    // C: item code
    const codeCell = row.getCell(3);
    codeCell.value = it.item_code || '';
    styleCell(codeCell, { bg: readBg, fontColor: GRAY, align: 'center', size: 9 });

    // D: item name
    const nameCell = row.getCell(4);
    nameCell.value = isNom ? `★  ${it.item_name}` : it.item_name;
    styleCell(nameCell, { bg: readBg, bold: isNom, fontColor: isNom ? '92400E' : '1E3A5F', size: 10, wrap: true });

    // E: description
    const descCell = row.getCell(5);
    descCell.value = it.description || '';
    styleCell(descCell, { bg: readBg, fontColor: GRAY, size: 8, wrap: true });

    // F: unit
    const unitCell = row.getCell(6);
    unitCell.value = it.unit || '';
    styleCell(unitCell, { bg: readBg, align: 'center', size: 9 });

    // G: target quantity
    const qtyCell = row.getCell(7);
    qtyCell.value = it.target_quantity ?? null;
    styleCell(qtyCell, { bg: readBg, align: 'right', size: 10, numFmt: '#,##0.##' });
    if (it.target_quantity) qtyCell.font = font({ bold: true, size: 10, color: { argb: `FF${NAVY}` } });

    // H: reference price
    const refCell = row.getCell(8);
    refCell.value = it.reference_price ?? null;
    styleCell(refCell, { bg: readBg, align: 'right', size: 10, numFmt: '#,##0.00', fontColor: '0F4C81', italic: true });

    // I: visual divider
    const divCell = row.getCell(9);
    divCell.fill = solidFill('1E293B');

    // J: bid price ★ supplier fills
    const priceCell = row.getCell(10);
    priceCell.value = null;
    styleCell(priceCell, { bg: fillBg, align: 'right', size: 11, numFmt: '#,##0.00', borderColor: '93C5FD', borderStyle: 'medium' });
    priceCell.font = font({ bold: true, size: 11, color: { argb: `FF${'1E40AF'}` } });

    // K: bid MOQ
    const moqCell = row.getCell(11);
    moqCell.value = null;
    styleCell(moqCell, { bg: fillBg, align: 'right', size: 10, numFmt: '#,##0', borderColor: '5EEAD4' });

    // L: lead time
    const leadCell = row.getCell(12);
    leadCell.value = null;
    styleCell(leadCell, { bg: fillBg, align: 'right', size: 10, numFmt: '0', borderColor: '5EEAD4' });

    // M: ref quotation no
    const quoteCell = row.getCell(13);
    quoteCell.value = null;
    styleCell(quoteCell, { bg: fillBg, size: 9, borderColor: '5EEAD4' });

    // N: notes
    const notesCell = row.getCell(14);
    notesCell.value = null;
    styleCell(notesCell, { bg: fillBg, size: 9, borderColor: '5EEAD4', wrap: true });
  });

  // ── Totals / summary row ──
  const summaryRow = totalRows + 6;
  ws.getRow(summaryRow).height = 20;
  ws.mergeCells(`B${summaryRow}:G${summaryRow}`);
  const totalLabel = ws.getCell(`B${summaryRow}`);
  totalLabel.value = `รวม ${totalRows} รายการ`;
  totalLabel.fill = solidFill(NAVY);
  totalLabel.font = font({ color: { argb: `FF${WHITE}` }, bold: true });
  totalLabel.alignment = alignment('right');

  ws.getCell(`H${summaryRow}`).fill = solidFill(NAVY);
  ws.getCell(`I${summaryRow}`).fill = solidFill('1E293B');

  ws.mergeCells(`J${summaryRow}:N${summaryRow}`);
  const totalHint = ws.getCell(`J${summaryRow}`);
  totalHint.value = '← กรอกราคาต่อหน่วยทุกรายการที่ต้องการเสนอ แล้วบันทึกไฟล์ส่งคืนจัดซื้อ';
  totalHint.fill = solidFill('1D4ED8');
  totalHint.font = font({ color: { argb: `FF${WHITE}` }, size: 9, italic: true });
  totalHint.alignment = alignment('left');

  // ── Auto-filter on header row ──
  ws.autoFilter = { from: { row: 5, column: 2 }, to: { row: 5, column: 8 } };

  // ── Print area ──
  ws.pageSetup.printArea = `A1:N${summaryRow}`;
}

// Helper for alternating fill-area rows
function DBLUE(idx: number) {
  return idx % 2 === 0 ? 'EFF6FF' : 'DBEAFE';
}

// ─── Import (unchanged — reads column indices) ────────────────────────────────
export interface ImportedQuoteRow {
  price_list_item_id:     string;
  bid_price:              number | null;
  target_quantity:        number | null;
  bid_moq:                number | null;
  bid_lead_time:          number | null;
  reference_quotation_no: string | null;
  notes:                  string | null;
  source_row:             number;
}

export interface ImportResult {
  rows:   ImportedQuoteRow[];
  errors: { row: number; message: string }[];
  meta:   { catalogId?: string; rfqNumber?: string };
}

export async function importQuotationFromExcel(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf);
  const result: ImportResult = { rows: [], errors: [], meta: {} };

  // Pull catalog ID from Cover sheet
  const cover = wb.Sheets['Cover'];
  if (cover) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(cover, { header: 1, blankrows: false }) as unknown[][];
    grid.forEach(r => {
      const k = String(r?.[0] || '').trim();
      const v = String(r?.[1] || '').trim();
      if (k === 'Catalog ID') result.meta.catalogId = v;
      if (k === 'RFQ No.')    result.meta.rfqNumber  = v;
    });
  }

  const ws = wb.Sheets['Checklist'];
  if (!ws) {
    result.errors.push({ row: 0, message: 'ไม่พบ sheet ชื่อ "Checklist" ในไฟล์' });
    return result;
  }

  // Header is row 5 (index 4); data starts at row 6 (index 5)
  // Columns (0-indexed): A=0(ID) B=1(#) C=2(code) D=3(name) E=4(desc) F=5(unit)
  //                      G=6(qty) H=7(ref) I=8(divider)
  //                      J=9(price) K=10(moq) L=11(lead) M=12(quoteno) N=13(notes)
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) as unknown[][];

  for (let i = 5; i < grid.length; i++) {   // skip rows 0-4 (banner + header)
    const row = grid[i];
    const id  = String(row?.[0] || '').trim();
    if (!id || id.length < 10) continue;     // skip non-UUID rows

    const bidPriceRaw = row[9];              // col J
    if (bidPriceRaw === undefined || bidPriceRaw === '' || bidPriceRaw === null) continue;

    const bidPrice = Number(bidPriceRaw);
    if (Number.isNaN(bidPrice) || bidPrice < 0) {
      result.errors.push({ row: i + 1, message: `ราคาที่เสนอไม่ถูกต้อง: "${bidPriceRaw}"` });
      continue;
    }

    const num = (v: unknown): number | null => {
      if (v === undefined || v === '' || v === null) return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    result.rows.push({
      price_list_item_id:     id,
      target_quantity:        num(row[6]),   // col G
      bid_price:              bidPrice,
      bid_moq:                num(row[10]),  // col K
      bid_lead_time:          num(row[11]),  // col L
      reference_quotation_no: row[12] ? String(row[12]) : null,
      notes:                  row[13] ? String(row[13]) : null,
      source_row:             i + 1,
    });
  }

  return result;
}
