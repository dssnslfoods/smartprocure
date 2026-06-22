import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Sparkles, Loader2, FileText, CheckCircle, AlertTriangle, X, Eye, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const CERT_DOC_LABELS = new Set(['company_cert', 'quality_cert']);

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface AIExtractResult {
  company_name: string | null;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contact_person: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

interface ScannedDoc {
  file: File;
  name: string;
  type: string;
  docLabel: string;
  fieldsFound: string[];
}

const DOC_TYPE_OPTIONS = [
  { value: 'quotation', label: 'ใบเสนอราคา' },
  { value: 'invoice', label: 'ใบแจ้งหนี้ / Invoice' },
  { value: 'pp20', label: 'ภพ.20' },
  { value: 'company_cert', label: 'ใบรับรองบริษัท (→ ใบรับรอง)' },
  { value: 'quality_cert', label: 'ใบรับรองคุณภาพ GMP/HACCP/ISO (→ ใบรับรอง)' },
  { value: 'business_license', label: 'ใบอนุญาตประกอบกิจการ' },
  { value: 'other', label: 'เอกสารอื่น ๆ' },
];

const REQUIRED_FIELDS: { key: keyof typeof EMPTY_FORM; label: string }[] = [
  { key: 'company_name', label: 'ชื่อบริษัท' },
  { key: 'tax_id', label: 'เลขประจำตัวผู้เสียภาษี' },
];

const EMPTY_FORM = {
  company_name: '',
  tax_id: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  contact_person: '',
  tier: '',
  notes: '',
};

const FORM_KEYS = ['company_name', 'tax_id', 'address', 'city', 'country', 'phone', 'email', 'website', 'contact_person'] as const;

function safeStorageName(fileName: string): string {
  const ext = fileName.split('.').pop() || 'bin';
  return `${crypto.randomUUID()}.${ext}`;
}

function guessDocLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (/ภพ|pp\.?20|vat/i.test(fileName)) return 'pp20';
  if (/gmp|haccp|iso|brc|sqf|fssc|halal|kosher|fda|อย\./i.test(fileName)) return 'quality_cert';
  if (/ใบรับรอง|certificate|cert|หนังสือรับรอง/i.test(fileName)) return 'company_cert';
  if (/quot|เสนอราคา|qo|qt/i.test(lower)) return 'quotation';
  if (/inv|แจ้งหนี้|invoice/i.test(lower)) return 'invoice';
  return 'other';
}

