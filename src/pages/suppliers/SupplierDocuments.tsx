import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  FileText, Download, Trash2, Paperclip, CheckCircle2, CircleDashed,
  Loader2, AlertTriangle, Clock, Plus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  loadCompanyDocTypes, safeStorageName, docExpiryStatus,
  type CompanyDocType, type SupplierDoc,
} from '@/lib/companyDocs';

interface Props {
  supplierId: string;
  /** Supplier-portal mode: the supplier manages their own documents. */
  portalMode?: boolean;
}

export default function SupplierDocuments({ supplierId, portalMode = false }: Props) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = portalMode || hasRole('admin') || hasRole('procurement_officer');

  const [types, setTypes] = useState<CompanyDocType[]>([]);
  const [docs, setDocs] = useState<SupplierDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [pending, setPending] = useState<null | { type: CompanyDocType | null; file: File }>(null);
  const [expiryInput, setExpiryInput] = useState('');
  const [otherName, setOtherName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<CompanyDocType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ts, dRes] = await Promise.all([
      loadCompanyDocTypes(),
      supabase.from('supplier_documents').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }),
    ]);
    setTypes(ts);
    setDocs((dRes.data as unknown as SupplierDoc[]) || []);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  // Group uploaded docs: by type id, with legacy fallback matching on the type name.
  const docsForType = (t: CompanyDocType) =>
    docs.filter(d => d.document_type_id === t.id || (!d.document_type_id && d.document_type === t.name_th));
  const typeIds = new Set(types.map(t => t.id));
  const otherDocs = docs.filter(d =>
    !(d.document_type_id && typeIds.has(d.document_type_id)) &&
    !types.some(t => !d.document_type_id && d.document_type === t.name_th));

  const startUpload = (t: CompanyDocType | null) => {
    uploadTarget.current = t;
    fileRef.current?.click();
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const t = uploadTarget.current;
    // Docs with expiry, or "other" docs, go through a small dialog first.
    if (t?.has_expiry || !t) {
      setExpiryInput('');
      setOtherName(t ? '' : file.name.replace(/\.[^.]+$/, ''));
      setPending({ type: t, file });
    } else {
      doUpload(t, file, null, null);
    }
  };

  const doUpload = async (t: CompanyDocType | null, file: File, expiry: string | null, name: string | null) => {
    setUploadingFor(t?.id ?? '_other');
    setPending(null);
    const path = `suppliers/${supplierId}/${Date.now()}_${safeStorageName(file.name)}`;
    const { error: upErr } = await supabase.storage.from('supplier-documents').upload(path, file);
    if (upErr) {
      toast({ title: 'อัปโหลดไม่สำเร็จ', description: upErr.message, variant: 'destructive' });
      setUploadingFor(null);
      return;
    }
    const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(path);
    const { error: insErr } = await supabase.from('supplier_documents').insert({
      supplier_id: supplierId,
      document_type_id: t?.id ?? null,
      document_type: t?.name_th ?? 'อื่นๆ',
      document_name: name || t?.name_th || file.name,
      file_url: urlData.publicUrl,
      file_size: file.size,
      expiry_date: expiry,
      uploaded_by: user?.id ?? null,
    } as any);
    if (insErr) {
      toast({ title: 'บันทึกเอกสารไม่สำเร็จ', description: insErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'อัปโหลดเอกสารเรียบร้อย', description: name || t?.name_th || file.name });
      await load();
    }
    setUploadingFor(null);
  };

  const handleDelete = async (d: SupplierDoc) => {
    const path = d.file_url?.split('/supplier-documents/')[1];
    if (path) await supabase.storage.from('supplier-documents').remove([decodeURIComponent(path)]);
    await supabase.from('supplier_documents').delete().eq('id', d.id);
    toast({ title: 'ลบเอกสารแล้ว' });
    load();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">กำลังโหลด...</div>;

  const requiredMissing = types.filter(t => t.is_required && docsForType(t).length === 0).length;
  const allExpiring = docs.filter(d => docExpiryStatus(d.expiry_date) === 'expiring');
  const allExpired = docs.filter(d => docExpiryStatus(d.expiry_date) === 'expired');

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={handleFilePicked} />

      {/* Summary / alerts */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-sm">เอกสารบริษัท</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              เอกสารจดทะเบียน / กฎหมายที่ต้องส่ง (ใบรับรองมาตรฐานอาหารดูที่แท็บ ประเมิน BRCGS)
            </p>
          </div>
          <div className="text-right">
            {requiredMissing > 0 ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                ยังขาดเอกสารบังคับ {requiredMissing} รายการ
              </Badge>
            ) : (
              <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> เอกสารบังคับครบแล้ว
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {allExpired.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>มีเอกสาร <strong>{allExpired.length} ไฟล์</strong> หมดอายุแล้ว — ควรขอฉบับปรับปรุงจาก supplier</span>
        </div>
      )}
      {allExpiring.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800 text-sm">
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>มีเอกสาร <strong>{allExpiring.length} ไฟล์</strong> จะหมดอายุภายใน 30 วัน</span>
        </div>
      )}

      {/* Required / configured document slots */}
      <div className="space-y-2">
        {types.map(t => {
          const files = docsForType(t);
          const has = files.length > 0;
          return (
            <Card key={t.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      {has
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        : <CircleDashed className={`w-4 h-4 shrink-0 ${t.is_required ? 'text-amber-500' : 'text-muted-foreground/50'}`} />}
                      <span className="font-medium text-sm">{t.name_th}</span>
                      {t.is_required
                        ? <Badge variant="outline" className="text-[10px] border-red-200 bg-red-50 text-red-600">บังคับ</Badge>
                        : <Badge variant="outline" className="text-[10px]">ถ้ามี</Badge>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 ml-6">{t.description}</p>}

                    {files.length > 0 && (
                      <div className="mt-1.5 ml-6 space-y-1">
                        {files.map(d => {
                          const exp = docExpiryStatus(d.expiry_date);
                          return (
                            <div key={d.id} className="flex items-center gap-1.5 text-[11px] flex-wrap">
                              {d.file_url && (
                                <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline">
                                  <Download className="w-3 h-3" />
                                  {d.document_name.length > 40 ? d.document_name.slice(0, 40) + '…' : d.document_name}
                                </a>
                              )}
                              <span className="text-muted-foreground">
                                {d.file_size ? `(${(d.file_size / 1024).toFixed(0)} KB)` : ''} · {new Date(d.created_at).toLocaleDateString('th-TH')}
                              </span>
                              {d.expiry_date && (
                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[10px] font-medium ${
                                  exp === 'expired' ? 'border-red-200 bg-red-50 text-red-700'
                                  : exp === 'expiring' ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                  : exp === 'invalid' ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : 'border-green-200 bg-green-50 text-green-700'
                                }`}>
                                  {exp === 'expired' || exp === 'invalid' ? <AlertTriangle className="w-2.5 h-2.5" /> : exp === 'expiring' ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                                  {exp === 'invalid' ? 'วันหมดอายุไม่ถูกต้อง' : `หมดอายุ ${new Date(d.expiry_date!).toLocaleDateString('th-TH')}`}
                                </span>
                              )}
                              {canEdit && (
                                <button onClick={() => handleDelete(d)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <Button variant={has ? 'ghost' : 'outline'} size="sm" className="h-8 gap-1 shrink-0"
                      disabled={uploadingFor !== null} onClick={() => startUpload(t)}>
                      {uploadingFor === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                      {has ? 'เพิ่มไฟล์' : 'แนบไฟล์'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Other documents */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">เอกสารอื่นๆ</span>
              <span className="text-xs text-muted-foreground">({otherDocs.length})</span>
            </div>
            {canEdit && (
              <Button variant="outline" size="sm" className="h-8 gap-1"
                disabled={uploadingFor !== null} onClick={() => startUpload(null)}>
                {uploadingFor === '_other' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                อัปโหลดเอกสารอื่น
              </Button>
            )}
          </div>
          {otherDocs.length > 0 && (
            <div className="mt-2 space-y-1">
              {otherDocs.map(d => (
                <div key={d.id} className="flex items-center gap-1.5 text-[11px] flex-wrap ml-6">
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Download className="w-3 h-3" />
                      {d.document_name.length > 40 ? d.document_name.slice(0, 40) + '…' : d.document_name}
                    </a>
                  )}
                  <span className="text-muted-foreground">
                    {d.document_type && d.document_type !== 'อื่นๆ' ? `${d.document_type} · ` : ''}
                    {d.file_size ? `(${(d.file_size / 1024).toFixed(0)} KB)` : ''} · {new Date(d.created_at).toLocaleDateString('th-TH')}
                  </span>
                  {canEdit && (
                    <button onClick={() => handleDelete(d)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expiry / name dialog for docs with expiry or "other" uploads */}
      <Dialog open={pending !== null} onOpenChange={v => { if (!v) setPending(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{pending?.type ? pending.type.name_th : 'อัปโหลดเอกสารอื่น'}</DialogTitle>
          </DialogHeader>
          {pending && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium">{pending.file.name}</p>
                <p className="text-muted-foreground">{(pending.file.size / 1024).toFixed(0)} KB</p>
              </div>
              {!pending.type && (
                <div className="space-y-1">
                  <Label className="text-xs">ชื่อเอกสาร *</Label>
                  <Input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="เช่น หนังสือมอบอำนาจ" className="h-9" />
                </div>
              )}
              {(pending.type?.has_expiry || !pending.type) && (
                <div className="space-y-1">
                  <Label className="text-xs">วันหมดอายุ {pending.type?.has_expiry ? '' : '(ถ้ามี)'}</Label>
                  <Input type="date" value={expiryInput} onChange={e => setExpiryInput(e.target.value)} className="h-9" />
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setPending(null)}>ยกเลิก</Button>
                <Button size="sm"
                  disabled={!pending.type && !otherName.trim()}
                  onClick={() => doUpload(pending.type, pending.file, expiryInput || null, pending.type ? null : otherName.trim())}>
                  อัปโหลด
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
