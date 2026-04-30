// BRCGS-aligned constants for Price List domain

export const CATEGORY_LABELS: Record<string, string> = {
  raw_material: 'วัตถุดิบ',
  packaging:    'บรรจุภัณฑ์',
  service:      'บริการ',
  other:        'อื่นๆ',
};

export const CATEGORY_COLORS: Record<string, string> = {
  raw_material: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  packaging:    'bg-blue-100 text-blue-700 border-blue-200',
  service:      'bg-purple-100 text-purple-700 border-purple-200',
  other:        'bg-muted text-muted-foreground border-muted-foreground/20',
};

export const CATEGORIES = ['raw_material', 'packaging', 'service', 'other'] as const;
export type PriceListCategory = (typeof CATEGORIES)[number];

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
