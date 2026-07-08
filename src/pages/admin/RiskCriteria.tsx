import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Pencil, Trash2, ShieldCheck, FileBadge, FileText, Info, ChevronDown, ChevronUp, Plus, Zap, UserCheck, Calculator, Scale, AlertTriangle, Save, History } from 'lucide-react';
import {
  SUPPLIER_TYPES, SUPPLIER_TYPE_LABEL, BRC_SAFETY_MIN_DEFAULT, BRC_SAFETY_RECOMMENDED,
  type BrcTopic, type BrcOption, type BrcGradeBand, type BrcSupplierType, type BrcCategoryWeight,
} from '@/lib/brcScoring';

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  D: 'bg-red-100 text-red-800 border-red-300',
};

function SourceBadge({ opt, topic }: { opt: BrcOption; topic: BrcTopic }) {
  if (topic.auto_source === 'quotation' || opt.match_type === 'auto') {
    return <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border border-amber-200"><Zap className="w-3 h-3" />Auto จากใบเสนอราคา</Badge>;
  }
  if (opt.match_type === 'certificate') {
    return <Badge variant="secondary" className="text-[10px] gap-1 bg-blue-50 text-blue-700 border border-blue-200"><FileBadge className="w-3 h-3" />Auto จากใบรับรอง</Badge>;
  }
  if (opt.match_type === 'document') {
    return <Badge variant="secondary" className="text-[10px] gap-1 bg-violet-50 text-violet-700 border border-violet-200"><FileText className="w-3 h-3" />Auto จากเอกสาร</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px] gap-1 bg-slate-100 text-slate-600 border border-slate-200"><UserCheck className="w-3 h-3" />ประเมินเอง</Badge>;
}

