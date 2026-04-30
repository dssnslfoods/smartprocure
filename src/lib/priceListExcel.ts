// Excel export/import for Price List checklist <-> supplier quotation flow.
// Uses SheetJS (xlsx). Item ID is embedded in a hidden column so re-import is robust to renamed rows.
import * as XLSX from 'xlsx';

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
  supplierName?: string;       // when sent to a specific supplier
  supplierId?:   string;
  rfqNumber?:    string;       // optional RFQ reference
  validUntil?:   string;       // ISO date
  notes?:        string;
}

const HEADER = [
  'ID',                // 0 — hidden, used on import
  'รหัสสินค้า',          // 1
  'ชื่อสินค้า',          // 2
  'รายละเอียด',          // 3
  'หน่วย',              // 4
  'ปริมาณที่ขอราคา',     // 5  ← procurement-specified quantity
  '— กรอกข้อมูลด้านล่าง —', // 6
  'ราคาต่อหน่วย (THB)',  // 7  ← supplier fills
  'MOQ ที่เสนอ',         // 8
  'Lead Time ที่เสนอ (วัน)', // 9
  'เลขที่ใบเสนอราคาอ้างอิง', // 10
  'หมายเหตุ',           // 11
];

export function exportChecklistToExcel(items: CatalogItemRow[], meta: ChecklistMeta): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: meta
  const metaRows: (string | number)[][] = [
    ['NSL Foods PLC — Price List Quotation Checklist'],
    [],
    ['Catalog',       meta.catalogTitle],
    ['Catalog ID',    meta.catalogId],
    ['หมวดหมู่',       meta.category],
    ['Supplier',      meta.supplierName || '— เปิดให้ทุกราย —'],
    ['Supplier ID',   meta.supplierId   || ''],
    ['RFQ No.',       meta.rfqNumber    || ''],
    ['ใช้ได้ถึง',     meta.validUntil   || ''],
    ['หมายเหตุ',      meta.notes        || ''],
    ['Generated',     new Date().toISOString()],
    [],
    ['คำแนะนำ:'],
    ['1) คอลัมน์ "ID" จำเป็นสำหรับการ import กลับเข้าระบบ ห้ามแก้ไข'],
    ['2) กรอกราคาในคอลัมน์ "ราคาที่เสนอ" — ปล่อยว่างหากไม่ต้องการเสนอราคารายการนั้น'],
    ['3) สำหรับรายการ Nominated เฉพาะ supplier ที่ระบุเท่านั้นที่สามารถเสนอราคาได้'],
  ];
  const metaWs = XLSX.utils.aoa_to_sheet(metaRows);
  metaWs['!cols'] = [{ wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, metaWs, 'Info');

  // Sheet 2: checklist
  const dataRows = items.map(it => [
    it.id,
    it.item_code  || '',
    it.item_name,
    it.description || '',
    it.unit || '',
    it.target_quantity ?? '',
    '',                  // separator column
    '',                  // bid unit price
    '',                  // bid moq
    '',                  // bid lead time
    '',                  // ref quotation no
    '',                  // notes
  ]);

  const ws = XLSX.utils.aoa_to_sheet([HEADER, ...dataRows]);
  ws['!cols'] = [
    { hidden: true, wch: 36 }, // ID hidden
    { wch: 14 },                // code
    { wch: 32 },                // name
    { wch: 36 },                // desc
    { wch: 8 },                 // unit
    { wch: 14 },                // target quantity
    { wch: 4 },                 // separator
    { wch: 18 },                // bid price
    { wch: 12 },                // bid moq
    { wch: 16 },                // bid lead time
    { wch: 22 },                // ref quotation
    { wch: 30 },                // notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Checklist');

  const fname = `Checklist_${meta.category}_${(meta.supplierName || 'open').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fname);
}

export interface ImportedQuoteRow {
  price_list_item_id: string;
  bid_price:          number | null;   // unit price
  target_quantity:    number | null;   // procurement-asked quantity (for reference, not editable)
  bid_moq:            number | null;
  bid_lead_time:      number | null;
  reference_quotation_no: string | null;
  notes:              string | null;
  source_row:         number;
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

  // Pull catalog ID / RFQ number from Info sheet
  const info = wb.Sheets['Info'];
  if (info) {
    const grid = XLSX.utils.sheet_to_json<string[]>(info, { header: 1, blankrows: false }) as unknown[][];
    grid.forEach(r => {
      const k = String(r?.[0] || '').trim();
      const v = String(r?.[1] || '').trim();
      if (k === 'Catalog ID') result.meta.catalogId = v;
      if (k === 'RFQ No.')    result.meta.rfqNumber = v;
    });
  }

  const ws = wb.Sheets['Checklist'];
  if (!ws) {
    result.errors.push({ row: 0, message: 'ไม่พบ sheet ชื่อ "Checklist" ในไฟล์' });
    return result;
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) as unknown[][];
  // Skip header row
  for (let i = 1; i < grid.length; i++) {
    const row = grid[i];
    const id  = String(row[0] || '').trim();
    if (!id) continue;

    const bidPriceRaw = row[7];
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
      price_list_item_id: id,
      target_quantity:   num(row[5]),
      bid_price:         bidPrice,
      bid_moq:           num(row[8]),
      bid_lead_time:     num(row[9]),
      reference_quotation_no: row[10] ? String(row[10]) : null,
      notes:             row[11] ? String(row[11]) : null,
      source_row:        i + 1,
    });
  }

  return result;
}
