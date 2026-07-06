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
import { Pencil, Trash2, ShieldCheck, FileBadge, FileText, Info, ChevronDown, ChevronUp, Plus, Zap, UserCheck, Calculator } from 'lucide-react';
import {
  SUPPLIER_TYPES, SUPPLIER_TYPE_LABEL,
  type BrcTopic, type BrcOption, type BrcGradeBand, type BrcSupplierType,
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
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  const [topics, setTopics] = useState<BrcTopic[]>([]);
  const [options, setOptions] = useState<BrcOption[]>([]);
  const [bands, setBands] = useState<BrcGradeBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // Option edit dialog
  const [editOpt, setEditOpt] = useState<BrcOption | null>(null);
  const [optForm, setOptForm] = useState({ label: '', score: 0, keywordsText: '' });
  const [saving, setSaving] = useState(false);

  // Add option dialog
  const [addTopic, setAddTopic] = useState<BrcTopic | null>(null);
  const [addForm, setAddForm] = useState({ label: '', score: 0, match_type: 'certificate', keywordsText: '' });

  const load = async () => {
    setLoading(true);
    const [tRes, oRes, bRes] = await Promise.all([
      supabase.from('brc_topics' as any).select('*').order('sort_order'),
      supabase.from('brc_options' as any).select('*').order('sort_order'),
      supabase.from('brc_grade_bands' as any).select('*').order('min_score', { ascending: false }),
    ]);
    setTopics((tRes.data as unknown as BrcTopic[]) || []);
    setOptions((oRes.data as unknown as BrcOption[]) || []);
    setBands((bRes.data as unknown as BrcGradeBand[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
          return (
            <TabsContent key={st} value={st} className="space-y-4">
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
                              <span className="font-mono font-semibold text-sm w-8 text-right shrink-0">{Number(o.score)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm">{o.label}</span>
                                  <SourceBadge opt={o} topic={t} />
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
    </div>
  );
}
