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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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

// Per-risk detail entered inside the checklist. One entry => one risk_criteria row.
type FactorDetail = {
  name_th: string;
  description: string;
  match_type: 'certificate' | 'document';
  keywordsText: string;
  weight: number;
  is_mandatory: boolean;
};
const emptyDetail = (): FactorDetail => ({
  name_th: '', description: '', match_type: 'certificate', keywordsText: '', weight: 1, is_mandatory: false,
});

export default function RiskCriteria() {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  const [rows, setRows] = useState<RiskCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state. editId === null => "add many" checklist; otherwise edit one row.
  const [editId, setEditId] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  // presence of a key = that risk factor is checked; value = its detail.
  const [factors, setFactors] = useState<Record<string, FactorDetail>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('risk_criteria').select('*')
      .order('category', { nullsFirst: true }).order('dimension').order('sort_order');
    setRows((data as RiskCriterion[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(null); setCategory(null); setActive(true); setFactors({}); setOpen(true);
  };
  const openEdit = (c: RiskCriterion) => {
    setEditId(c.id); setCategory(c.category ?? null); setActive(c.active !== false);
    setFactors({ [c.dimension]: {
      name_th: c.name_th || '', description: c.description || '',
      match_type: c.match_type, keywordsText: (c.match_keywords || []).join(', '),
      weight: c.weight ?? 1, is_mandatory: !!c.is_mandatory,
    } });
    setOpen(true);
  };

  const toggleFactor = (key: string, on: boolean) => setFactors(prev => {
    const next = { ...prev };
    if (on) next[key] = prev[key] ?? emptyDetail();
    else delete next[key];
    return next;
  });
  const setDetail = (key: string, patch: Partial<FactorDetail>) =>
    setFactors(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const rowFromDetail = (dim: string, det: FactorDetail, i: number) => ({
    category: category || null,
    dimension: dim,
    name_th: det.name_th.trim(),
    description: det.description?.trim() || null,
    weight: Number(det.weight) || 1,
    match_type: det.match_type,
    match_keywords: (det.keywordsText || '').split(',').map(s => s.trim()).filter(Boolean),
    is_mandatory: !!det.is_mandatory,
    sort_order: (i + 1) * 10,
    active,
    updated_at: new Date().toISOString(),
  });

  const save = async () => {
    const entries = Object.entries(factors);
    if (entries.length === 0) { toast({ title: 'เลือกอย่างน้อย 1 ด้านความเสี่ยง', variant: 'destructive' }); return; }
    const missing = entries.filter(([, d]) => !d.name_th.trim());
    if (missing.length) {
      const labels = missing.map(([k]) => RISK_FACTORS.find(f => f.key === k)?.label || k).join(', ');
      toast({ title: 'กรุณาใส่ชื่อเกณฑ์ให้ครบ', description: `ยังขาดชื่อในด้าน: ${labels}`, variant: 'destructive' });
      return;
    }
    setSaving(true);
    let error;
    if (editId) {
      // Edit mode targets a single existing row.
      const [dim, det] = entries[0];
      ({ error } = await supabase.from('risk_criteria').update(rowFromDetail(dim, det, 0)).eq('id', editId));
    } else {
      const payload = entries.map(([dim, det], i) => rowFromDetail(dim, det, i));
      ({ error } = await supabase.from('risk_criteria').insert(payload));
    }
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editId ? 'แก้ไขเกณฑ์แล้ว' : `เพิ่ม ${entries.length} เกณฑ์แล้ว` });
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'แก้ไขเกณฑ์' : 'เพิ่มเกณฑ์ใหม่'}</DialogTitle>
            <DialogDescription>
              {editId
                ? 'แก้ไขรายละเอียดเกณฑ์การประเมินความเสี่ยง'
                : 'เลือกหมวด catalog แล้วติ๊กด้านความเสี่ยงที่ต้องการ (เลือกได้หลายด้าน) จากนั้นกรอกรายละเอียดของแต่ละด้าน'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>หมวดหมู่ catalog</Label>
                <Select value={category ?? '_global'} onValueChange={v => setCategory(v === '_global' ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_global">ทุกหมวด (Global)</SelectItem>
                    {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <div className="flex items-center justify-between rounded-lg border p-3 w-full h-10">
                  <Label className="cursor-pointer text-sm">เปิดใช้งาน</Label>
                  <Switch checked={active} onCheckedChange={setActive} />
                </div>
              </div>
            </div>

            <div>
              <Label>ด้านความเสี่ยง {!editId && <span className="text-muted-foreground font-normal">(ติ๊กได้มากกว่า 1 ด้าน)</span>}</Label>
              <div className="mt-2 space-y-2">
                {RISK_FACTORS
                  .filter(f => !editId || f.key in factors)
                  .map(f => {
                    const det = factors[f.key];
                    const checked = !!det;
                    return (
                      <div key={f.key} className={`rounded-lg border p-3 transition-colors ${checked ? 'border-teal-300 bg-teal-50/40' : ''}`}>
                        <div className="flex items-start gap-3">
                          {!editId && (
                            <Checkbox className="mt-0.5" checked={checked} onCheckedChange={v => toggleFactor(f.key, !!v)} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{f.label} <span className="text-muted-foreground font-normal">— {DIMENSION_LABEL[f.key] || f.key}</span></div>
                            <p className="text-[11px] text-muted-foreground">{f.description}</p>
                          </div>
                        </div>

                        {checked && (
                          <div className="mt-3 space-y-3 pl-0 sm:pl-7">
                            <div>
                              <Label className="text-xs">ชื่อเกณฑ์ *</Label>
                              <Input value={det.name_th} placeholder="เช่น แผน HACCP"
                                onChange={e => setDetail(f.key, { name_th: e.target.value })} />
                            </div>
                            <div>
                              <Label className="text-xs">คำอธิบาย</Label>
                              <Textarea rows={2} value={det.description}
                                onChange={e => setDetail(f.key, { description: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">ตรวจจาก</Label>
                                <Select value={det.match_type} onValueChange={v => setDetail(f.key, { match_type: v as FactorDetail['match_type'] })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="certificate">ใบรับรอง (Certificate)</SelectItem>
                                    <SelectItem value="document">เอกสาร (Document)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">น้ำหนัก</Label>
                                <Input type="number" min={0.5} step={0.5} value={det.weight}
                                  onChange={e => setDetail(f.key, { weight: parseFloat(e.target.value) })} />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">คำค้นสำหรับจับคู่ (คั่นด้วยจุลภาค)</Label>
                              <Input value={det.keywordsText} placeholder="haccp, gmp, ใบรับรอง"
                                onChange={e => setDetail(f.key, { keywordsText: e.target.value })} />
                              <p className="text-[11px] text-muted-foreground mt-1">ระบบจะถือว่า "ผ่าน" เมื่อชื่อ{det.match_type === 'certificate' ? 'ใบรับรอง' : 'เอกสาร'}มีคำเหล่านี้คำใดคำหนึ่ง</p>
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-2.5 bg-background">
                              <div>
                                <Label className="cursor-pointer text-xs">เกณฑ์บังคับ (Mandatory)</Label>
                                <p className="text-[11px] text-muted-foreground">หากขาด คะแนนความเสี่ยงด้านนี้จะสูงสุด (10)</p>
                              </div>
                              <Switch checked={det.is_mandatory} onCheckedChange={v => setDetail(f.key, { is_mandatory: v })} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : editId ? 'บันทึก' : `เพิ่ม ${Object.keys(factors).length || ''} เกณฑ์`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