export default function RiskCriteria() {
  const { toast } = useToast();
  const { hasRole, user, profile } = useAuth();
  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  const [topics, setTopics] = useState<BrcTopic[]>([]);
  const [options, setOptions] = useState<BrcOption[]>([]);
  const [bands, setBands] = useState<BrcGradeBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // Scoring-weight config (BRCGS Clause 3.5.1.3)
  const [weights, setWeights] = useState<Record<string, BrcCategoryWeight>>({});
  const [weightDraft, setWeightDraft] = useState<Record<string, number>>({}); // supplier_type → safety %
  const [minSafety, setMinSafety] = useState<number>(BRC_SAFETY_MIN_DEFAULT);
  const [minDraft, setMinDraft] = useState<number>(BRC_SAFETY_MIN_DEFAULT);
  const [confirmType, setConfirmType] = useState<string | null>(null);
  const [savingWeight, setSavingWeight] = useState(false);
  const [audit, setAudit] = useState<any[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);

  // Option edit dialog
  const [editOpt, setEditOpt] = useState<BrcOption | null>(null);
  const [optForm, setOptForm] = useState({ label: '', score: 0, keywordsText: '' });
  const [saving, setSaving] = useState(false);

  // Add option dialog
  const [addTopic, setAddTopic] = useState<BrcTopic | null>(null);
  const [addForm, setAddForm] = useState({ label: '', score: 0, match_type: 'certificate', keywordsText: '' });

  const load = async () => {
    setLoading(true);
    const [tRes, oRes, bRes, wRes, sRes] = await Promise.all([
      supabase.from('brc_topics' as any).select('*').order('sort_order'),
      supabase.from('brc_options' as any).select('*').order('sort_order'),
      supabase.from('brc_grade_bands' as any).select('*').order('min_score', { ascending: false }),
      supabase.from('brc_weight_config' as any).select('*'),
      supabase.from('system_settings').select('value').eq('key', 'brc_safety_min_weight').maybeSingle(),
    ]);
    setTopics((tRes.data as unknown as BrcTopic[]) || []);
    setOptions((oRes.data as unknown as BrcOption[]) || []);
    setBands((bRes.data as unknown as BrcGradeBand[]) || []);
    const w = (wRes.data as unknown as BrcCategoryWeight[]) || [];
    const wm: Record<string, BrcCategoryWeight> = {};
    const wd: Record<string, number> = {};
    w.forEach(x => { wm[x.supplier_type] = x; wd[x.supplier_type] = x.safety_weight; });
    setWeights(wm); setWeightDraft(wd);
    const min = (sRes.data?.value as any)?.min ?? BRC_SAFETY_MIN_DEFAULT;
    setMinSafety(min); setMinDraft(min);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadAudit = async () => {
    const { data } = await supabase.from('brc_weight_audit' as any)
      .select('*').order('changed_at', { ascending: false }).limit(50);
    setAudit((data as any[]) || []);
    setAuditOpen(true);
  };

  // Current implicit safety weight from topic target_score sums (for reference).
  const implicitSafetyPct = (st: string): number => {
    const ts = topics.filter(t => t.active && t.supplier_type === st);
    const total = ts.reduce((a, t) => a + Number(t.target_score), 0);
    const safety = ts.filter(t => t.criterion_group !== 'commercial').reduce((a, t) => a + Number(t.target_score), 0);
    return total > 0 ? Math.round((safety / total) * 100) : 0;
  };

  const saveMin = async () => {
    const v = Math.max(0, Math.min(100, minDraft));
    const { error } = await supabase.from('system_settings').upsert(
      { key: 'brc_safety_min_weight', value: { min: v, recommended: BRC_SAFETY_RECOMMENDED } as any, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' },
    );
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    setMinSafety(v);
    toast({ title: 'บันทึกค่าขั้นต่ำแล้ว', description: `ความปลอดภัยขั้นต่ำ ${v}%` });
  };

  const doSaveWeight = async (st: string) => {
    const safety = Math.max(0, Math.min(100, Math.round(weightDraft[st] ?? 60)));
    const commercial = 100 - safety;
    setSavingWeight(true);
    const prev = weights[st];
    const { error } = await supabase.from('brc_weight_config' as any).upsert({
      supplier_type: st, safety_weight: safety, commercial_weight: commercial,
      updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: 'supplier_type' });
    if (error) { setSavingWeight(false); setConfirmType(null); toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    // Audit trail
    await supabase.from('brc_weight_audit' as any).insert({
      supplier_type: st,
      old_safety: prev?.safety_weight ?? null, old_commercial: prev?.commercial_weight ?? null,
      new_safety: safety, new_commercial: commercial,
      changed_by: user?.id ?? null, changed_by_email: profile?.email ?? null,
    });
    setSavingWeight(false); setConfirmType(null);
    toast({ title: 'บันทึกน้ำหนักแล้ว', description: `${SUPPLIER_TYPE_LABEL[st as BrcSupplierType]} — ความปลอดภัย ${safety}% / เชิงพาณิชย์ ${commercial}% · คะแนนผู้ขายถูกคำนวณใหม่แล้ว` });
    load();
  };

  const optionsByTopic = useMemo(() => {
    const m: Record<string, BrcOption[]> = {};
    options.forEach(o => (m[o.topic_id] ??= []).push(o));
    return m;
  }, [options]);

  const openEditOpt = (o: BrcOption) => {
    setEditOpt(o);
    setOptForm({ label: o.label, score: o.score, keywordsText: (o.match_keywords || []).join(', ') });
  };

  const saveOpt = async () => {
    if (!editOpt) return;
    setSaving(true);
    const { error } = await supabase.from('brc_options' as any).update({
      label: optForm.label,
      score: Number(optForm.score) || 0,
      match_keywords: optForm.keywordsText.split(',').map(s => s.trim()).filter(Boolean),
    }).eq('id', editOpt.id);
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'บันทึกแล้ว' });
    setEditOpt(null); load();
  };

  const saveNewOpt = async () => {
    if (!addTopic || !addForm.label.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('brc_options' as any).insert({
      topic_id: addTopic.id,
      label: addForm.label.trim(),
      score: Number(addForm.score) || 0,
      match_type: addForm.match_type,
      match_keywords: addForm.keywordsText.split(',').map(s => s.trim()).filter(Boolean),
      sort_order: ((optionsByTopic[addTopic.id] || []).length + 1) * 10,
    });
    setSaving(false);
    if (error) { toast({ title: 'เพิ่มไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'เพิ่มตัวเลือกแล้ว' });
    setAddTopic(null); setAddForm({ label: '', score: 0, match_type: 'certificate', keywordsText: '' }); load();
  };

  const removeOpt = async (id: string) => {
    const { error } = await supabase.from('brc_options' as any).delete().eq('id', id);
    if (error) { toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'ลบแล้ว' }); load();
  };

  const toggleTopic = async (t: BrcTopic, active: boolean) => {
    await supabase.from('brc_topics' as any).update({ active }).eq('id', t.id);
    load();
  };

  const toggleMandatory = async (o: BrcOption) => {
    const { error } = await supabase.from('brc_options' as any).update({ is_mandatory: !o.is_mandatory }).eq('id', o.id);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: !o.is_mandatory ? 'ตั้งเป็นเอกสารบังคับแล้ว' : 'ยกเลิกบังคับแล้ว' });
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-teal-600" />เกณฑ์ประเมิน Supplier (BRCGS Standard)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            มาตรฐานการอนุมัติผู้ขายตาม BRCGS — ระบบให้คะแนน<b>อัตโนมัติ</b>จากใบรับรอง เอกสาร และใบเสนอราคา
            ส่วนที่ต้องประเมินเอง (Audit, ประสบการณ์) บันทึกครั้งเดียวใช้ได้ทุก RFQ
          </p>
        </div>
      </div>

      {/* Scoring guide */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-0">
          <button onClick={() => setGuideOpen(!guideOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50/50 transition-colors rounded-lg">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">วิธีการประเมินอัตโนมัติ</span>
            </div>
            {guideOpen ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
          </button>
          {guideOpen && (
            <div className="px-4 pb-4 grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <FileBadge className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <p><b>Auto จากใบรับรอง</b> — จับคู่ชื่อใบรับรองของ supplier (GFSI, ISO22000, HACCP, Halal ฯลฯ) เช็ควันหมดอายุอัตโนมัติ ใบหมดอายุ = ไม่นับ</p>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
                  <p><b>Auto จากเอกสาร</b> — จับคู่เอกสารที่อัปโหลด (Spec/TDS, COA, Test report, Allergen, MSDS ฯลฯ)</p>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <p><b>Auto จากใบเสนอราคา</b> — Pricing (ราคาต่ำสุด=เต็ม, สูงกว่าไม่เกิน 10%=กลาง), Delivery (lead time), Credit term (≥30 วัน=เต็ม) คำนวณตอนเปรียบเทียบราคาใน RFQ</p>
                </div>
                <div className="flex items-start gap-2">
                  <UserCheck className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                  <p><b>ประเมินเอง</b> — Audit score, Product risk assessment, ประสบการณ์, Material testing — เลือกครั้งเดียวในหน้า Supplier แล้วระบบจำไว้</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Calculator className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                  <div>
                    <p><b>การให้เกรด</b> — รวมคะแนนทุกหัวข้อ เทียบช่วงคะแนนตามประเภท supplier:</p>
                    <p className="text-xs text-muted-foreground mt-1">A = Preferred (พิจารณาพิเศษ) · B = Approved (อนุมัติ) · C = Restricted (มีข้อจำกัด) · D = Unsuitable (ไม่เหมาะสม)</p>
                    <p className="text-xs text-muted-foreground mt-1">หัวข้อที่ยังประเมินไม่ได้ (รอใบเสนอราคา/รอประเมิน) จะถูกตัดออกจากคะแนนเต็มชั่วคราว เพื่อให้เกรดยุติธรรม</p>
                    <p className="text-xs text-muted-foreground mt-1">ใน RFQ: ผู้ใช้กรอกแค่ใบเสนอราคา + Technical score — ส่วน Risk ระบบประเมิน auto ทั้งหมด</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BRCGS Clause 3.5.1.3 — safety-weight guard */}
      <Card className="border-teal-200 bg-teal-50/30">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-2">
              <Scale className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-teal-900">สมดุลน้ำหนักคะแนน — BRCGS Clause 3.5.1.3</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                  เกณฑ์ด้านความปลอดภัย/คุณภาพต้องมีน้ำหนักไม่น้อยกว่าเกณฑ์เชิงพาณิชย์ (ราคา/ส่งมอบ/เครดิต) — กำหนดสัดส่วนต่อหมวดผู้ขายในแต่ละแท็บด้านล่าง
                </p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">ความปลอดภัยขั้นต่ำ (%)</Label>
                <Input type="number" min={0} max={100} value={minDraft}
                  onChange={e => setMinDraft(parseInt(e.target.value) || 0)}
                  disabled={!canEdit} className="h-8 w-24" />
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" className="h-8" disabled={minDraft === minSafety} onClick={saveMin}>
                  <Save className="w-3.5 h-3.5 mr-1" />บันทึก
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8" onClick={loadAudit}>
                <History className="w-3.5 h-3.5 mr-1" />ประวัติ
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={SUPPLIER_TYPES[0]}>
        <TabsList className="flex-wrap h-auto">
          {SUPPLIER_TYPES.map(st => (
            <TabsTrigger key={st} value={st} className="text-xs">{SUPPLIER_TYPE_LABEL[st].split('(')[0].trim()}</TabsTrigger>
          ))}
        </TabsList>

        {SUPPLIER_TYPES.map(st => {
          const typeTopics = topics.filter(t => t.supplier_type === st);
          const typeBands = bands.filter(b => b.supplier_type === st);
          const maxTotal = typeTopics.filter(t => t.active).reduce((a, t) => a + Number(t.target_score), 0);
          const sections = Array.from(new Set(typeTopics.map(t => t.section)));
          const safetyPct = weightDraft[st] ?? 60;
          const commercialPct = 100 - safetyPct;
          const belowMin = safetyPct < minSafety;
          const saved = weights[st];
          const dirty = !saved || saved.safety_weight !== safetyPct;
          return (
            <TabsContent key={st} value={st} className="space-y-4">
              {/* Scoring-weight balance */}
              <Card className={belowMin ? 'border-red-300' : 'border-teal-200'}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-teal-700" />สัดส่วนน้ำหนักคะแนน
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ปัจจุบันจากคะแนนดิบ: ความปลอดภัย {implicitSafetyPct(st)}%
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center justify-between">
                        <span>ความปลอดภัย & คุณภาพ</span>
                        <span className="font-semibold text-emerald-700">{safetyPct}%</span>
                      </Label>
                      <input type="range" min={0} max={100} value={safetyPct} disabled={!canEdit}
                        onChange={e => setWeightDraft(p => ({ ...p, [st]: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-600" />
                      <div className="flex h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500" style={{ width: `${safetyPct}%` }} />
                        <div className="bg-sky-500" style={{ width: `${commercialPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span className="text-emerald-700">ความปลอดภัย {safetyPct}%</span>
                        <span className="text-sky-700">เชิงพาณิชย์ {commercialPct}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">ความปลอดภัย %</Label>
                        <Input type="number" min={0} max={100} value={safetyPct} disabled={!canEdit}
                          onChange={e => setWeightDraft(p => ({ ...p, [st]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                          className="h-9 w-24" />
                      </div>
                      {canEdit && (
                        <Button size="sm" className="h-9 mt-5" disabled={!dirty || belowMin}
                          onClick={() => setConfirmType(st)}>
                          <Save className="w-3.5 h-3.5 mr-1" />บันทึก
                        </Button>
                      )}
                    </div>
                  </div>

                  {belowMin && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        น้ำหนักความปลอดภัย ({safetyPct}%) ต่ำกว่าค่าขั้นต่ำ {minSafety}% — <b>ขัดต่อ BRCGS Clause 3.5.1.3</b>
                        {' '}ที่กำหนดว่าเกณฑ์ความปลอดภัยต้องไม่ด้อยกว่าเกณฑ์เชิงพาณิชย์ กรุณาเพิ่มน้ำหนักก่อนบันทึก
                      </span>
                    </div>
                  )}
                  {commercialPct === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      เชิงพาณิชย์ 0% — เกรด BRCGS คิดจากความปลอดภัย/คุณภาพล้วน · ราคา/ส่งมอบ/เครดิต ประเมินแยกที่เสา Commercial ตอนเปรียบเทียบราคาใน RFQ จึงไม่นับซ้ำ
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Grade bands */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-semibold">{SUPPLIER_TYPE_LABEL[st]} — คะแนนเต็ม {maxTotal}</p>
                    <div className="flex gap-2 flex-wrap">
                      {typeBands.map(b => (
                        <Badge key={b.grade} variant="outline" className={`${GRADE_COLOR[b.grade]} text-xs`}>
                          {b.grade}: {b.min_score}–{b.max_score}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <span>ตัวเลือกที่ตั้ง <b className="text-red-700">บังคับ</b> = supplier ต้องมีอย่างน้อย 1 ตัวเลือกบังคับต่อหัวข้อ (จับคู่ใบรับรอง/เอกสาร + ไม่หมดอายุ) ไม่งั้นจะเลือกเข้า RFQ หมวดนี้ไม่ได้ — และ<b>ไม่คิดคะแนน rate</b> (เป็นด่านเข้าล้วนๆ เพราะทุกรายที่เข้ามาต้องมีอยู่แล้ว)</span>
              </p>

              {sections.map(section => (
                <div key={section} className="space-y-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section}</h2>
                  {typeTopics.filter(t => t.section === section).map(t => (
                    <Card key={t.id} className={!t.active ? 'opacity-50' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{t.topic}</span>
                            <Badge variant="outline" className="text-[10px]">เต็ม {Number(t.target_score)}</Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              {t.scoring_mode === 'best_match' ? 'เลือกคะแนนสูงสุดที่เข้าเกณฑ์' : 'บวกสะสมทุกข้อที่มี'}
                            </Badge>
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                onClick={() => { setAddTopic(t); setAddForm({ label: '', score: 0, match_type: t.auto_source === 'quotation' ? 'auto' : 'certificate', keywordsText: '' }); }}>
                                <Plus className="w-3 h-3" />ตัวเลือก
                              </Button>
                              <Switch checked={t.active} onCheckedChange={v => toggleTopic(t, v)} />
                            </div>
                          )}
                        </div>
                        <div className="divide-y">
                          {(optionsByTopic[t.id] || []).map(o => (
                            <div key={o.id} className="flex items-center gap-3 py-2">
                              <span className={`font-mono font-semibold text-sm w-8 text-right shrink-0 ${o.is_mandatory ? 'text-muted-foreground/40' : ''}`} title={o.is_mandatory ? 'บังคับ — ไม่คิดคะแนน' : undefined}>
                                {o.is_mandatory ? '—' : Number(o.score)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm">{o.label}</span>
                                  <SourceBadge opt={o} topic={t} />
                                  {o.is_mandatory && (
                                    <Badge variant="outline" className="text-[10px] gap-1 border-red-300 bg-red-50 text-red-700">
                                      <AlertTriangle className="w-3 h-3" />บังคับ
                                    </Badge>
                                  )}
                                </div>
                                {o.match_keywords?.length > 0 && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    คำค้น: {o.match_keywords.map(k => <code key={k} className="bg-muted px-1 rounded mr-1">{k}</code>)}
                                  </p>
                                )}
                                {o.requirement && <p className="text-[11px] text-muted-foreground mt-0.5">{o.requirement}</p>}
                              </div>
                              {canEdit && (
                                <div className="flex items-center shrink-0">
                                  {t.auto_source !== 'quotation' && (
                                    <button
                                      onClick={() => toggleMandatory(o)}
                                      title="บังคับต้องมี — ถ้าขาด supplier จะเข้าร่วม RFQ หมวดนี้ไม่ได้"
                                      className={`text-[10px] px-1.5 py-0.5 rounded border mr-1 transition-colors ${o.is_mandatory ? 'border-red-300 bg-red-50 text-red-700' : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted'}`}
                                    >
                                      {o.is_mandatory ? 'บังคับ' : 'ตั้งบังคับ'}
                                    </button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditOpt(o)}><Pencil className="w-3.5 h-3.5" /></Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7"><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>ลบตัวเลือกนี้?</AlertDialogTitle>
                                        <AlertDialogDescription>"{o.label}" จะถูกลบถาวร</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => removeOpt(o.id)} className="bg-red-600 hover:bg-red-700">ลบ</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ))}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Edit option dialog */}
      <Dialog open={!!editOpt} onOpenChange={v => !v && setEditOpt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขตัวเลือก</DialogTitle>
            <DialogDescription>ปรับชื่อ คะแนน หรือคำค้นสำหรับจับคู่อัตโนมัติ</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ชื่อ</Label>
              <Input value={optForm.label} onChange={e => setOptForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div>
              <Label>คะแนน</Label>
              <Input type="number" value={optForm.score} onChange={e => setOptForm(p => ({ ...p, score: parseFloat(e.target.value) || 0 }))} />
            </div>
            {editOpt && (editOpt.match_type === 'certificate' || editOpt.match_type === 'document') && (
              <div>
                <Label>คำค้นจับคู่ (คั่นด้วยจุลภาค)</Label>
                <Input value={optForm.keywordsText} onChange={e => setOptForm(p => ({ ...p, keywordsText: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  ระบบถือว่า "ผ่าน" เมื่อชื่อ{editOpt.match_type === 'certificate' ? 'ใบรับรอง' : 'เอกสาร'}มีคำใดคำหนึ่ง
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpt(null)}>ยกเลิก</Button>
            <Button onClick={saveOpt} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add option dialog */}
      <Dialog open={!!addTopic} onOpenChange={v => !v && setAddTopic(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มตัวเลือก — {addTopic?.topic}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ชื่อ *</Label>
              <Input value={addForm.label} onChange={e => setAddForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>คะแนน</Label>
                <Input type="number" value={addForm.score} onChange={e => setAddForm(p => ({ ...p, score: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>ตรวจจาก</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
                  value={addForm.match_type} onChange={e => setAddForm(p => ({ ...p, match_type: e.target.value }))}>
                  <option value="certificate">ใบรับรอง (auto)</option>
                  <option value="document">เอกสาร (auto)</option>
                  <option value="manual">ประเมินเอง</option>
                </select>
              </div>
            </div>
            {addForm.match_type !== 'manual' && (
              <div>
                <Label>คำค้นจับคู่ (คั่นด้วยจุลภาค)</Label>
                <Input value={addForm.keywordsText} onChange={e => setAddForm(p => ({ ...p, keywordsText: e.target.value }))} placeholder="เช่น halal, ฮาลาล" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTopic(null)}>ยกเลิก</Button>
            <Button onClick={saveNewOpt} disabled={saving || !addForm.label.trim()}>{saving ? 'กำลังเพิ่ม...' : 'เพิ่ม'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm weight change (scores recalculated) */}
      <AlertDialog open={!!confirmType} onOpenChange={v => !v && setConfirmType(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการเปลี่ยนน้ำหนักคะแนน</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmType && (
                <>
                  หมวด <b>{SUPPLIER_TYPE_LABEL[confirmType as BrcSupplierType]}</b> — ตั้งน้ำหนัก
                  ความปลอดภัย <b>{weightDraft[confirmType] ?? 60}%</b> / เชิงพาณิชย์ <b>{100 - (weightDraft[confirmType] ?? 60)}%</b>
                  <br /><br />
                  คะแนนและเกรดของผู้ขายทุกรายในหมวดนี้จะถูก<b>คำนวณใหม่</b>ทันที และการเปลี่ยนแปลงจะถูกบันทึกใน Audit Log
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingWeight}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction disabled={savingWeight} onClick={() => confirmType && doSaveWeight(confirmType)}>
              {savingWeight ? 'กำลังบันทึก...' : 'ยืนยันและคำนวณใหม่'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Audit history */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" />ประวัติการเปลี่ยนน้ำหนักคะแนน</DialogTitle>
            <DialogDescription>บันทึกการเปลี่ยนแปลงน้ำหนักตาม BRCGS Clause 3.5.1.3 พร้อมผู้ใช้และเวลา</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-left p-2">หมวด</th>
                    <th className="text-left p-2">เดิม → ใหม่ (ความปลอดภัย)</th>
                    <th className="text-left p-2">โดย</th>
                    <th className="text-left p-2">เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map(a => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-2">{SUPPLIER_TYPE_LABEL[a.supplier_type as BrcSupplierType]?.split('(')[0].trim() || a.supplier_type}</td>
                      <td className="p-2">
                        <span className="text-muted-foreground">{a.old_safety != null ? `${a.old_safety}%` : '—'}</span>
                        {' → '}<b>{a.new_safety}%</b>
                      </td>
                      <td className="p-2 text-muted-foreground text-xs">{a.changed_by_email || '—'}</td>
                      <td className="p-2 text-muted-foreground text-xs">{new Date(a.changed_at).toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
