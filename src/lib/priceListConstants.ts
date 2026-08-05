// BRCGS-aligned constants for Price List domain
import { SUPPLIER_TYPES, SUPPLIER_TYPE_LABEL } from '@/lib/brcScoring';

// Catalog category now mirrors the BRC supplier_type list, so a catalog's
// category directly identifies which BRCGS assessment criteria apply to
// suppliers quoting on it. `LEGACY_CATEGORIES` are the old 4-value set —
// existing catalogs may still hold one of these; they're kept selectable/
// displayable but no longer offered for new catalogs (re-tag manually).
export const CATEGORIES = SUPPLIER_TYPES;
export type PriceListCategory = (typeof CATEGORIES)[number];

export const LEGACY_CATEGORIES = ['raw_material', 'packaging', 'other'] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  ...SUPPLIER_TYPE_LABEL,
  raw_material: 'วัตถุดิบ (ค่าเดิม)',
  packaging:    'บรรจุภัณฑ์ (ค่าเดิม)',
  other:        'อื่นๆ (ค่าเดิม)',
};

export const CATEGORY_COLORS: Record<string, string> = {
  rm_primary_pk:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  secondary_pk:      'bg-blue-100 text-blue-700 border-blue-200',
  service:           'bg-purple-100 text-purple-700 border-purple-200',
  chemical_food:     'bg-amber-100 text-amber-700 border-amber-200',
  chemical_nonfood:  'bg-orange-100 text-orange-700 border-orange-200',
  equipment_food:    'bg-teal-100 text-teal-700 border-teal-200',
  equipment_nonfood: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  raw_material: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  packaging:    'bg-blue-100 text-blue-700 border-blue-200',
  other:        'bg-muted text-muted-foreground border-muted-foreground/20',
};

// BRCGS Nomination workflow (per Vendor Risk PDF Section 5)
export const NOMINATION_STATUS_LABELS: Record<string, string> = {
  pending_customer:     'รอลูกค้ายืนยัน',
  qa_review:            'QA ตรวจสอบ',
  conditional_approved: 'อนุมัติมีเงื่อนไข',
  approved:             'อนุมัติแล้ว',
  rejected:             'ไม่อนุมัติ',
  blocked:              'ระงับใช้งาน',
};

export const NOMINATION_STATUS_COLORS: Record<string, string> = {
  pending_customer:     'bg-amber-100 text-amber-700 border-amber-200',
  qa_review:            'bg-blue-100 text-blue-700 border-blue-200',
  conditional_approved: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  approved:             'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:             'bg-red-100 text-red-700 border-red-200',
  blocked:              'bg-zinc-700 text-white border-zinc-800',
};

// Forward transitions (UI shows applicable buttons by current status + role)
export const NOMINATION_FORWARD: Record<string, { next: string; label: string; tone?: 'primary' | 'destructive' }[]> = {
  pending_customer: [
    { next: 'qa_review', label: 'ส่ง QA ตรวจสอบ', tone: 'primary' },
  ],
  qa_review: [
    { next: 'approved',             label: 'อนุมัติ',          tone: 'primary' },
    { next: 'conditional_approved', label: 'อนุมัติมีเงื่อนไข', tone: 'primary' },
    { next: 'rejected',             label: 'ไม่อนุมัติ',        tone: 'destructive' },
    { next: 'blocked',              label: 'ระงับใช้งาน',       tone: 'destructive' },
  ],
  conditional_approved: [
    { next: 'approved', label: 'ปลดเงื่อนไข (อนุมัติ)', tone: 'primary' },
    { next: 'blocked',  label: 'ระงับใช้งาน',           tone: 'destructive' },
  ],
  approved: [
    { next: 'blocked', label: 'ระงับใช้งาน', tone: 'destructive' },
  ],
  rejected: [
    { next: 'pending_customer', label: 'ส่งกลับลูกค้า' },
  ],
  blocked: [
    { next: 'qa_review', label: 'เปิดให้ QA ทบทวน' },
  ],
};
