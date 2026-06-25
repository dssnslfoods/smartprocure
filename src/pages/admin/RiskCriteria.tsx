import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, ShieldCheck, FileBadge, FileText, AlertTriangle } from 'lucide-react';
import { RISK_FACTORS } from '@/types/procurement';
import { DIMENSION_LABEL, CATEGORY_OPTIONS, type RiskCriterion } from '@/lib/riskCriteria';

const CATEGORY_LABEL: Record<string, string> = {
  _global: 'ทุกหมวด (Global)',
  raw_material: 'วัตถุดิบ',
  packaging: 'บรรจุภัณฑ์',
  service: 'บริการ',
  other: 'อื่นๆ',
};
const CATEGORY_ORDER = ['_global', 'raw_material', 'packaging', 'service', 'other'];

type Draft = Partial<RiskCriterion> & { keywordsText?: string };

const EMPTY: Draft = {
  category: null, dimension: 'food_safety_risk', name_th: '', description: '',
  weight: 1, match_type: 'certificate', keywordsText: '', is_mandatory: false, sort_order: 10, active: true,
};

export default function RiskCriteria() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  const [rows, setRows] = useState<RiskCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('risk_criteria').select('*')
      .order('category', { nullsFirst: true }).order('dimension').order('sort_order');
    setRows((data as RiskCriterion[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setDraft(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (c: RiskCriterion) => {
    setDraft({ ...c, keywordsText: (c.match_keywords || []).join(', ') });
    setEditId(c.id); setOpen(true);
  };

  const save = async () => {
    if (!draft.name_th?.trim()) { toast({ title: 'กรุณาใส่ชื่อเกณฑ์', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = {
      category: draft.category || null,
      dimension: draft.dimension,
      code: draft.code || null,
      name_th: draft.name_th.trim(),
      description: draft.description || null,
      weight: Number(draft.weight) || 1,
      match_type: draft.match_type,
      match_keywords: (draft.keywordsText || '').split(',').map(s => s.trim()).filter(Boolean),
      is_mandatory: !!draft.is_mandatory,
      sort_order: Number(draft.sort_order) || 0,
      active: draft.active !== false,
      updated_at: new Date().toISOString(),
    };
    const { error } = editId
      ? await supabase.from('risk_criteria').update(payload).eq('id', editId)
      : await supabase.from('risk_criteria').insert(payload);
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editId ? 'แก้ไขเกณฑ์แล้ว' : 'เพิ่มเกณฑ์แล้ว' });
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('risk_criteria').delete().eq('id', id);
    if (error) { toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'ลบเกณฑ์แล้ว' }); load();
  };

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: rows.filter(r => (r.category ?? '_global') === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-teal-600" />เกณฑ์การประเมินความเสี่ยง (BRC)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            กำหนดเกณฑ์ที่ supplier ต้องผ่านในแต่ละด้าน ระบบจะตรวจจากเอกสาร/ใบรับรองอัตโนมัติ แล้วคำนวณคะแนนความเสี่ยง
            หากขาดเกณฑ์บังคับ (mandatory) คะแนนความเสี่ยงด้านนั้นจะสูงสุด
          </p>
        </div>
        {canEdit && <Button onClick={openNew} className="shrink-0"><Plus className="w-4 h-4 mr-2" />เพิ่มเกณฑ์</Button>}
      </div>

      {loading ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">กำลังโหลด...</CardContent></Card>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">ยังไม่มีเกณฑ์ — กด "เพิ่มเกณฑ์" เพื่อเริ่มต้น</CardContent></Card>
      ) : grouped.map(({ cat, items }) => (
        <div key={cat} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{CATEGORY_LABEL[cat]}</h2>
          <Card>
            <CardContent className="p-0 divide-y">
              {items.map(c => (
                <div key={c.id} className="flex items-start gap-3 p-4">
                  <div className="mt-0.5">
                    {c.match_type === 'certificate' ? <FileBadge className="w-4 h-4 text-blue-500" /> : <FileText className="w-4 h-4 text-violet-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name_th}</span>
                      <Badge variant="outline" className="text-[10px]">{DIMENSION_LABEL[c.dimension] || c.dimension}</Badge>
                      {c.is_mandatory && <Badge className="bg-red-500/10 text-red-600 text-[10px] gap-1"><AlertTriangle className="w-3 h-3" />บังคับ</Badge>}
                      {!c.active && <Badge variant="secondary" className="text-[10px]">ปิดใช้งาน</Badge>}
                      <span className="text-xs text-muted-foreground">น้ำหนัก {c.weight}</span>
                    </div>
                    {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                    {c.match_keywords?.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        จับคู่จาก{c.match_type === 'certificate' ? 'ใบรับรอง' : 'เอกสาร'}: {c.match_keywords.map(k => <code key={k} className="bg-muted px-1 rounded mr-1">{k}</code>)}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="w-4 h-4 text-red-500" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ลบเกณฑ์นี้?</AlertDialogTitle>
                            <AlertDialogDescription>"{c.name_th}" จะถูกลบถาวร และจะไม่ถูกใช้คำนวณความเสี่ยงอีก</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(c.id)} className="bg-red-600 hover:bg-red-700">ลบ</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? 'แก้ไขเกณฑ์' : 'เพิ่มเกณฑ์ใหม่'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ชื่อเกณฑ์ *</Label>
              <Input value={draft.name_th || ''} onChange={e => setDraft(d => ({ ...d, name_th: e.target.value }))} placeholder="เช่น แผน HACCP" />
            </div>
            <div>
              <Label>คำอธิบาย</Label>
              <Textarea rows={2} value={draft.description || ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>หมวดหมู่ catalog</Label>
                <Select value={draft.category ?? '_global'} onValueChange={v => setDraft(d => ({ ...d, category: v === '_global' ? null : v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_global">ทุกหมวด (Global)</SelectItem>
                    {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ด้านความเสี่ยง</Label>
                <Select value={draft.dimension} onValueChange={v => setDraft(d => ({ ...d, dimension: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_FACTORS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ตรวจจาก</Label>
                <Select value={draft.match_type} onValueChange={v => setDraft(d => ({ ...d, match_type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="certificate">ใบรับรอง (Certificate)</SelectItem>
                    <SelectItem value="document">เอกสาร (Document)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>น้ำหนัก</Label>
                <Input type="number" min={0.5} step={0.5} value={draft.weight ?? 1} onChange={e => setDraft(d => ({ ...d, weight: parseFloat(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>คำค้นสำหรับจับคู่ (คั่นด้วยจุลภาค)</Label>
              <Input value={draft.keywordsText || ''} onChange={e => setDraft(d => ({ ...d, keywordsText: e.target.value }))} placeholder="haccp, gmp, ใบรับรอง" />
              <p className="text-[11px] text-muted-foreground mt-1">ระบบจะถือว่า "ผ่าน" เมื่อชื่อ{draft.match_type === 'certificate' ? 'ใบรับรอง' : 'เอกสาร'}มีคำเหล่านี้คำใดคำหนึ่ง</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="cursor-pointer">เกณฑ์บังคับ (Mandatory)</Label>
                <p className="text-[11px] text-muted-foreground">หากขาด คะแนนความเสี่ยงด้านนี้จะสูงสุด (10)</p>
              </div>
              <Switch checked={!!draft.is_mandatory} onCheckedChange={v => setDraft(d => ({ ...d, is_mandatory: v }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label className="cursor-pointer">เปิดใช้งาน</Label>
              <Switch checked={draft.active !== false} onCheckedChange={v => setDraft(d => ({ ...d, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
