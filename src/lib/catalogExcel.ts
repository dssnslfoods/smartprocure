// Shared Excel import/export logic for the Master Catalog (price_lists + price_list_items).
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORY_LABELS, CATEGORIES, LEGACY_CATEGORIES } from '@/lib/priceListConstants';

// Accepted for validation/import — current BRC categories plus the old
// 4-value set so previously exported catalogs still re-import cleanly.
const ALL_CATEGORY_KEYS: readonly string[] = [...CATEGORIES, ...LEGACY_CATEGORIES];

export type ColType = 'text' | 'number' | 'int' | 'bool';

export interface CatalogColumn {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  type?: ColType;
  allowed?: string[];
}

// One Excel row = one catalog item. category + (optional) catalog_title decide which book it lands in.
export const CATALOG_COLUMNS: CatalogColumn[] = [
  { key: 'category',         label: 'Category',          required: true,  hint: 'rm_primary_pk | secondary_pk | service | chemical_food | chemical_nonfood | equipment_food | equipment_nonfood (หมวด BRC — ค่าเดิม raw_material/packaging/other ก็ยังใช้ได้)', allowed: [...CATEGORIES] },
  { key: 'catalog_title',    label: 'Catalog Title',     required: false, hint: 'ชื่อเล่ม (เว้นว่าง = ใช้ชื่อหมวดอัตโนมัติ)' },
  { key: 'item_code',        label: 'Item Code',         required: false, hint: 'รหัสสินค้า เช่น RM-001' },
  { key: 'item_name',        label: 'Item Name',         required: true,  hint: 'ชื่อรายการ (จำเป็น)' },
  { key: 'group_name',       label: 'Group',             required: false, hint: 'กลุ่มย่อย เช่น น้ำตาล, แป้ง' },
  { key: 'description',      label: 'Description',       required: false, hint: 'รายละเอียด / สเปค' },
  { key: 'unit',             label: 'Unit',              required: false, hint: 'หน่วย เช่น kg, ชิ้น, ลิตร' },
  { key: 'reference_price',  label: 'Reference Price',   required: false, hint: 'ราคาอ้างอิง (ตัวเลข)', type: 'number' },
  { key: 'moq',              label: 'MOQ',               required: false, hint: 'ปริมาณสั่งซื้อขั้นต่ำ (จำนวนเต็ม)', type: 'int' },
  { key: 'lead_time_days',   label: 'Lead Time (Days)',  required: false, hint: 'ระยะเวลาส่งมอบ (วัน)', type: 'int' },
  { key: 'target_quantity',  label: 'Target Quantity',   required: false, hint: 'ปริมาณเป้าหมาย (ตัวเลข)', type: 'number' },
  { key: 'is_nominated',     label: 'Is Nominated',      required: false, hint: 'TRUE | FALSE', type: 'bool', allowed: ['TRUE', 'FALSE', 'true', 'false', '1', '0'] },
  { key: 'nominated_customer', label: 'Nominated Customer', required: false, hint: 'ลูกค้าที่ Nominate (ถ้ามี)' },
];

const EXAMPLE_ROWS: (string | number)[][] = [
  ['rm_primary_pk', 'วัตถุดิบ', 'RM-001', 'น้ำตาลทรายขาว', 'น้ำตาล', 'น้ำตาลทรายขาวบริสุทธิ์ เกรดอาหาร', 'kg', 25, 500, 7, 1000, 'FALSE', ''],
  ['secondary_pk', 'บรรจุภัณฑ์รอง', 'PK-001', 'กล่องกระดาษลูกฟูก', 'กล่อง', 'กล่องกระดาษลูกฟูก 5 ชั้น', 'ใบ', 18.5, 1000, 7, 50000, 'FALSE', ''],
];

