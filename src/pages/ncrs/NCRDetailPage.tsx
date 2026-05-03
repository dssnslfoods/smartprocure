import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react';

const NCR_CATEGORIES = [
  { value: 'specification',     label: 'Specification ไม่ตรง' },
  { value: 'quality',           label: 'คุณภาพต่ำกว่ามาตรฐาน' },
  { value: 'contamination',     label: 'ปนเปื้อนทางกายภาพ' },
  { value: 'microbiological',   label: 'ปนเปื้อนทางจุลชีววิทยา' },
  { value: 'allergen',          label: 'Allergen contamination' },
  { value: 'packaging',         label: 'บรรจุภัณฑ์เสียหาย' },
  { value: 'delivery',          label: 'การส่งมอบ (ช้า/ผิดจำนวน)' },
  { value: 'temperature',       label: 'อุณหภูมิ / Cold Chain' },
  { value: 'documentation',     label: 'เอกสารไม่ครบ (CoA, cert)' },
  { value: 'food_fraud',        label: 'Food Fraud / Adulteration' },
  { value: 'other',             label: 'อื่นๆ' },
];

interface NCR {
  id?: string;
  ncr_number?: string;
  supplier_id: string;
  category: string;
  severity: 'minor' | 'major' | 'critical';
  product_description: string;
  lot_number: string;
  rfq_id: string | null;
  detected_date: string;
  description: string;
  evidence_url: string;
  root_cause: string;
  corrective_action: string;
  capa_due_date: string;
  closed_date: string | null;
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
}

const EMPTY_NCR: NCR = {
  supplier_id: '', category: 'specification', severity: 'minor',
  product_description: '', lot_number: '', rfq_id: null,
  detected_date: new Date().toISOString().slice(0, 10),
  description: '', evidence_url: '',
  root_cause: '', corrective_action: '', capa_due_date: '',
  closed_date: null, status: 'open',
};

