import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  ShieldCheck, Download, Trash2, Pencil, Plus, Loader2,
  AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { safeStorageName } from '@/lib/storage';
import { expiryStatus } from '@/lib/dateUtils';

interface SupplierCertificate {
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
  notes: string | null;
  created_at: string;
}

const COMMON_TYPES = [
  'Halal', 'HACCP', 'GMP', 'ISO 22000', 'ISO 9001', 'BRCGS', 'FSSC 22000',
  'Kosher', 'Organic', 'ใบรับรองบริษัท',
];

const emptyForm = { certificate_type: '', certificate_no: '', issued_by: '', issued_date: '', expiry_date: '', notes: '' };

interface Props {
  supplierId: string;
  /** Supplier-portal mode: the supplier manages their own certificates. */
  portalMode?: boolean;
}

export default function SupplierCertificates({ supplierId, portalMode = false }: Props) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = portalMode || hasRole('admin') || hasRole('procurement_officer');

  const [certs, setCerts] = useState<SupplierCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<SupplierCertificate | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('supplier_certificates')
      .select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false });
    setCerts((data as unknown as SupplierCertificate[]) || []);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setFile(null); setShowForm(true); };
  const openEdit = (c: SupplierCertificate) => {
    setEditing(c);
    setForm({
      certificate_type: c.certificate_type, certificate_no: c.certificate_no || '',
      issued_by: c.issued_by || '', issued_date: c.issued_date || '',
      expiry_date: c.expiry_date || '', notes: c.notes || '',
    });
    setFile(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.certificate_type.trim()) return;
    setSaving(true);
    let fileUrl = editing?.file_url ?? null;
    let fileName = editing?.file_name ?? null;
    let fileSize = editing?.file_size ?? null;

    if (file) {
      const path = `${supplierId}/${Date.now()}_${safeStorageName(file.name)}`;
      const { error: upErr } = await supabase.storage.from('supplier-certificates').upload(path, file);
      if (upErr) {
        toast({ title: 'อัปโหลดไฟล์ไม่สำเร็จ', description: upErr.message, variant: 'destructive' });
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('supplier-certificates').getPublicUrl(path);
      fileUrl = urlData.publicUrl; fileName = file.name; fileSize = file.size;
    }

    const payload = {
      supplier_id: supplierId,
      certificate_type: form.certificate_type.trim(),
      certificate_no: form.certificate_no.trim() || null,
      issued_by: form.issued_by.trim() || null,
      issued_date: form.issued_date || null,
      expiry_date: form.expiry_date || null,
      notes: form.notes.trim() || null,
      file_url: fileUrl, file_name: fileName, file_size: fileSize,
      created_by: user?.id ?? null,
    };

    const { error } = editing
      ? await supabase.from('supplier_certificates').update(payload).eq('id', editing.id)
      : await supabase.from('supplier_certificates').insert(payload);

    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'แก้ไขใบรับรองแล้ว' : 'เพิ่มใบรับรองแล้ว' });
    setShowForm(false); load();
  };

  const remove = async (c: SupplierCertificate) => {
    if (c.file_url) {
      const path = c.file_url.split('/supplier-certificates/')[1];
      if (path) await supabase.storage.from('supplier-certificates').remove([decodeURIComponent(path)]);
    }
    await supabase.from('supplier_certificates').delete().eq('id', c.id);
    toast({ title: 'ลบใบรับรองแล้ว' });
    load();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">กำลังโหลด...</div>;

  const expired = certs.filter(c => expiryStatus(c.expiry_date) === 'expired');
  const expiring = certs.filter(c => expiryStatus(c.expiry_date) === 'expiring');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-semibold text-sm">ใบรับรอง</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ใบรับรองมาตรฐาน/คุณภาพของบริษัท (Halal, HACCP, ISO ฯลฯ) — ใช้จับคู่อัตโนมัติกับเกณฑ์ประเมิน BRCGS และแจ้งเตือนวันหมดอายุบน Dashboard
            </p>
          </div>
          {canEdit && (
            <Button size="sm" className="gap-1 shrink-0" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> เพิ่มใบรับรอง
            </Button>
          )}
        </CardContent>
      </Card>

      {expired.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>มีใบรับรอง <strong>{expired.length} ฉบับ</strong> หมดอายุแล้ว — ควรขอฉบับต่ออายุโดยเร็ว</span>
        </div>
      )}
      {expiring.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800 text-sm">
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <span>มีใบรับรอง <strong>{expiring.length} ฉบับ</strong> จะหมดอายุภายใน 30 วัน</span>
        </div>
      )}

      {certs.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">ยังไม่มีใบรับรอง</div>
      ) : (
        <div className="space-y-2">
          {certs.map(c => {
            const exp = expiryStatus(c.expiry_date);
            return (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-medium text-sm">{c.certificate_type}</span>
                      {c.certificate_no && <span className="text-xs text-muted-foreground">เลขที่ {c.certificate_no}</span>}
                    </div>
                    <div className="mt-1.5 ml-6 flex items-center gap-1.5 text-[11px] flex-wrap">
                      {c.file_url && (
                        <a href={c.file_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Download className="w-3 h-3" />
                          {(c.file_name || 'ไฟล์แนบ').length > 40 ? (c.file_name || '').slice(0, 40) + '…' : (c.file_name || 'ไฟล์แนบ')}
                        </a>
                      )}
                      {c.issued_by && <span className="text-muted-foreground">ออกโดย {c.issued_by}</span>}
                      {c.expiry_date && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[10px] font-medium ${
                          exp === 'expired' ? 'border-red-200 bg-red-50 text-red-700'
                          : exp === 'expiring' ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                          : exp === 'invalid' ? 'border-amber-300 bg-amber-50 text-amber-800'
                          : 'border-green-200 bg-green-50 text-green-700'
                        }`}>
                          {exp === 'expired' || exp === 'invalid' ? <AlertTriangle className="w-2.5 h-2.5" /> : exp === 'expiring' ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                          {exp === 'invalid' ? 'วันหมดอายุไม่ถูกต้อง' : `หมดอายุ ${new Date(c.expiry_date).toLocaleDateString('th-TH')}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(c)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'แก้ไขใบรับรอง' : 'เพิ่มใบรับรอง'}</DialogTitle>
            <DialogDescription>ระบุประเภทใบรับรอง วันออก/หมดอายุ และแนบไฟล์ (ถ้ามี)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ประเภทใบรับรอง *</Label>
              <Input list="cert-type-suggestions" value={form.certificate_type}
                placeholder="เช่น Halal, HACCP, ISO 22000"
                onChange={e => setForm(p => ({ ...p, certificate_type: e.target.value }))} />
              <datalist id="cert-type-suggestions">
                {COMMON_TYPES.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>เลขที่ใบรับรอง</Label>
                <Input value={form.certificate_no} onChange={e => setForm(p => ({ ...p, certificate_no: e.target.value }))} />
              </div>
              <div>
                <Label>ออกโดย</Label>
                <Input value={form.issued_by} onChange={e => setForm(p => ({ ...p, issued_by: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>วันที่ออก</Label>
                <Input type="date" value={form.issued_date} onChange={e => setForm(p => ({ ...p, issued_date: e.target.value }))} />
              </div>
              <div>
                <Label>วันหมดอายุ</Label>
                <Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>ไฟล์แนบ {editing?.file_name ? `(ปัจจุบัน: ${editing.file_name})` : ''}</Label>
              <Input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label>หมายเหตุ</Label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving || !form.certificate_type.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
