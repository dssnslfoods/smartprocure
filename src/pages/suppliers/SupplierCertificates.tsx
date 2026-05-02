import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileBadge, Trash2, ExternalLink, AlertTriangle, CheckCircle, Clock, Star, StarOff, Loader2, Sparkles } from 'lucide-react';
import { extractTextFromPDF, extractExpiryDate, certStatus, certStatusLabel, certStatusColor } from '@/lib/pdfExtract';

// File → base64 (no data: prefix)
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
  certificate_type: string | null;
  certificate_no:   string | null;
  issued_by:        string | null;
  issued_date:      string | null;
  expiry_date:      string | null;
  confidence:       'high' | 'medium' | 'low';
  notes:            string;
}

interface Certificate {
  id: string;
  supplier_id: string;
  certificate_type: string;
  certificate_no: string | null;
  issued_by: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

const CERT_TYPES = ['GMP', 'ISO22000', 'HACCP', 'ISO9001', 'BRC', 'SQF', 'Halal', 'Kosher', 'Organic', 'FDA', 'อย.', 'อื่นๆ'];

const defaultForm = {
  certificate_type: '',
  certificate_no: '',
  issued_by: '',
  issued_date: '',
  expiry_date: '',
  is_primary: false,
  notes: '',
};

function StatusIcon({ status }: { status: ReturnType<typeof certStatus> }) {
  if (status === 'valid')    return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (status === 'expiring') return <Clock className="h-4 w-4 text-yellow-600" />;
  if (status === 'expired')  return <AlertTriangle className="h-4 w-4 text-red-600" />;
  return null;
}

function CertStatusBadge({ expiryDate }: { expiryDate: string | null }) {
  const d = expiryDate ? new Date(expiryDate) : null;
  const status = certStatus(d);
  if (status === 'unknown') return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${certStatusColor(status)}`}>
      <StatusIcon status={status} />
      {certStatusLabel(status)}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SupplierCertificates({ supplierId }: { supplierId: string }) {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<AIExtractResult | null>(null);
  const [aiDebug, setAiDebug] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Expired / expiring summary for banner
  const expired  = certs.filter(c => certStatus(c.expiry_date ? new Date(c.expiry_date) : null) === 'expired');
  const expiring = certs.filter(c => certStatus(c.expiry_date ? new Date(c.expiry_date) : null) === 'expiring');

  const fetchCerts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('supplier_certificates')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('is_primary', { ascending: false })
      .order('expiry_date', { ascending: true });
    setCerts((data as Certificate[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchCerts(); }, [supplierId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setAiResult(null);

    const isPdf   = f.type === 'application/pdf';
    const isImage = f.type.startsWith('image/');
    if (!isPdf && !isImage) return;

    setExtracting(true);
    setAiDebug(`📤 กำลังเรียก AI... (ขนาดไฟล์ ${(f.size / 1024).toFixed(0)} KB, ประเภท ${f.type})`);

    // 1) Try AI extraction (Gemini vision via Supabase Edge Function) — direct fetch
    let aiErrorMsg = '';
    try {
      const file_base64 = await fileToBase64(f);
      console.log('[AI] invoking extract-certificate, mime=', f.type, 'b64 size=', file_base64.length);
      setAiDebug(`📤 ส่งไฟล์ไป AI แล้ว (base64 ${(file_base64.length / 1024).toFixed(0)} KB)... รอ response`);

      // Direct fetch so we can see the actual error response body
      const supaUrl  = import.meta.env.VITE_SUPABASE_URL as string;
      const supaAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const sess = (await supabase.auth.getSession()).data.session;
      const token = sess?.access_token || supaAnon;

      const resp = await fetch(`${supaUrl}/functions/v1/extract-certificate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': supaAnon,
        },
        body: JSON.stringify({ file_base64, mime_type: f.type }),
      });

      const respText = await resp.text();
      console.log('[AI] HTTP', resp.status, respText);
      setAiDebug(`📥 HTTP ${resp.status}: ${respText.slice(0, 600)}`);

      let data: any = null;
      try { data = JSON.parse(respText); } catch { /* keep raw */ }

      if (!resp.ok) {
        aiErrorMsg = `AI HTTP ${resp.status}: ${data?.error || data?.detail || respText.slice(0, 200)}`;
      } else if (data?.error) {
        aiErrorMsg = `AI ตอบ error: ${data.error}${data.detail ? ` — ${String(data.detail).slice(0, 200)}` : ''}`;
      } else if (data) {
        const r = data as AIExtractResult;
        setAiResult(r);

        setForm(prev => ({
          ...prev,
          certificate_type: prev.certificate_type || r.certificate_type || prev.certificate_type,
          certificate_no:   prev.certificate_no   || r.certificate_no   || prev.certificate_no,
          issued_by:        prev.issued_by        || r.issued_by        || prev.issued_by,
          issued_date:      prev.issued_date      || r.issued_date      || prev.issued_date,
          expiry_date:      prev.expiry_date      || r.expiry_date      || prev.expiry_date,
        }));

        const filledCount = ['certificate_type','certificate_no','issued_by','issued_date','expiry_date']
          .filter(k => (r as any)[k]).length;

        toast({
          title: filledCount > 0 ? `✨ AI กรอกข้อมูลให้ ${filledCount} ช่อง` : '✨ AI อ่านได้แล้ว แต่ไม่พบข้อมูล',
          description: filledCount === 0
            ? 'ลองภาพที่ชัดกว่านี้ หรือกรอกข้อมูลด้วยตนเอง'
            : r.confidence === 'low'
              ? 'ความมั่นใจต่ำ — กรุณาตรวจสอบและแก้ไขก่อนบันทึก'
              : 'กรุณาตรวจสอบความถูกต้องก่อนบันทึก',
        });
        setExtracting(false);
        return;
      } else {
        aiErrorMsg = 'AI ไม่ตอบกลับ (response ว่าง)';
      }
    } catch (err: any) {
      aiErrorMsg = `AI exception: ${err?.message || String(err)}`;
      console.error('[AI] exception:', err);
    }

    // Show the actual error to the user so we can debug
    if (aiErrorMsg) {
      console.error('[AI] error:', aiErrorMsg);
      toast({
        title: '⚠️ AI ไม่สามารถอ่านได้',
        description: aiErrorMsg.slice(0, 200),
        variant: 'destructive',
      });
    }

    // 2) Fallback: client-side PDF text extraction (legacy)
    if (isPdf) {
      try {
        const text = await extractTextFromPDF(f);
        const date = extractExpiryDate(text);
        if (date) {
          const iso = date.toISOString().split('T')[0];
          setForm(prev => ({ ...prev, expiry_date: prev.expiry_date || iso }));
          toast({ title: 'พบวันหมดอายุ (fallback)', description: `อ่านได้ ${date.toLocaleDateString('th-TH')}` });
        } else {
          toast({ title: 'ไม่สามารถอ่านข้อมูลจากเอกสาร', description: 'กรุณากรอกข้อมูลด้วยตนเอง', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'ไม่สามารถอ่านเอกสาร', description: 'กรุณากรอกด้วยตนเอง', variant: 'destructive' });
      }
    } else {
      toast({ title: 'ไม่สามารถอ่านข้อมูลจากภาพ', description: 'กรุณากรอกด้วยตนเอง', variant: 'destructive' });
    }

    // Filename hint for cert type
    if (!form.certificate_type) {
      const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      CERT_TYPES.forEach(t => {
        if (name.toUpperCase().includes(t.toUpperCase()))
          setForm(prev => ({ ...prev, certificate_type: prev.certificate_type || t }));
      });
    }

    setExtracting(false);
  };

  const handleSave = async () => {
    if (!form.certificate_type.trim()) {
      toast({ title: 'กรุณาระบุประเภทใบรับรอง', variant: 'destructive' });
      return;
    }
    setSaving(true);

    let file_url: string | null = null;
    let file_name: string | null = null;
    let file_size: number | null = null;

    if (file) {
      const path = `${supplierId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('supplier-certificates')
        .upload(path, file, { upsert: false });

      if (uploadErr) {
        // Storage bucket may not exist yet — store without file
        toast({ title: 'อัปโหลดไฟล์ไม่สำเร็จ', description: uploadErr.message, variant: 'destructive' });
      } else {
        const { data: urlData } = supabase.storage.from('supplier-certificates').getPublicUrl(path);
        file_url = urlData.publicUrl;
        file_name = file.name;
        file_size = file.size;
      }
    }

    // If setting as primary, unset others
    if (form.is_primary) {
      await supabase.from('supplier_certificates')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('supplier_id', supplierId);
    }

    const { error } = await supabase.from('supplier_certificates').insert({
      supplier_id: supplierId,
      certificate_type: form.certificate_type.trim(),
      certificate_no:   form.certificate_no.trim() || null,
      issued_by:        form.issued_by.trim() || null,
      issued_date:      form.issued_date || null,
      expiry_date:      form.expiry_date || null,
      is_primary:       form.is_primary,
      notes:            form.notes.trim() || null,
      file_url,
      file_name,
      file_size,
    });

    if (error) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'บันทึกใบรับรองสำเร็จ' });
      setOpen(false);
      setForm(defaultForm);
      setFile(null);
      fetchCerts();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('supplier_certificates').delete().eq('id', deleteId);
    setDeleteId(null);
    fetchCerts();
    toast({ title: 'ลบใบรับรองแล้ว' });
  };

  const handleTogglePrimary = async (cert: Certificate) => {
    if (cert.is_primary) return;
    await supabase.from('supplier_certificates')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('supplier_id', supplierId);
    await supabase.from('supplier_certificates')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', cert.id);
    fetchCerts();
  };

  return (
    <div className="space-y-4">
      {/* Alert banners */}
      {expired.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>มีใบรับรอง <strong>{expired.length} ใบ</strong>ที่หมดอายุแล้ว — ต้องต่ออายุก่อนดำเนินการสั่งซื้อ</span>
        </div>
      )}
      {expiring.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800 text-sm">
          <Clock className="h-4 w-4 shrink-0" />
          <span>มีใบรับรอง <strong>{expiring.length} ใบ</strong>ที่จะหมดอายุภายใน 30 วัน — ควรดำเนินการต่ออายุ</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileBadge className="h-4 w-4" />
            ใบรับรอง ({certs.length})
          </CardTitle>
          <Button size="sm" onClick={() => { setForm(defaultForm); setFile(null); setAiResult(null); setAiDebug(''); setOpen(true); }}>
            <Upload className="h-4 w-4 mr-1" /> เพิ่มใบรับรอง
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground text-sm">กำลังโหลด...</div>
          ) : certs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <FileBadge className="h-8 w-8 opacity-30" />
              <p className="text-sm">ยังไม่มีใบรับรอง — กด "เพิ่มใบรับรอง" เพื่ออัปโหลด</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left p-2 w-6"></th>
                    <th className="text-left p-2">ประเภท</th>
                    <th className="text-left p-2">เลขที่</th>
                    <th className="text-left p-2">ออกโดย</th>
                    <th className="text-left p-2">วันออก</th>
                    <th className="text-left p-2">วันหมดอายุ</th>
                    <th className="text-left p-2">สถานะ</th>
                    <th className="text-left p-2">ไฟล์</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map(c => {
                    const expiryDate = c.expiry_date ? new Date(c.expiry_date) : null;
                    const status = certStatus(expiryDate);
                    const isExpired = status === 'expired';
                    return (
                      <tr key={c.id} className={`border-b last:border-0 hover:bg-muted/30 ${isExpired ? 'bg-red-50/40' : ''}`}>
                        <td className="p-2">
                          <button
                            onClick={() => handleTogglePrimary(c)}
                            title={c.is_primary ? 'ใบหลัก' : 'ตั้งเป็นใบหลัก'}
                            className="text-muted-foreground hover:text-yellow-500"
                          >
                            {c.is_primary
                              ? <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              : <StarOff className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="p-2 font-medium">{c.certificate_type}</td>
                        <td className="p-2 font-mono text-xs text-muted-foreground">{c.certificate_no || '—'}</td>
                        <td className="p-2 text-muted-foreground">{c.issued_by || '—'}</td>
                        <td className="p-2 text-muted-foreground">
                          {c.issued_date ? new Date(c.issued_date).toLocaleDateString('th-TH') : '—'}
                        </td>
                        <td className="p-2">
                          {expiryDate ? (
                            <span className={`font-medium ${isExpired ? 'text-red-700' : status === 'expiring' ? 'text-yellow-700' : ''}`}>
                              {expiryDate.toLocaleDateString('th-TH')}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-2"><CertStatusBadge expiryDate={c.expiry_date} /></td>
                        <td className="p-2">
                          {c.file_url ? (
                            <a href={c.file_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                              <ExternalLink className="h-3 w-3" />
                              {c.file_name ? c.file_name.slice(0, 20) + (c.file_name.length > 20 ? '…' : '') : 'ดูไฟล์'}
                              {c.file_size ? <span className="text-muted-foreground">({formatBytes(c.file_size)})</span> : null}
                            </a>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="p-2">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Certificate Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>เพิ่มใบรับรอง</DialogTitle>
          </DialogHeader>

          {/* File upload zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-6 cursor-pointer hover:bg-muted/40 transition-colors"
          >
            {extracting ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-primary">✨ AI กำลังอ่านใบรับรอง...</p>
                <p className="text-xs text-muted-foreground">กำลังดึงประเภท เลขที่ ผู้ออก และวันหมดอายุ</p>
              </>
            ) : file ? (
              <>
                <FileBadge className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)} — คลิกเพื่อเปลี่ยนไฟล์</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">คลิกเพื่ออัปโหลดไฟล์ PDF หรือรูปภาพ</p>
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  AI จะอ่านข้อมูลจากใบรับรองและกรอกฟอร์มให้อัตโนมัติ
                </p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {/* AI debug box — visible status of AI call */}
          {aiDebug && (
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 break-all">
              <div className="font-sans font-medium text-slate-500 mb-1">AI Status:</div>
              {aiDebug}
            </div>
          )}

          {/* AI extraction result banner */}
          {aiResult && !extracting && (
            <div className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${
              aiResult.confidence === 'high'   ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
              aiResult.confidence === 'medium' ? 'border-blue-200 bg-blue-50 text-blue-800' :
                                                  'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-medium">AI กรอกให้แล้ว</span>
                <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                  ความมั่นใจ: {aiResult.confidence === 'high' ? 'สูง' : aiResult.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'}
                </span>
                <p className="mt-0.5 opacity-80">กรุณาตรวจสอบทุกช่องและแก้ไขให้ถูกต้องก่อนกดบันทึก{aiResult.notes ? ` — ${aiResult.notes}` : ''}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Certificate type */}
            <div className="col-span-2 space-y-1">
              <Label>ประเภทใบรับรอง *</Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {CERT_TYPES.map(t => (
                  <button key={t} type="button"
                    onClick={() => setForm(p => ({ ...p, certificate_type: t }))}
                    className={`px-2 py-0.5 rounded text-xs border transition-colors ${form.certificate_type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 hover:bg-muted'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <Input placeholder="หรือพิมพ์ชื่อประเภทอื่น" value={form.certificate_type}
                onChange={e => setForm(p => ({ ...p, certificate_type: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>เลขที่ใบรับรอง</Label>
              <Input placeholder="เช่น TH-GMP-2024-0001" value={form.certificate_no}
                onChange={e => setForm(p => ({ ...p, certificate_no: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>ออกโดย</Label>
              <Input placeholder="หน่วยงาน/องค์กร" value={form.issued_by}
                onChange={e => setForm(p => ({ ...p, issued_by: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>วันที่ออก</Label>
              <Input type="date" value={form.issued_date}
                onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                วันหมดอายุ
                {form.expiry_date && (
                  <CertStatusBadge expiryDate={form.expiry_date} />
                )}
              </Label>
              <Input type="date" value={form.expiry_date}
                onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>หมายเหตุ</Label>
              <Input placeholder="หมายเหตุเพิ่มเติม" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_primary" checked={form.is_primary}
                onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))} />
              <Label htmlFor="is_primary" className="cursor-pointer">ตั้งเป็นใบรับรองหลัก (ใช้ประเมิน risk)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving || extracting}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> กำลังบันทึก...</> : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบใบรับรองนี้?</AlertDialogTitle>
            <AlertDialogDescription>การลบไม่สามารถเรียกคืนได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