// ── value normalisers ────────────────────────────────────────────────────────
export function parseBool(val: any): boolean {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function parseNumber(val: any): number | null {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const n = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

// Accept English enum keys or Thai labels for category (BRC categories, plus
// the old 4-value set so previously exported catalogs still re-import).
const THAI_CATEGORY: Record<string, string> = {
  'วัตถุดิบ': 'rm_primary_pk',
  'บรรจุภัณฑ์หลัก': 'rm_primary_pk',
  'บรรจุภัณฑ์รอง': 'secondary_pk',
  'บริการ': 'service',
  'เคมี food grade': 'chemical_food',
  'เคมี non-food grade': 'chemical_nonfood',
  'อุปกรณ์สัมผัสอาหาร': 'equipment_food',
  'อุปกรณ์ทั่วไป': 'equipment_nonfood',
  // legacy 4-value set
  'บรรจุภัณฑ์': 'packaging',
  'อื่นๆ': 'other',
  'อื่น ๆ': 'other',
};
export function normalizeCategory(val: any): string | null {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (ALL_CATEGORY_KEYS.includes(lower)) return lower;
  if (THAI_CATEGORY[s] || THAI_CATEGORY[lower]) return THAI_CATEGORY[s] ?? THAI_CATEGORY[lower];
  return null;
}

// Case-insensitive lookup — matches column label OR key regardless of order.
export function findValue(row: Record<string, any>, col: CatalogColumn): any {
  const labelLower = col.label.toLowerCase();
  const keyLower = col.key.toLowerCase();
  for (const k of Object.keys(row)) {
    const kl = k.trim().toLowerCase();
    if (kl === labelLower || kl === keyLower) return row[k];
  }
  return null;
}

export function validateRow(row: Record<string, any>, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const col of CATALOG_COLUMNS) {
    const raw = findValue(row, col);
    const str = String(raw ?? '').trim();
    if (col.required && !str) {
      errors.push(`แถว ${index + 1}: "${col.label}" จำเป็นต้องกรอก`);
      continue;
    }
    if (!str) continue;
    if (col.key === 'category' && !normalizeCategory(str)) {
      errors.push(`แถว ${index + 1}: "Category" = "${str}" ไม่ถูกต้อง (ใช้ ${(CATEGORIES as readonly string[]).join(', ')} หรือค่าเดิม ${LEGACY_CATEGORIES.join(', ')})`);
    }
    if (col.type === 'number' || col.type === 'int') {
      if (parseNumber(str) === null) {
        errors.push(`แถว ${index + 1}: "${col.label}" = "${str}" ต้องเป็นตัวเลข`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export interface ParsedItem {
  category: string;
  catalog_title: string;
  item_code: string | null;
  item_name: string;
  group_name: string | null;
  description: string | null;
  unit: string | null;
  reference_price: number | null;
  moq: number | null;
  lead_time_days: number | null;
  target_quantity: number | null;
  is_nominated: boolean;
  nominated_customer: string | null;
}

export function rowToItem(row: Record<string, any>): ParsedItem {
  const get = (key: string) => {
    const col = CATALOG_COLUMNS.find((c) => c.key === key)!;
    const raw = findValue(row, col);
    return raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw).trim();
  };
  const category = normalizeCategory(get('category')) ?? 'other';
  const title = get('catalog_title') || CATEGORY_LABELS[category] || 'Catalog';
  return {
    category,
    catalog_title: title,
    item_code: get('item_code'),
    item_name: get('item_name') ?? '',
    group_name: get('group_name'),
    description: get('description'),
    unit: get('unit'),
    reference_price: parseNumber(get('reference_price')),
    moq: parseNumber(get('moq')),
    lead_time_days: parseNumber(get('lead_time_days')),
    target_quantity: parseNumber(get('target_quantity')),
    is_nominated: parseBool(findValue(row, CATALOG_COLUMNS.find((c) => c.key === 'is_nominated')!)),
    nominated_customer: get('nominated_customer'),
  };
}

// ── Template ─────────────────────────────────────────────────────────────────
export function downloadCatalogTemplate() {
  const headers = CATALOG_COLUMNS.map((c) => c.label);
  const hints = CATALOG_COLUMNS.map((c) => c.hint);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([hints, headers, ...EXAMPLE_ROWS]);
  ws['!cols'] = CATALOG_COLUMNS.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 2 };
  XLSX.utils.book_append_sheet(wb, ws, 'Catalog');

  const hintRows = CATALOG_COLUMNS.map((c) => [
    c.label,
    c.required ? 'จำเป็น' : 'ไม่จำเป็น',
    c.hint,
    c.allowed?.join(', ') ?? (c.type === 'number' || c.type === 'int' ? 'ตัวเลข' : ''),
  ]);
  const wsHints = XLSX.utils.aoa_to_sheet([['คอลัมน์', 'จำเป็น/ไม่จำเป็น', 'คำอธิบาย', 'ค่าที่อนุญาต'], ...hintRows]);
  wsHints['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 52 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsHints, 'คำอธิบายคอลัมน์');

  XLSX.writeFile(wb, 'catalog_import_template.xlsx');
}

// ── Export current catalog ───────────────────────────────────────────────────
export async function exportCatalog(): Promise<number> {
  const { data: lists } = await supabase
    .from('price_lists')
    .select('id, title, category, price_list_items(item_code, item_name, group_name, description, unit, reference_price, moq, lead_time_days, target_quantity, is_nominated, nominated_customer, sort_order)')
    .order('category');

  const rows: (string | number)[][] = [];
  (lists || []).forEach((l: any) => {
    const items = [...(l.price_list_items || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    items.forEach((it: any) => {
      rows.push([
        l.category,
        l.title,
        it.item_code ?? '',
        it.item_name ?? '',
        it.group_name ?? '',
        it.description ?? '',
        it.unit ?? '',
        it.reference_price ?? '',
        it.moq ?? '',
        it.lead_time_days ?? '',
        it.target_quantity ?? '',
        it.is_nominated ? 'TRUE' : 'FALSE',
        it.nominated_customer ?? '',
      ]);
    });
  });

  const headers = CATALOG_COLUMNS.map((c) => c.label);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = CATALOG_COLUMNS.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Catalog');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `catalog_export_${stamp}.xlsx`);
  return rows.length;
}

// ── Find-or-create catalog books, then bulk insert items ─────────────────────
export interface CatalogImportResult {
  imported: number;
  failed: number;
  catalogsTouched: number;
  errors: string[];
}

export async function importCatalogItems(
  items: ParsedItem[],
  tenantId: string,
  userId: string | undefined,
): Promise<CatalogImportResult> {
  const errors: string[] = [];

  // 1) Resolve catalog books (find existing by tenant+category+title, else create).
  const { data: existing } = await supabase
    .from('price_lists')
    .select('id, title, category, price_list_items(id)')
    .eq('tenant_id', tenantId);

  const bookKey = (category: string, title: string) => `${category}|||${title}`;
  const bookId = new Map<string, string>();
  const bookCount = new Map<string, number>(); // current item count -> next sort_order base
  (existing || []).forEach((b: any) => {
    const key = bookKey(b.category, b.title);
    bookId.set(key, b.id);
    bookCount.set(b.id, (b.price_list_items?.length ?? 0));
  });

  const neededKeys = [...new Set(items.map((it) => bookKey(it.category, it.catalog_title)))];
  for (const key of neededKeys) {
    if (bookId.has(key)) continue;
    const [category, title] = key.split('|||');
    const { data, error } = await supabase
      .from('price_lists')
      .insert({ title, category, status: 'active', tenant_id: tenantId, created_by: userId ?? null } as any)
      .select('id')
      .single();
    if (error || !data) {
      errors.push(`สร้างเล่ม "${title}" (${category}) ไม่สำเร็จ: ${error?.message ?? 'unknown'}`);
      continue;
    }
    bookId.set(key, data.id);
    bookCount.set(data.id, 0);
  }

  // 2) Insert items.
  let imported = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const id = bookId.get(bookKey(it.category, it.catalog_title));
    if (!id) {
      errors.push(`แถว ${i + 1} (${it.item_name}): ไม่พบเล่ม catalog`);
      continue;
    }
    const base = bookCount.get(id) ?? 0;
    const payload = {
      price_list_id: id,
      tenant_id: tenantId,
      item_code: it.item_code,
      item_name: it.item_name,
      group_name: it.group_name,
      description: it.description,
      unit: it.unit,
      reference_price: it.reference_price,
      moq: it.moq,
      lead_time_days: it.lead_time_days,
      target_quantity: it.target_quantity,
      is_nominated: it.is_nominated,
      nominated_customer: it.nominated_customer,
      sort_order: base,
    };
    const { error } = await supabase.from('price_list_items').insert(payload as any);
    if (error) {
      errors.push(`แถว ${i + 1} (${it.item_name}): ${error.message}`);
    } else {
      imported++;
      bookCount.set(id, base + 1);
    }
  }

  return { imported, failed: errors.length, catalogsTouched: neededKeys.length, errors };
}