export default function SupplierForm() {
  const navigate = useNavigate();
  const { user, tenantId } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedDocs, setScannedDocs] = useState<ScannedDoc[]>([]);
  const scannedDocsRef = useRef<ScannedDoc[]>([]);
  const formRef = useRef(form);
  const [aiScanned, setAiScanned] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Keep ref in sync so async handlers always see latest docs
  useEffect(() => { scannedDocsRef.current = scannedDocs; }, [scannedDocs]);
  useEffect(() => { formRef.current = form; }, [form]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const missingFields = REQUIRED_FIELDS.filter((f) => !form[f.key]?.trim());
  const canSave = missingFields.length === 0;

  const handleScanFile = useCallback(async (file: File) => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'ไฟล์ไม่รองรับ', description: 'กรุณาอัปโหลดไฟล์ PDF หรือรูปภาพ (PNG, JPG)', variant: 'destructive' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'ไฟล์ใหญ่เกินไป', description: 'ขนาดไฟล์สูงสุด 20 MB', variant: 'destructive' });
      return;
    }

    setScanning(true);

    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-supplier', {
        body: { file_base64: base64, mime_type: file.type },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result = data as AIExtractResult;

      const fieldsFound: string[] = [];
      setForm((prev) => {
        const updated = { ...prev };
        for (const key of FORM_KEYS) {
          const newVal = result[key];
          if (newVal && !prev[key]?.trim()) {
            (updated as any)[key] = newVal;
            fieldsFound.push(key);
          }
        }
        return updated;
      });

      const docLabel = guessDocLabel(file.name);
      setScannedDocs((prev) => [...prev, { file, name: file.name, type: file.type, docLabel, fieldsFound }]);
      setAiScanned(true);

      if (fieldsFound.length === 0) {
        toast({ title: 'ไม่พบข้อมูลใหม่', description: 'เอกสารนี้ไม่มีข้อมูลที่ยังขาดอยู่ แต่จะถูกเก็บเป็นเอกสารแนบ' });
      } else if (!result.tax_id && !form.tax_id) {
        toast({
          title: 'ไม่พบเลขประจำตัวผู้เสียภาษี',
          description: 'กรุณาอัปโหลดเอกสารเพิ่มเติม เช่น ภพ.20 หรือ ใบรับรองบริษัท',
          variant: 'destructive',
          duration: 10000,
        });
      } else {
        toast({
          title: 'สแกนเอกสารสำเร็จ',
          description: `พบข้อมูลใหม่ ${fieldsFound.length} รายการ — ความมั่นใจ: ${result.confidence === 'high' ? 'สูง' : result.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'}`,
        });
      }
    } catch (err: any) {
      toast({ title: 'สแกนไม่สำเร็จ', description: err.message || 'ไม่สามารถอ่านข้อมูลจากเอกสารได้', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }, [toast, form.tax_id]);

  const handleRemoveDoc = (index: number) => {
    setScannedDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDocLabelChange = (index: number, value: string) => {
    setScannedDocs((prev) => prev.map((d, i) => i === index ? { ...d, docLabel: value } : d));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleScanFile(file);
  }, [handleScanFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleScanFile(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      toast({
        title: 'ข้อมูลไม่ครบ',
        description: `กรุณากรอก: ${missingFields.map((f) => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    const docsSnapshot = scannedDocs.map(d => ({ ...d }));
    const formSnapshot = { ...form };

    setShowConfirm(false);
    setLoading(true);
    const { company_name, tax_id, address, city, country, phone, email, website, contact_person, tier, notes } = formSnapshot;

    const { data: inserted, error } = await supabase.from('suppliers').insert({
      company_name, tax_id, address, city, country, phone, email, website, contact_person,
      tier: tier || null, notes: notes || null,
      tenant_id: tenantId,
      status: 'draft' as any,
      created_by: user?.id,
    } as any).select('id').single();

    if (error || !inserted) {
      setLoading(false);
      toast({ title: 'บันทึกไม่สำเร็จ', description: error?.message || 'Unknown error', variant: 'destructive' });
      return;
    }

    const supplierId = inserted.id;

    if (docsSnapshot.length > 0) {
      toast({ title: `กำลังอัปโหลด ${docsSnapshot.length} เอกสาร...` });
      let certCount = 0;
      let docCount = 0;
      for (const doc of docsSnapshot) {
        const isCert = CERT_DOC_LABELS.has(doc.docLabel);
        const safeName = safeStorageName(doc.name);
        try {
          if (isCert) {
            const certPath = `${supplierId}/${safeName}`;
            const { error: uploadErr } = await supabase.storage.from('supplier-certificates').upload(certPath, doc.file);
            if (uploadErr) { toast({ title: `อัปโหลดไฟล์ ${doc.name} ไม่สำเร็จ`, description: uploadErr.message, variant: 'destructive' }); continue; }

            const { data: urlData } = supabase.storage.from('supplier-certificates').getPublicUrl(certPath);

            let certData: any = {};
            try {
              const b64 = await fileToBase64(doc.file);
              const { data: aiData } = await supabase.functions.invoke('extract-certificate', {
                body: { file_base64: b64, mime_type: doc.file.type },
              });
              if (aiData && !aiData.error) certData = aiData;
            } catch { /* fallback: save without AI fields */ }

            const { error: certInsertErr } = await supabase.from('supplier_certificates').insert({
              supplier_id: supplierId,
              certificate_type: certData.certificate_type || (doc.docLabel === 'company_cert' ? 'ใบรับรองบริษัท' : 'อื่นๆ'),
              certificate_no: certData.certificate_no || null,
              issued_by: certData.issued_by || null,
              issued_date: certData.issued_date || null,
              expiry_date: certData.expiry_date || null,
              file_url: urlData.publicUrl,
              file_name: doc.name,
              file_size: doc.file.size,
              is_primary: certCount === 0,
              notes: certData.notes || null,
            } as any);
            if (certInsertErr) { toast({ title: 'บันทึกใบรับรองไม่สำเร็จ', description: certInsertErr.message, variant: 'destructive' }); continue; }
            certCount++;
          } else {
            const filePath = `suppliers/${supplierId}/${safeName}`;
            const { error: uploadErr } = await supabase.storage.from('supplier-documents').upload(filePath, doc.file);
            if (uploadErr) { toast({ title: `อัปโหลดไฟล์ ${doc.name} ไม่สำเร็จ`, description: uploadErr.message, variant: 'destructive' }); continue; }

            const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(filePath);
            const label = DOC_TYPE_OPTIONS.find((o) => o.value === doc.docLabel)?.label?.replace(/ \(→.*\)/, '') || doc.name;

            const { error: docInsertErr } = await supabase.from('supplier_documents').insert({
              supplier_id: supplierId,
              document_name: label,
              document_type: doc.docLabel,
              file_url: urlData.publicUrl,
              file_size: doc.file.size,
              uploaded_by: user?.id,
            });
            if (docInsertErr) { toast({ title: 'บันทึกเอกสารไม่สำเร็จ', description: docInsertErr.message, variant: 'destructive' }); continue; }
            docCount++;
          }
        } catch (e: any) {
          toast({ title: `เกิดข้อผิดพลาด: ${doc.name}`, description: e?.message || String(e), variant: 'destructive' });
        }
      }
      const parts = [];
      if (certCount > 0) parts.push(`ใบรับรอง ${certCount} ฉบับ`);
      if (docCount > 0) parts.push(`เอกสาร ${docCount} ไฟล์`);
      if (parts.length > 0) toast({ title: `จัดเก็บ ${parts.join(' + ')} สำเร็จ` });
    }

    setLoading(false);
    toast({ title: 'บันทึกสำเร็จ', description: `เพิ่ม ${company_name} เรียบร้อย` });
    navigate('/suppliers');
  };

  const handleClearAll = () => {
    setScannedDocs([]);
    setAiScanned(false);
    setForm({ ...EMPTY_FORM });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link to="/suppliers">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">เพิ่มผู้จัดจำหน่าย</h1>
          <p className="text-sm text-muted-foreground">ลงทะเบียนผู้จัดจำหน่ายใหม่ — กรอกเอง หรือ สแกนจากเอกสาร</p>
        </div>
      </div>

      {/* AI Scan Section */}
      <Card className="border-dashed border-2 border-orange-200 bg-orange-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              <CardTitle className="text-base">AI สแกนเอกสาร</CardTitle>
              {scannedDocs.length > 0 && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700">{scannedDocs.length} ไฟล์</Badge>
              )}
            </div>
            {scannedDocs.length > 0 && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleClearAll}>
                <X className="w-3.5 h-3.5 mr-1" /> ล้างทั้งหมด
              </Button>
            )}
          </div>
          <CardDescription>
            อัปโหลดใบเสนอราคา, ภพ.20, ใบรับรองบริษัท หรือเอกสารทางการค้า — สแกนได้หลายไฟล์ ระบบจะเติมข้อมูลที่ยังขาดให้
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Scanned files list */}
          {scannedDocs.length > 0 && (
            <div className="space-y-2">
              {scannedDocs.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-white border text-sm">
                  <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                  <span className="font-medium truncate flex-1" title={doc.name}>{doc.name}</span>
                  <Select value={doc.docLabel} onValueChange={(v) => handleDocLabelChange(idx, v)}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className={`text-xs shrink-0 ${CERT_DOC_LABELS.has(doc.docLabel) ? 'border-blue-300 text-blue-600' : 'border-gray-300 text-gray-500'}`}>
                    {CERT_DOC_LABELS.has(doc.docLabel) ? '→ ใบรับรอง' : '→ Documents'}
                  </Badge>
                  {doc.fieldsFound.length > 0 && (
                    <Badge variant="secondary" className="bg-green-50 text-green-700 text-xs shrink-0">
                      +{doc.fieldsFound.length} ข้อมูล
                    </Badge>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemoveDoc(idx)}>
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Upload area — always visible */}
          {scanning ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="text-sm text-muted-foreground">กำลังสแกนเอกสาร...</p>
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-orange-500 bg-orange-100/50' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50/50'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {scannedDocs.length > 0 ? (
                <>
                  <Plus className="w-6 h-6 mx-auto text-orange-400 mb-1" />
                  <p className="text-sm font-medium text-orange-600">สแกนเอกสารเพิ่มเติม</p>
                  <p className="text-xs text-gray-400 mt-0.5">เช่น ภพ.20, ใบรับรองบริษัท เพื่อเติมข้อมูลที่ยังขาด</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-600">ลากไฟล์มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์</p>
                  <p className="text-xs text-gray-400 mt-1">รองรับ PDF, PNG, JPG (สูงสุด 20 MB)</p>
                </>
              )}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileSelect} />
        </CardContent>
      </Card>

      {/* Form Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลบริษัท</CardTitle>
          {aiScanned && (
            <CardDescription className="flex items-center gap-1 text-orange-600">
              <Eye className="w-3.5 h-3.5" /> ข้อมูลจาก AI — กรุณาตรวจสอบก่อนบันทึก
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  ชื่อบริษัท <span className="text-red-500">*</span>
                  {aiScanned && form.company_name && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)}
                  placeholder="เช่น บริษัท ABC จำกัด" className={!form.company_name ? 'border-red-300' : ''} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  เลขประจำตัวผู้เสียภาษี <span className="text-red-500">*</span>
                  {aiScanned && form.tax_id && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.tax_id} onChange={(e) => handleChange('tax_id', e.target.value)}
                  placeholder="เลข 13 หลัก" className={!form.tax_id ? 'border-red-300' : ''} />
                {aiScanned && !form.tax_id && (
                  <p className="text-xs text-red-500 mt-1">
                    AI ไม่พบเลขภาษีในเอกสาร — ลองสแกน <strong>ภพ.20</strong> หรือ <strong>ใบรับรองบริษัท</strong> เพิ่มเติม หรือกรอกด้วยตนเอง
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  ผู้ติดต่อ
                  {aiScanned && form.contact_person && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.contact_person} onChange={(e) => handleChange('contact_person', e.target.value)} placeholder="ชื่อผู้ติดต่อ" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  เบอร์โทรศัพท์
                  {aiScanned && form.phone && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="0xx-xxx-xxxx" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  อีเมล
                  {aiScanned && form.email && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  เว็บไซต์
                  {aiScanned && form.website && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.website} onChange={(e) => handleChange('website', e.target.value)} placeholder="https://" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="flex items-center gap-1">
                  ที่อยู่
                  {aiScanned && form.address && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.address} onChange={(e) => handleChange('address', e.target.value)} placeholder="ที่อยู่เต็ม" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  จังหวัด
                  {aiScanned && form.city && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.city} onChange={(e) => handleChange('city', e.target.value)} placeholder="จังหวัด" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  ประเทศ
                  {aiScanned && form.country && <Sparkles className="w-3 h-3 text-orange-400" />}
                </Label>
                <Input value={form.country} onChange={(e) => handleChange('country', e.target.value)} placeholder="ประเทศ" />
              </div>
              <div className="space-y-2">
                <Label>ระดับ (Tier)</Label>
                <Select value={form.tier} onValueChange={(v) => handleChange('tier', v)}>
                  <SelectTrigger><SelectValue placeholder="เลือกระดับ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical_tier_1">Critical Tier 1</SelectItem>
                    <SelectItem value="non_critical_tier_1">Non-Critical Tier 1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>หมายเหตุ</Label>
              <Textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} placeholder="หมายเหตุเพิ่มเติม" />
            </div>

            {/* Validation warnings */}
            {missingFields.length > 0 && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  กรุณากรอกข้อมูลที่จำเป็น: <strong>{missingFields.map((f) => f.label).join(', ')}</strong>
                </AlertDescription>
              </Alert>
            )}

            {/* Document count summary */}
            {scannedDocs.length > 0 && (
              <Alert className="bg-blue-50 border-blue-200">
                <FileText className="w-4 h-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  เอกสารแนบ {scannedDocs.length} ไฟล์ จะถูกบันทึกพร้อมข้อมูล supplier — สามารถดูได้ที่แท็บ Documents หลังบันทึก
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3">
              <Link to="/suppliers"><Button variant="outline">ยกเลิก</Button></Link>
              <Button type="submit" disabled={loading || !canSave} className="bg-orange-500 hover:bg-orange-600">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังบันทึก...</> : <><CheckCircle className="w-4 h-4 mr-2" /> ตรวจสอบ & บันทึก</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ยืนยันการบันทึกผู้จัดจำหน่าย</DialogTitle>
            <DialogDescription>กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[120px_1fr] gap-y-2">
              <span className="text-muted-foreground">ชื่อบริษัท:</span>
              <span className="font-medium">{form.company_name}</span>
              {form.tax_id && <><span className="text-muted-foreground">Tax ID:</span><span>{form.tax_id}</span></>}
              {form.contact_person && <><span className="text-muted-foreground">ผู้ติดต่อ:</span><span>{form.contact_person}</span></>}
              {form.phone && <><span className="text-muted-foreground">โทรศัพท์:</span><span>{form.phone}</span></>}
              {form.email && <><span className="text-muted-foreground">อีเมล:</span><span>{form.email}</span></>}
              {form.address && <><span className="text-muted-foreground">ที่อยู่:</span><span>{form.address}</span></>}
              {form.city && <><span className="text-muted-foreground">จังหวัด:</span><span>{form.city}</span></>}
              {form.country && <><span className="text-muted-foreground">ประเทศ:</span><span>{form.country}</span></>}
              {form.website && <><span className="text-muted-foreground">เว็บไซต์:</span><span>{form.website}</span></>}
              {form.tier && <><span className="text-muted-foreground">ระดับ:</span><span>{form.tier === 'critical_tier_1' ? 'Critical Tier 1' : 'Non-Critical Tier 1'}</span></>}
            </div>
            {scannedDocs.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs text-muted-foreground font-medium">เอกสารแนบ ({scannedDocs.length} ไฟล์):</p>
                {scannedDocs.map((doc, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <FileText className="w-3 h-3 text-orange-400" />
                    <span>{doc.name}</span>
                    <span className="text-muted-foreground">({DOC_TYPE_OPTIONS.find((o) => o.value === doc.docLabel)?.label})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>กลับไปแก้ไข</Button>
            <Button onClick={handleConfirmSave} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> กำลังบันทึก...</> : 'ยืนยัน บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
