import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Upload, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// Column definitions
// ────────────────────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'supplier_code',          label: 'Supplier Code',            required: false, hint: 'เช่น SUP-001' },
  { key: 'company_name',           label: 'Company Name',             required: true,  hint: 'ชื่อบริษัท (จำเป็น)' },
  { key: 'tax_id',                 label: 'Tax ID',                   required: false, hint: 'เลขประจำตัวผู้เสียภาษี 13 หลัก' },
  { key: 'email',                  label: 'Email',                    required: false, hint: 'อีเมลติดต่อหลัก' },
  { key: 'phone',                  label: 'Phone',                    required: false, hint: 'เบอร์โทร' },
  { key: 'address',                label: 'Address',                  required: false, hint: 'ที่อยู่' },
  { key: 'city',                   label: 'City',                     required: false, hint: 'เมือง' },
  { key: 'country',                label: 'Country',                  required: false, hint: 'รหัสประเทศ เช่น TH, CN, US' },
  { key: 'website',                label: 'Website',                  required: false, hint: 'เว็บไซต์' },
  { key: 'supplier_type',          label: 'Supplier Type',            required: false, hint: 'approved | new | nominated | critical | blocked', allowed: ['approved','new','nominated','critical','blocked'] },
  { key: 'status',                 label: 'Status',                   required: false, hint: 'approved | draft | submitted | review | rejected | suspended', allowed: ['approved','draft','submitted','review','rejected','suspended'] },
  { key: 'risk_level',             label: 'Risk Level',               required: false, hint: 'low | medium | high | critical', allowed: ['low','medium','high','critical'] },
  { key: 'qa_approval_status',     label: 'QA Approval Status',       required: false, hint: 'approved | not_required | pending | rejected', allowed: ['approved','not_required','pending','rejected'] },
  { key: 'certificate_type',       label: 'Certificate Type',         required: false, hint: 'เช่น GMP, ISO22000, HACCP, ISO9001' },
  { key: 'certificate_expiry_date',label: 'Certificate Expiry Date',  required: false, hint: 'รูปแบบ YYYY-MM-DD' },
  { key: 'tier',                   label: 'Tier',                     required: false, hint: 'critical_tier_1 | non_critical_tier_1', allowed: ['critical_tier_1','non_critical_tier_1'] },
  { key: 'notes',                  label: 'Notes',                    required: false, hint: 'หมายเหตุ' },
  { key: 'is_preferred',           label: 'Is Preferred',             required: false, hint: 'TRUE | FALSE', allowed: ['TRUE','FALSE','true','false','1','0'] },
  { key: 'is_blacklisted',         label: 'Is Blacklisted',           required: false, hint: 'TRUE | FALSE', allowed: ['TRUE','FALSE','true','false','1','0'] },
];