export default function NCRDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { roles, user } = useAuth();
  const { toast } = useToast();
  const canEdit = roles.includes('admin') || roles.includes('procurement_officer') || roles.includes('approver');
  const isAdmin = roles.includes('admin');

  const [form, setForm] = useState<NCR>(EMPTY_NCR);
  const [suppliers, setSuppliers] = useState<{ id: string; company_name: string }[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: sups } = await supabase.from('suppliers').select('id, company_name').order('company_name');
      setSuppliers(sups || []);
      if (!isNew) {
        const { data, error } = await supabase.from('supplier_ncrs').select('*').eq('id', id).maybeSingle();
        if (error || !data) {
          toast({ title: 'ไม่พบ NCR', variant: 'destructive' });
          navigate('/ncrs');
          return;
        }
        setForm({ ...EMPTY_NCR, ...data, capa_due_date: data.capa_due_date || '' });
      }
      setLoading(false);
    })();
  }, [id, isNew, navigate, toast]);

  const handleSave = async () => {
    if (!form.supplier_id || !form.description || !form.category) {
      toast({ title: 'กรุณากรอกข้อมูลที่จำเป็น (Supplier, ประเภท, คำอธิบาย)', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // Strip empty-string date fields → null (Postgres rejects '' as date)
    const payload: any = {
      ...form,
      capa_due_date: form.capa_due_date || null,
      closed_date:   form.closed_date || null,
      lot_number:    form.lot_number  || null,
      product_description: form.product_description || null,
      evidence_url:  form.evidence_url || null,
      root_cause:    form.root_cause || null,
      corrective_action: form.corrective_action || null,
    };

    if (isNew) {
      payload.detected_by = user?.id;
      payload.created_by  = user?.id;
      delete payload.id; delete payload.ncr_number;
      const { data, error } = await supabase.from('supplier_ncrs').insert(payload).select('id').single();
      if (error) {
        toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
        setSaving(false); return;
      }
      toast({ title: 'เปิด NCR เรียบร้อย' });
      navigate(`/ncrs/${data.id}`);
    } else {
      delete payload.ncr_number; delete payload.created_at; delete payload.updated_at;
      const { error } = await supabase.from('supplier_ncrs').update(payload).eq('id', id);
      if (error) {
        toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'บันทึกเรียบร้อย' });
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!isAdmin || !id || !confirm('ลบ NCR ใบนี้ถาวร?')) return;
    const { error } = await supabase.from('supplier_ncrs').delete().eq('id', id);
    if (error) {
      toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'ลบเรียบร้อย' });
      navigate('/ncrs');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/ncrs')}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-orange-500" />
              {isNew ? 'เปิด NCR ใหม่' : form.ncr_number}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isNew ? 'บันทึกความไม่เป็นไปตามข้อกำหนด' : 'จัดการ root cause และ corrective action'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && isAdmin && (
            <Button variant="outline" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> ลบ
            </Button>
          )}
          {canEdit && (
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          )}
        </div>
      </div>

      {/* Section 1: Detection */}
      <Card>
        <CardHeader><CardTitle className="text-base">ข้อมูลการตรวจพบ</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Supplier *</Label>
            <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue placeholder="เลือก supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ประเภทความไม่สอดคล้อง *</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {NCR_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>ความรุนแรง *</Label>
            <Select value={form.severity} onValueChange={(v: any) => setForm(p => ({ ...p, severity: v }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">🟡 Minor — ผลกระทบน้อย</SelectItem>
                <SelectItem value="major">🟠 Major — กระทบคุณภาพ</SelectItem>
                <SelectItem value="critical">🔴 Critical — กระทบความปลอดภัย</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>วันที่ตรวจพบ *</Label>
            <Input type="date" value={form.detected_date}
                   onChange={e => setForm(p => ({ ...p, detected_date: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Lot / Batch Number</Label>
            <Input value={form.lot_number} onChange={e => setForm(p => ({ ...p, lot_number: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>สินค้า / Product Description</Label>
            <Input value={form.product_description}
                   onChange={e => setForm(p => ({ ...p, product_description: e.target.value }))} disabled={!canEdit}
                   placeholder="เช่น แป้งสาลี protein 12% Brand X" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>คำอธิบายความไม่สอดคล้อง *</Label>
            <Textarea rows={3} value={form.description}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))} disabled={!canEdit}
                      placeholder="เช่น ตรวจพบ protein 10.5% (ต่ำกว่า spec 12%)" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>หลักฐาน (URL / Link)</Label>
            <Input value={form.evidence_url} onChange={e => setForm(p => ({ ...p, evidence_url: e.target.value }))} disabled={!canEdit}
                   placeholder="https://... (รูปถ่าย, CoA, lab report)" />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: CAPA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Corrective Action Plan (CAPA)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Root Cause Analysis</Label>
            <Textarea rows={3} value={form.root_cause}
                      onChange={e => setForm(p => ({ ...p, root_cause: e.target.value }))} disabled={!canEdit}
                      placeholder="วิเคราะห์สาเหตุที่แท้จริง — supplier เปลี่ยนแหล่งวัตถุดิบ / กระบวนการผลิตผิดพลาด / ฯลฯ" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Corrective Action</Label>
            <Textarea rows={3} value={form.corrective_action}
                      onChange={e => setForm(p => ({ ...p, corrective_action: e.target.value }))} disabled={!canEdit}
                      placeholder="แผนแก้ไข — คืน lot, re-test 3 lots ถัดไป, audit supplier, ฯลฯ" />
          </div>
          <div className="space-y-1.5">
            <Label>CAPA Due Date</Label>
            <Input type="date" value={form.capa_due_date}
                   onChange={e => setForm(p => ({ ...p, capa_due_date: e.target.value }))} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>สถานะ</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm(p => ({ ...p, status: v }))} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">เปิดใหม่</SelectItem>
                <SelectItem value="in_progress">กำลังดำเนินการ</SelectItem>
                <SelectItem value="closed">ปิดเรียบร้อย</SelectItem>
                <SelectItem value="cancelled">ยกเลิก</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.closed_date && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>วันที่ปิด</Label>
              <p className="text-sm text-muted-foreground">{new Date(form.closed_date).toLocaleDateString('th-TH')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {!isNew && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-md">
            <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-800">
              NCR ใบนี้จะถูกนับรวมเข้า <strong>NCR History Risk</strong> ของ supplier โดยอัตโนมัติ —
              ส่งผลถึงคะแนนความเสี่ยงรวมในหน้า Vendor Risk Assessment
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
