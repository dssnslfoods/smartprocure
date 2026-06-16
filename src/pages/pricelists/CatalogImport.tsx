import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, Upload, CheckCircle2, XCircle, AlertTriangle, FileSpreadsheet, Info, FileDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  CATALOG_COLUMNS, downloadCatalogTemplate, exportCatalog, importCatalogItems,
  validateRow, rowToItem,
} from '@/lib/catalogExcel';

type ParsedRow = { index: number; raw: Record<string, any>; valid: boolean; errors: string[] };
type ImportResult = { imported: number; failed: number; catalogsTouched: number; errors: string[] };

export default function CatalogImport() {
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleTemplate = () => {
    downloadCatalogTemplate();
    toast({ title: '✓ ดาวน์โหลด Template แล้ว', description: 'เปิดไฟล์ catalog_import_template.xlsx เพื่อกรอกข้อมูล' });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const count = await exportCatalog();
      toast({ title: '✓ Export สำเร็จ', description: `ส่งออก ${count} รายการเป็นไฟล์ Excel` });
    } catch (err: any) {
      toast({ title: 'Export ไม่สำเร็จ', description: err.message, variant: 'destructive' });
    }
    setExporting(false);
  };

  const parseFile = (file: File) => {
    setFileName(file.name);
    setRows([]);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

      const knownNames = new Set([
        ...CATALOG_COLUMNS.map((c) => c.label.toLowerCase()),
        ...CATALOG_COLUMNS.map((c) => c.key.toLowerCase()),
      ]);

      let headerRowIdx = 0;
      let bestMatches = 0;
      for (let i = 0; i < Math.min(5, allRows.length); i++) {
        const matches = allRows[i].filter((cell: any) => knownNames.has(String(cell ?? '').trim().toLowerCase())).length;
        if (matches > bestMatches) { bestMatches = matches; headerRowIdx = i; }
      }
      if (bestMatches === 0) {
        toast({ title: 'ไม่พบหัวคอลัมน์', description: 'ไฟล์ต้องมีแถวหัวคอลัมน์ที่ตรงกับ Template', variant: 'destructive' });
        return;
      }

      const headerRow: string[] = allRows[headerRowIdx].map((h: any) => String(h ?? '').trim());
      const parsed: ParsedRow[] = allRows
        .slice(headerRowIdx + 1)
        .filter((row) => row.some((cell: any) => String(cell ?? '').trim() !== ''))
        .map((row: any[], i) => {
          const obj: Record<string, any> = {};
          headerRow.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? ''; });
          const { valid, errors } = validateRow(obj, i);
          return { index: i, raw: obj, valid, errors };
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

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) return;
    if (!tenantId) {
      toast({ title: 'ไม่พบ Tenant', description: 'กรุณาเลือกบริษัทก่อนนำเข้าข้อมูล', variant: 'destructive' });
      return;
    }
    setImporting(true);
    const items = validRows.map((r) => rowToItem(r.raw));
    const res = await importCatalogItems(items, tenantId, user?.id);
    setResult(res);
    setImporting(false);
    if (res.imported > 0) {
      toast({ title: `✓ นำเข้าสำเร็จ ${res.imported} รายการ`, description: `ใน ${res.catalogsTouched} เล่ม catalog` });
    }
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;
  const previewCols = CATALOG_COLUMNS.slice(0, 7);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/price-lists">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">นำเข้า / ส่งออก Catalog</h1>
          <p className="text-sm text-muted-foreground">Import / Export Master Catalog — รองรับไฟล์ Excel (.xlsx, .xls)</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2 shrink-0">
          <FileDown className="w-4 h-4" />
          {exporting ? 'กำลังส่งออก...' : 'Export ข้อมูลปัจจุบัน'}
        </Button>
      </div>

      {/* Step 1: Template */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
            ดาวน์โหลด Template
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ดาวน์โหลดไฟล์ Excel Template ที่มีหัวคอลัมน์ครบถ้วนพร้อมข้อมูลตัวอย่าง 2 แถว และ Sheet "คำอธิบายคอลัมน์"
          </p>
          <p className="text-xs text-emerald-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            ระบบตรวจจับหัวคอลัมน์อัตโนมัติ — <strong>เรียงคอลัมน์สลับกันได้</strong> ใส่เฉพาะคอลัมน์ที่ต้องการก็ได้
          </p>
          <div className="flex flex-wrap gap-2">
            {CATALOG_COLUMNS.map((c) => (
              <Badge key={c.key} variant={c.required ? 'default' : 'secondary'} className="text-xs font-mono">
                {c.label}{c.required ? ' *' : ''}
              </Badge>
            ))}
          </div>
          <Button onClick={handleTemplate} className="gap-2">
            <Download className="w-4 h-4" /> ดาวน์โหลด Template (.xlsx)
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Upload */}
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
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30',
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
                {validCount > 0 && <Badge className="bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />{validCount} ผ่าน</Badge>}
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
                    {previewCols.map((c) => (
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
                        {row.valid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                      </td>
                      {previewCols.map((c) => (
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
          <Button onClick={handleImport} disabled={importing || validCount === 0} className="gap-2">
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
                  นำเข้าสำเร็จ {result.imported} รายการ ใน {result.catalogsTouched} เล่ม
                  {result.failed > 0 && ` · ล้มเหลว ${result.failed} รายการ`}
                </p>
                {result.imported > 0 && (
                  <Link to="/price-lists" className="text-sm text-primary hover:underline">
                    กลับไปที่ Master Catalog →
                  </Link>
                )}
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
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
              <li>• แต่ละแถว = 1 รายการสินค้า ระบบจะจัดเข้าเล่ม catalog ตาม <strong>Category</strong> และ <strong>Catalog Title</strong></li>
              <li>• ถ้าเล่ม catalog (หมวด + ชื่อ) ยังไม่มี ระบบจะสร้างให้อัตโนมัติ ถ้ามีอยู่แล้วจะเพิ่มรายการต่อท้าย</li>
              <li>• เว้นว่าง Catalog Title ได้ → ระบบใช้ชื่อหมวดเป็นชื่อเล่ม (วัตถุดิบ / บรรจุภัณฑ์ / บริการ / อื่นๆ)</li>
              <li>• <strong>เรียงคอลัมน์สลับกันได้</strong> — ระบบจับคู่ด้วยชื่อหัวคอลัมน์ ไม่ใช่ตำแหน่ง</li>
              <li>• ระบบไม่ตรวจสอบ Duplicate — รายการชื่อซ้ำจะถูกเพิ่มใหม่</li>
              <li>• ปุ่ม "Export ข้อมูลปัจจุบัน" ด้านบนใช้ดึงข้อมูลที่มีอยู่เป็น Excel เพื่อแก้ไขแล้วนำเข้ากลับได้</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