const EXAMPLE_ROWS = [
  [
    'SUP-001','บริษัท ตัวอย่าง จำกัด','0105560001111','info@example.co.th','02-123-4567',
    '123 ถนนตัวอย่าง แขวงสีลม','กรุงเทพ','TH','https://example.co.th',
    'approved','approved','low','approved','GMP','2026-12-31',
    'critical_tier_1','ผู้จัดจำหน่ายหลัก','TRUE','FALSE',
  ],
  [
    'SUP-002','บริษัท ABC จำกัด','0105560001112','contact@abc.th','02-987-6543',
    '456 ถนน ABC เขตบางรัก','กรุงเทพ','TH','',
    'new','submitted','medium','pending','ISO22000','2027-06-30',
    'non_critical_tier_1','นำเข้าจากระบบเดิม','FALSE','FALSE',
  ],
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function parseBool(val: any): boolean {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function validateRow(row: Record<string, any>, index: number): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const col of COLUMNS) {
    const val = (row[col.label] ?? row[col.key] ?? '');
    const str = String(val ?? '').trim();
    if (col.required && !str) {
      errors.push(`แถว ${index + 1}: "${col.label}" จำเป็นต้องกรอก`);
    }
    if (col.allowed && str && !col.allowed.map(a => a.toLowerCase()).includes(str.toLowerCase())) {
      errors.push(`แถว ${index + 1}: "${col.label}" = "${str}" ไม่ใช่ค่าที่อนุญาต (${col.allowed.join(', ')})`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function rowToInsert(row: Record<string, any>, userId: string | undefined): any {
  const get = (col: typeof COLUMNS[0]) => {
    const val = row[col.label] ?? row[col.key] ?? null;
    return val === '' ? null : val;
  };
  const obj: any = {};
  for (const col of COLUMNS) {
    const raw = get(col);
    if (raw === null || raw === undefined) {
      obj[col.key] = null;
      continue;
    }
    if (col.key === 'is_preferred' || col.key === 'is_blacklisted') {
      obj[col.key] = parseBool(raw);
    } else {
      obj[col.key] = String(raw).trim() || null;
    }
  }
  // Defaults
  if (!obj.status) obj.status = 'approved';
  if (!obj.supplier_type) obj.supplier_type = 'approved';
  if (!obj.risk_level) obj.risk_level = 'low';
  obj.created_by = userId ?? null;
  return obj;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
type ParsedRow = {
  index: number;
  raw: Record<string, any>;
  valid: boolean;
  errors: string[];
};

type ImportResult = { imported: number; failed: number; errors: string[] };

export default function SupplierImport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── Download template ──────────────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = COLUMNS.map(c => c.label);
    const hints   = COLUMNS.map(c => c.hint);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([hints, headers, ...EXAMPLE_ROWS]);

    // Column widths
    ws['!cols'] = COLUMNS.map(c => ({ wch: Math.max(c.label.length + 4, 20) }));

    // Freeze header rows
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };

    XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');

    // Hints sheet
    const hintRows = COLUMNS.map(c => [c.label, c.required ? 'จำเป็น' : 'ไม่จำเป็น', c.hint, c.allowed?.join(', ') ?? '']);
    const wsHints = XLSX.utils.aoa_to_sheet([['คอลัมน์', 'จำเป็น/ไม่จำเป็น', 'คำอธิบาย', 'ค่าที่อนุญาต'], ...hintRows]);
    wsHints['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 40 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsHints, 'คำอธิบายคอลัมน์');

    XLSX.writeFile(wb, 'supplier_import_template.xlsx');
    toast({ title: '✓ ดาวน์โหลด Template แล้ว', description: 'เปิดไฟล์ supplier_import_template.xlsx เพื่อกรอกข้อมูล' });
  };

  // ── Parse file ────────────────────────────────────────────────────────
  const parseFile = (file: File) => {
    setFileName(file.name);
    setRows([]);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: 'binary', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

      // skip hint row (row 1 in template has hints not header)
      // detect: if first row key matches hint text instead of column label, skip it
      const firstKey = raw[0] ? Object.keys(raw[0])[0] : '';
      const isHintRow = firstKey && !COLUMNS.some(c => c.label === firstKey);
      const dataRows = isHintRow ? raw.slice(1) : raw;

      const parsed: ParsedRow[] = dataRows
        .filter(r => {
          // skip completely empty rows
          return Object.values(r).some(v => String(v ?? '').trim() !== '');
        })
        .map((r, i) => {
          const { valid, errors } = validateRow(r, i);
          return { index: i, raw: r, valid, errors };
        });

      setRows(parsed);
    };
    reader.readAsBinaryString(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  // ── Import ────────────────────────────────────────────────────────────
  const handleImport = async () => {
    const validRows = rows.filter(r => r.valid);
    if (validRows.length === 0) return;

    setImporting(true);
    const errors: string[] = [];
    let imported = 0;

    for (const row of validRows) {
      const payload = rowToInsert(row.raw, user?.id);
      const { error } = await supabase.from('suppliers').insert(payload as any);
      if (error) {
        errors.push(`แถว ${row.index + 1} (${row.raw['Company Name'] || ''}): ${error.message}`);
      } else {
        imported++;
      }
    }

    setResult({ imported, failed: errors.length, errors });
    setImporting(false);

    if (imported > 0) {
      toast({ title: `✓ นำเข้าสำเร็จ ${imported} รายการ` });
    }
  };

  const validCount   = rows.filter(r => r.valid).length;
  const invalidCount = rows.filter(r => !r.valid).length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/suppliers">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">นำเข้าข้อมูลผู้จัดจำหน่าย</h1>
          <p className="text-sm text-muted-foreground">Import Supplier Data — รองรับไฟล์ Excel (.xlsx, .xls)</p>
        </div>
      </div>

      {/* Step 1: Download template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
            ดาวน์โหลด Template
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ดาวน์โหลดไฟล์ Excel Template ที่มีหัวคอลัมน์ครบถ้วนพร้อมข้อมูลตัวอย่าง 2 แถว
            และ Sheet "คำอธิบายคอลัมน์" อธิบายค่าที่อนุญาตในแต่ละคอลัมน์
          </p>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map(c => (
              <Badge key={c.key} variant={c.required ? 'default' : 'secondary'} className="text-xs font-mono">
                {c.label}{c.required ? ' *' : ''}
              </Badge>
            ))}
          </div>
          <Button onClick={downloadTemplate} className="gap-2">
            <Download className="w-4 h-4" /> ดาวน์โหลด Template (.xlsx)
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Upload file */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
            อัปโหลดไฟล์ Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            {fileName ? (
              <p className="font-medium text-foreground">{fileName}</p>
            ) : (
              <p className="text-muted-foreground">ลากไฟล์มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">รองรับ .xlsx, .xls</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
        </CardContent>
      </Card>

      {/* Step 3: Preview */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              ตรวจสอบข้อมูล
              <div className="ml-auto flex gap-2 text-sm font-normal">
                {validCount > 0   && <Badge className="bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />{validCount} ผ่าน</Badge>}
                {invalidCount > 0 && <Badge className="bg-destructive/10 text-destructive"><XCircle className="w-3 h-3 mr-1" />{invalidCount} ข้อผิดพลาด</Badge>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left p-2 font-medium text-muted-foreground">สถานะ</th>
                    {COLUMNS.slice(0, 8).map(c => (
                      <th key={c.key} className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>
                    ))}
                    <th className="text-left p-2 font-medium text-muted-foreground">ข้อผิดพลาด</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.index} className={cn('border-b', row.valid ? 'hover:bg-muted/30' : 'bg-red-50/50 dark:bg-red-950/20')}>
                      <td className="p-2 text-muted-foreground">{row.index + 1}</td>
                      <td className="p-2">
                        {row.valid
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                      </td>
                      {COLUMNS.slice(0, 8).map(c => (
                        <td key={c.key} className="p-2 max-w-[140px] truncate">
                          {String(row.raw[c.label] ?? row.raw[c.key] ?? '')}
                        </td>
                      ))}
                      <td className="p-2 text-destructive text-xs max-w-[240px]">
                        {row.errors.map((e, i) => <div key={i}>{e}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invalidCount > 0 && (
              <div className="p-3 border-t flex items-start gap-2 text-xs text-amber-600 bg-amber-500/5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                แถวที่มีข้อผิดพลาดจะถูกข้ามไป — แก้ไขไฟล์ Excel แล้วอัปโหลดใหม่ หรือนำเข้าเฉพาะแถวที่ผ่าน ({validCount} แถว)
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Import */}
      {rows.length > 0 && !result && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleImport}
            disabled={importing || validCount === 0}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'กำลังนำเข้า...' : `นำเข้า ${validCount} รายการ`}
          </Button>
          {validCount === 0 && (
            <p className="text-sm text-muted-foreground">ไม่มีแถวที่ผ่านการตรวจสอบ — กรุณาแก้ไขข้อผิดพลาดก่อน</p>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <Card className={cn(result.imported > 0 ? 'border-emerald-500/30' : 'border-destructive/30')}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              {result.imported > 0 && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              <div>
                <p className="font-semibold">
                  นำเข้าสำเร็จ {result.imported} รายการ
                  {result.failed > 0 && ` · ล้มเหลว ${result.failed} รายการ`}
                </p>
                {result.imported > 0 && (
                  <Link to="/suppliers" className="text-sm text-primary hover:underline">
                    ดูรายการผู้จัดจำหน่ายทั้งหมด →
                  </Link>
                )}
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => { setRows([]); setFileName(''); setResult(null); if (fileRef.current) fileRef.current.value = ''; }}>
              นำเข้าไฟล์ใหม่
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="bg-blue-500/5 border-blue-500/20">
        <CardContent className="p-4 flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">หมายเหตุการนำเข้า</p>
            <ul className="text-xs space-y-0.5 text-blue-600/80 dark:text-blue-400/80">
              <li>• คอลัมน์ที่ไม่ได้กรอก (ว่างเปล่า) จะใช้ค่า Default: status=approved, supplier_type=approved, risk_level=low</li>
              <li>• ระบบจะไม่ตรวจสอบ Duplicate — หากมี company_name ซ้ำจะสร้างรายการใหม่</li>
              <li>• ข้อมูลที่นำเข้าจะมีสถานะ tenant_id ของ Tenant ปัจจุบัน</li>
              <li>• แถวแรกใน Template เป็นคำอธิบาย (hint) ระบบจะตรวจจับและข้ามอัตโนมัติ</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
