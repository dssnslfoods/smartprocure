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
import { Pencil, Trash2, ShieldCheck, FileBadge, FileText, Info, ChevronDown, ChevronUp, Plus, Zap, UserCheck, Calculator, Scale, AlertTriangle, Save, History, Settings } from 'lucide-react';
import {
  loadSupplierTypes, BRC_SAFETY_MIN_DEFAULT, BRC_SAFETY_RECOMMENDED,
  type BrcTopic, type BrcOption, type BrcGradeBand, type BrcSupplierType, type BrcCategoryWeight, type BrcSupplierTypeRow,
} from '@/lib/brcScoring';
import {
  achievableMax, needsRebalance, buildScaleSuggestion, suggestBands, type BandDraft,
} from '@/lib/brcRebalance';

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  D: 'bg-red-100 text-red-800 border-red-300',
};

function SourceBadge({ opt, topic }: { opt: BrcOption; topic: BrcTopic }) {
  // Only a quotation-driven TOPIC is scored from the quotation. An 'auto' option
  // sitting in an evidence topic is never matched, so it must not claim to be.
  if (topic.auto_source === 'quotation') {
    return <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border border-amber-200"><Zap className="w-3 h-3" />Auto จากใบเสนอราคา</Badge>;
  }
  if (opt.match_type === 'auto') {
    return <Badge variant="secondary" className="text-[10px] gap-1 bg-red-50 text-red-700 border border-red-200"><AlertTriangle className="w-3 h-3" />ตั้งค่าไม่ถูกต้อง — จับคู่ไม่ได้</Badge>;
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
  const [typeRows, setTypeRows] = useState<BrcSupplierTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // Admin-managed supplier type list (see brc_supplier_types) — shadows what
  // used to be the hardcoded SUPPLIER_TYPES/SUPPLIER_TYPE_LABEL constants so
  // every existing reference below keeps working unchanged.
  const SUPPLIER_TYPES = useMemo(() => typeRows.filter(t => t.active).map(t => t.key), [typeRows]);
  const SUPPLIER_TYPE_LABEL = useMemo(
    () => Object.fromEntries(typeRows.map(t => [t.key, t.label_th])) as Record<string, string>,
    [typeRows],
  );

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
  const [optForm, setOptForm] = useState({ label: '', score: 0, keywordsText: '', requirement: '' });
  const [saving, setSaving] = useState(false);

  // Add option dialog
  const [addTopic, setAddTopic] = useState<BrcTopic | null>(null);
  const [addForm, setAddForm] = useState({ label: '', score: 0, match_type: 'certificate', keywordsText: '', is_mandatory: false, requirement: '' });

  // Add new criterion (topic) dialog
  const [addTopicType, setAddTopicType] = useState<string | null>(null); // supplier_type
  const [newTopic, setNewTopic] = useState<{
    section: string; topic: string; target_score: number;
    scoring_mode: 'best_match' | 'additive';
    criterion_group: 'safety_quality' | 'commercial';
    auto_source: 'manual' | 'evidence' | 'quotation';
    quotation_field: 'price' | 'delivery' | 'credit' | null;
  }>({
    section: '', topic: '', target_score: 10, scoring_mode: 'best_match',
    criterion_group: 'safety_quality', auto_source: 'manual', quotation_field: null,
  });

  /** The engine can only derive three things from a quotation, and each may be
   *  used by at most one topic per supplier type. */
  const QUOTATION_FIELDS = [
    { value: 'price' as const, label: 'ราคา (เทียบกับข้อเสนอที่ต่ำสุดในรอบนั้น)' },
    { value: 'delivery' as const, label: 'การส่งมอบ (เทียบ Lead time ที่เร็วที่สุด)' },
    { value: 'credit' as const, label: 'เครดิตเทอม (เกณฑ์ 30 วัน)' },
  ];
  const usedQuotationFields = (st: string | null) => new Set(
    topics.filter(t => t.supplier_type === st && t.active && t.quotation_field)
      .map(t => t.quotation_field as string),
  );

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [tRes, oRes, bRes, wRes, sRes, typesRes] = await Promise.all([
      supabase.from('brc_topics' as any).select('*').order('sort_order'),
      supabase.from('brc_options' as any).select('*').order('sort_order'),
      supabase.from('brc_grade_bands' as any).select('*').order('min_score', { ascending: false }),
      supabase.from('brc_weight_config' as any).select('*'),
      supabase.from('system_settings').select('value').eq('key', 'brc_safety_min_weight').maybeSingle(),
      loadSupplierTypes(true),
    ]);
    setTopics((tRes.data as unknown as BrcTopic[]) || []);
    setOptions((oRes.data as unknown as BrcOption[]) || []);
    setBands((bRes.data as unknown as BrcGradeBand[]) || []);
    setTypeRows(typesRes);
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
    load(true);
  };

  const optionsByTopic = useMemo(() => {
    const m: Record<string, BrcOption[]> = {};
    options.forEach(o => (m[o.topic_id] ??= []).push(o));
    return m;
  }, [options]);

  const openEditOpt = (o: BrcOption) => {
    setEditOpt(o);
    setOptForm({ label: o.label, score: o.score, keywordsText: (o.match_keywords || []).join(', '), requirement: o.requirement || '' });
  };

  const saveOpt = async () => {
    if (!editOpt) return;
    setSaving(true);
    const { error } = await supabase.from('brc_options' as any).update({
      label: optForm.label,
      score: Number(optForm.score) || 0,
      match_keywords: optForm.keywordsText.split(',').map(s => s.trim()).filter(Boolean),
      requirement: optForm.requirement.trim() || null,
    }).eq('id', editOpt.id);
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    const parent = topics.find(t => t.id === editOpt.topic_id);
    if (parent) {
      await logCriteria('update_option', parent.supplier_type,
        `แก้ไขตัวเลือก "${editOpt.label}" ในหัวข้อ "${parent.topic}"`,
        { option: editOpt }, { label: optForm.label, score: Number(optForm.score) || 0, requirement: optForm.requirement.trim() || null });
    }
    toast({ title: 'บันทึกแล้ว' });
    setEditOpt(null); load(true);
  };

  const saveNewOpt = async () => {
    if (!addTopic || !addForm.label.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from('brc_options' as any).insert({
      topic_id: addTopic.id,
      label: addForm.label.trim(),
      score: Number(addForm.score) || 0,
      match_type: addForm.match_type,
      match_keywords: addForm.keywordsText.split(',').map(s => s.trim()).filter(Boolean),
      is_mandatory: addForm.is_mandatory,
      requirement: addForm.requirement.trim() || null,
      sort_order: ((optionsByTopic[addTopic.id] || []).length + 1) * 10,
    }).select('id').single();
    setSaving(false);
    if (error) { toast({ title: 'เพิ่มไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    const parent = topics.find(t => t.id === addTopic.id);
    if (parent) {
      await logCriteria('add_option', parent.supplier_type,
        `เพิ่มตัวเลือก "${addForm.label.trim()}" ในหัวข้อ "${parent.topic}"`,
        null, { created_option_id: (data as any)?.id ?? null });
    }
    toast({ title: 'เพิ่มตัวเลือกแล้ว' });
    setAddTopic(null); setAddForm({ label: '', score: 0, match_type: 'certificate', keywordsText: '', is_mandatory: false, requirement: '' }); load(true);
  };

  // Deleting a topic cascades to its options, manual scores and evidence rows,
  // so the confirmation shows exactly what will be lost.
  const [delTopic, setDelTopic] = useState<
    { topic: BrcTopic; options: number; manual: number; evidence: number } | null
  >(null);

  const askDeleteTopic = async (t: BrcTopic) => {
    const [m, e] = await Promise.all([
      supabase.from('brc_manual_scores' as any).select('*', { count: 'exact', head: true }).eq('topic_id', t.id),
      supabase.from('brc_evidence' as any).select('*', { count: 'exact', head: true }).eq('topic_id', t.id),
    ]);
    setDelTopic({
      topic: t,
      options: (optionsByTopic[t.id] || []).length,
      manual: m.count ?? 0,
      evidence: e.count ?? 0,
    });
  };

  // ── Criteria audit log ────────────────────────────────────────────────────
  const [critLog, setCritLog] = useState<any[]>([]);
  const [critLogOpen, setCritLogOpen] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const loadCritLog = async () => {
    const { data } = await supabase.from('brc_criteria_audit' as any)
      .select('*').order('changed_at', { ascending: false }).limit(100);
    setCritLog((data as any[]) || []);
    setCritLogOpen(true);
  };

  const logCriteria = (
    action: string, st: string, summary: string,
    before: unknown, after: unknown,
  ) => supabase.from('brc_criteria_audit' as any).insert({
    supplier_type: st, action, summary,
    before_state: before as any, after_state: after as any,
    changed_by: user?.id ?? null, changed_by_email: profile?.email ?? null,
  });

  // ── Supplier type (catalog/BRC category) management ─────────────────────
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [newTypeForm, setNewTypeForm] = useState({ key: '', label_th: '' });
  const [savingType, setSavingType] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [deleteTypeTarget, setDeleteTypeTarget] = useState<BrcSupplierTypeRow | null>(null);
  const [deleteTypeBlock, setDeleteTypeBlock] = useState<{ topics: number; suppliers: number } | null>(null);
  const [deletingType, setDeletingType] = useState(false);

  const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

  const addSupplierType = async () => {
    const key = newTypeForm.key.trim();
    const label = newTypeForm.label_th.trim();
    if (!KEY_PATTERN.test(key) || !label) return;
    setSavingType(true);
    const sortOrder = (typeRows.reduce((mx, t) => Math.max(mx, t.sort_order), 0) || 0) + 10;
    const { error } = await supabase.from('brc_supplier_types' as any).insert({ key, label_th: label, sort_order: sortOrder });
    if (error) {
      setSavingType(false);
      toast({ title: 'เพิ่มหมวดไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    // Best-effort: also let this key be picked as a Catalog category. If it
    // fails, the type is still fully usable for BRC criteria/assessment.
    const { error: rpcErr } = await supabase.rpc('add_catalog_category_value' as any, { p_value: key });
    if (rpcErr) {
      toast({ title: 'เพิ่มหมวดสำเร็จ แต่เชื่อมกับ Catalog ไม่สำเร็จ', description: rpcErr.message, variant: 'destructive' });
    }
    await logCriteria('add_supplier_type', key, `เพิ่มหมวดผู้ขาย "${label}" (${key})`, null, { key, label_th: label });
    setSavingType(false);
    setNewTypeForm({ key: '', label_th: '' });
    toast({ title: 'เพิ่มหมวดผู้ขายแล้ว' });
    load(true);
  };

  const saveTypeLabel = async (t: BrcSupplierTypeRow) => {
    const label = (labelDrafts[t.id] ?? t.label_th).trim();
    if (!label || label === t.label_th) return;
    const { error } = await supabase.from('brc_supplier_types' as any).update({ label_th: label }).eq('id', t.id);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    await logCriteria('update_supplier_type', t.key, `แก้ไขชื่อหมวด "${t.label_th}" → "${label}"`, { label_th: t.label_th }, { label_th: label });
    toast({ title: 'บันทึกแล้ว' });
    load(true);
  };

  const toggleTypeActive = async (t: BrcSupplierTypeRow) => {
    const { error } = await supabase.from('brc_supplier_types' as any).update({ active: !t.active }).eq('id', t.id);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    await logCriteria('update_supplier_type', t.key, `${t.active ? 'ปิด' : 'เปิด'}ใช้งานหมวด "${t.label_th}"`, { active: t.active }, { active: !t.active });
    load(true);
  };

  const askDeleteType = async (t: BrcSupplierTypeRow) => {
    const [topicsRes, suppliersRes] = await Promise.all([
      supabase.from('brc_topics' as any).select('*', { count: 'exact', head: true }).eq('supplier_type', t.key),
      supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('brc_supplier_type', t.key),
    ]);
    const nTopics = topicsRes.count ?? 0;
    const nSuppliers = suppliersRes.count ?? 0;
    if (nTopics > 0 || nSuppliers > 0) {
      setDeleteTypeTarget(t);
      setDeleteTypeBlock({ topics: nTopics, suppliers: nSuppliers });
    } else {
      setDeleteTypeTarget(t);
      setDeleteTypeBlock(null);
    }
  };

  const confirmDeleteType = async () => {
    if (!deleteTypeTarget || deleteTypeBlock) return;
    setDeletingType(true);
    const { error } = await supabase.from('brc_supplier_types' as any).delete().eq('id', deleteTypeTarget.id);
    setDeletingType(false);
    if (error) { toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    await logCriteria('delete_supplier_type', deleteTypeTarget.key, `ลบหมวดผู้ขาย "${deleteTypeTarget.label_th}"`, { row: deleteTypeTarget }, null);
    toast({ title: 'ลบหมวดแล้ว' });
    setDeleteTypeTarget(null);
    load(true);
  };

  /** Snapshot every topic + band of a supplier type (what a rebalance can touch). */
  const snapshotType = (st: string) => ({
    topics: topics.filter(t => t.supplier_type === st)
      .map(t => ({ ...t, target_score: Number(t.target_score) })),
    bands: bands.filter(b => b.supplier_type === st)
      .map(b => ({ grade: b.grade, min_score: b.min_score, max_score: b.max_score })),
  });

  const rollbackCriteria = async (entry: any) => {
    setRollingBack(entry.id);
    try {
      const before = entry.before_state || {};
      const st = entry.supplier_type;

      if (entry.action === 'add_topic') {
        // Undo = remove the topic that was created.
        const createdId = entry.after_state?.created_topic_id;
        if (createdId) {
          const { error } = await supabase.from('brc_topics' as any).delete().eq('id', createdId);
          if (error) throw error;
        }
      }

      if (entry.action === 'delete_topic' || entry.action === 'delete_option') {
        // Undo = put the removed rows back, original ids included.
        if (before.topic) {
          const { error } = await supabase.from('brc_topics' as any).insert(before.topic);
          if (error) throw error;
        }
        if (before.options?.length) {
          const { error } = await supabase.from('brc_options' as any).insert(before.options);
          if (error) throw error;
        }
        if (before.manual_scores?.length) {
          await supabase.from('brc_manual_scores' as any).insert(before.manual_scores);
        }
        if (before.evidence?.length) {
          await supabase.from('brc_evidence' as any).insert(before.evidence);
        }
      }

      if (entry.action === 'add_option') {
        const createdId = entry.after_state?.created_option_id;
        if (createdId) {
          const { error } = await supabase.from('brc_options' as any).delete().eq('id', createdId);
          if (error) throw error;
        }
      }

      if (entry.action === 'update_option' && before.option) {
        const { id, ...rest } = before.option;
        const { error } = await supabase.from('brc_options' as any).update(rest).eq('id', id);
        if (error) throw error;
      }

      // Restore the marks and bands captured at the time of the change.
      if (before.topics?.length) {
        await Promise.all(before.topics.map((t: any) =>
          supabase.from('brc_topics' as any)
            .update({ target_score: t.target_score, active: t.active }).eq('id', t.id)));
      }
      if (before.bands?.length) {
        await Promise.all(before.bands.map((b: any) =>
          supabase.from('brc_grade_bands' as any)
            .update({ min_score: b.min_score, max_score: b.max_score })
            .eq('supplier_type', st).eq('grade', b.grade)));
      }

      await supabase.from('brc_criteria_audit' as any)
        .update({ rolled_back_at: new Date().toISOString(), rolled_back_by: user?.id ?? null })
        .eq('id', entry.id);

      toast({ title: 'ย้อนกลับสำเร็จ', description: entry.summary });
      await load(true);
      const { data } = await supabase.from('brc_criteria_audit' as any)
        .select('*').order('changed_at', { ascending: false }).limit(100);
      setCritLog((data as any[]) || []);
    } catch (e: any) {
      toast({ title: 'ย้อนกลับไม่สำเร็จ', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setRollingBack(null);
    }
  };

  // ── Rebalance step ────────────────────────────────────────────────────────
  // Adding or removing a topic changes the total available marks, which would
  // silently invalidate the A/B/C/D bands. Both actions therefore route through a
  // mandatory step where the marks and the bands are reviewed together, and only
  // then is anything written.
  type RebalanceRow = { id: string; topic: string; section: string; target: number; isNew?: boolean };
  const [rebalance, setRebalance] = useState<null | {
    mode: 'add' | 'delete';
    st: string;
    rows: RebalanceRow[];
    bandDraft: BandDraft;
    /** Original bands + total, so repeated suggestions never drift. */
    baseBands: BandDraft;
    baseTotal: number;
    /** While true the bands follow the marks automatically; a manual edit stops it. */
    bandsAuto: boolean;
    pending?: typeof newTopic;
    deleteId?: string;
  }>(null);


  const buildRebalance = (st: string, opts: { addPending?: typeof newTopic; removeId?: string }) => {
    const rows: RebalanceRow[] = topics
      .filter(t => t.supplier_type === st && t.active && t.id !== opts.removeId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(t => ({ id: t.id, topic: t.topic, section: t.section, target: Number(t.target_score) }));
    if (opts.addPending) {
      rows.push({
        id: '__new__', isNew: true,
        topic: opts.addPending.topic.trim(),
        section: opts.addPending.section.trim(),
        target: Number(opts.addPending.target_score) || 0,
      });
    }
    const base: BandDraft = {};
    bands.filter(b => b.supplier_type === st).forEach(b => { base[b.grade] = { min: b.min_score, max: b.max_score }; });
    // The scale the existing bands were written against.
    const baseTotal = topics
      .filter(t => t.supplier_type === st && t.active)
      .reduce((a, t) => a + Number(t.target_score), 0);
    const newTotal = rows.reduce((a, r) => a + (r.target || 0), 0);
    return { rows, base, baseTotal, bandDraft: suggestBands(base, baseTotal, newTotal) };
  };

  const startAddRebalance = () => {
    if (!addTopicType || !newTopic.section.trim() || !newTopic.topic.trim()) {
      toast({ title: 'กรุณาระบุหมวดและชื่อหัวข้อ', variant: 'destructive' }); return;
    }
    if (newTopic.auto_source === 'quotation' && !newTopic.quotation_field) {
      toast({ title: 'กรุณาเลือกข้อมูลจากใบเสนอราคาที่ใช้คิดคะแนน', variant: 'destructive' }); return;
    }
    const { rows, bandDraft, base, baseTotal } = buildRebalance(addTopicType, { addPending: newTopic });
    setRebalance({ mode: 'add', st: addTopicType, rows, bandDraft, baseBands: base, baseTotal, bandsAuto: true, pending: { ...newTopic } });
  };

  const startDeleteRebalance = () => {
    if (!delTopic) return;
    const st = delTopic.topic.supplier_type;
    const { rows, bandDraft, base, baseTotal } = buildRebalance(st, { removeId: delTopic.topic.id });
    setRebalance({ mode: 'delete', st, rows, bandDraft, baseBands: base, baseTotal, bandsAuto: true, deleteId: delTopic.topic.id });
  };

  /** Editing marks re-suggests the bands, unless the user has taken them over. */
  const setRebalanceTarget = (id: string, target: number) =>
    setRebalance(p => {
      if (!p) return p;
      const rows = p.rows.map(r => r.id === id ? { ...r, target } : r);
      if (!p.bandsAuto) return { ...p, rows };
      const newTotal = rows.reduce((a, r) => a + (r.target || 0), 0);
      return { ...p, rows, bandDraft: suggestBands(p.baseBands, p.baseTotal, newTotal) };
    });

  const setRebalanceBand = (grade: string, key: 'min' | 'max', v: number) =>
    setRebalance(p => p ? {
      ...p,
      bandsAuto: false, // manual edit wins from here on
      bandDraft: { ...p.bandDraft, [grade]: { ...p.bandDraft[grade], [key]: v } },
    } : p);

  /** Re-apply the automatic suggestion after a manual edit. */
  const autoScaleBands = () =>
    setRebalance(p => {
      if (!p) return p;
      const newTotal = p.rows.reduce((a, r) => a + (r.target || 0), 0);
      return { ...p, bandsAuto: true, bandDraft: suggestBands(p.baseBands, p.baseTotal, newTotal) };
    });

  const commitRebalance = async () => {
    if (!rebalance) return;
    const { mode, st, rows, bandDraft, pending, deleteId } = rebalance;
    setSaving(true);
    try {
      // Snapshot everything this change can touch, so it can be rolled back.
      const before: any = snapshotType(st);
      let createdTopicId: string | null = null;
      let summary = '';

      if (mode === 'delete' && deleteId) {
        const doomed = topics.find(t => t.id === deleteId)!;
        // Capture the topic and every row that will cascade with it.
        const [optRes, manRes, evRes] = await Promise.all([
          supabase.from('brc_options' as any).select('*').eq('topic_id', deleteId),
          supabase.from('brc_manual_scores' as any).select('*').eq('topic_id', deleteId),
          supabase.from('brc_evidence' as any).select('*').eq('topic_id', deleteId),
        ]);
        before.topic = { ...doomed, target_score: Number(doomed.target_score) };
        before.options = optRes.data ?? [];
        before.manual_scores = manRes.data ?? [];
        before.evidence = evRes.data ?? [];
        summary = `ลบหัวข้อ "${doomed.topic}" (${doomed.section})`;

        const { error } = await supabase.from('brc_topics' as any).delete().eq('id', deleteId);
        if (error) throw error;
      }
      if (mode === 'add' && pending) {
        const maxOrder = topics.filter(t => t.supplier_type === st).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
        const newRow = rows.find(r => r.isNew)!;
        const { data, error } = await supabase.from('brc_topics' as any).insert({
          supplier_type: st,
          section: pending.section.trim(),
          topic: pending.topic.trim(),
          target_score: newRow.target,
          scoring_mode: pending.scoring_mode,
          auto_source: pending.auto_source,
          quotation_field: pending.auto_source === 'quotation' ? pending.quotation_field : null,
          criterion_group: pending.criterion_group,
          sort_order: maxOrder + 10,
          active: true,
        }).select('id').single();
        if (error) throw error;
        createdTopicId = (data as any)?.id ?? null;
        summary = `เพิ่มหัวข้อ "${pending.topic.trim()}" (${pending.section.trim()}) — ${newRow.target} คะแนน`;
      }
      // Persist any changed marks on the surviving topics, then the bands.
      const ops: any[] = [];
      rows.filter(r => !r.isNew).forEach(r => {
        const orig = topics.find(t => t.id === r.id);
        if (orig && Number(orig.target_score) !== r.target) {
          ops.push(supabase.from('brc_topics' as any).update({ target_score: r.target }).eq('id', r.id));
        }
      });
      Object.entries(bandDraft).forEach(([grade, v]) => {
        ops.push(supabase.from('brc_grade_bands' as any)
          .update({ min_score: v.min, max_score: v.max })
          .eq('supplier_type', st).eq('grade', grade));
      });
      const results = await Promise.all(ops);
      const failed = results.find((r: any) => r?.error);
      if (failed?.error) throw failed.error;

      const newTotal = rows.reduce((a, r) => a + (r.target || 0), 0);
      await logCriteria(
        mode === 'add' ? 'add_topic' : 'delete_topic',
        st,
        `${summary} · คะแนนเต็มรวมใหม่ ${newTotal}`,
        before,
        { created_topic_id: createdTopicId, total: newTotal, bands: bandDraft },
      );

      toast({
        title: mode === 'add' ? 'เพิ่มหัวข้อและปรับคะแนนแล้ว' : 'ลบหัวข้อและปรับคะแนนแล้ว',
        description: `คะแนนเต็มรวม ${newTotal} · ช่วงเกรดอัปเดตแล้ว · ย้อนกลับได้ที่ปุ่ม "ประวัติเกณฑ์"`,
      });
      setRebalance(null); setAddTopicType(null); setDelTopic(null);
      load(true);
    } catch (e: any) {
      toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openAddTopic = (st: string) => {
    setAddTopicType(st);
    setNewTopic({
      section: '', topic: '', target_score: 10, scoring_mode: 'best_match',
      criterion_group: 'safety_quality', auto_source: 'manual', quotation_field: null,
    });
  };
  const removeOpt = async (id: string) => {
    const opt = options.find(o => o.id === id);
    const topic = opt ? topics.find(t => t.id === opt.topic_id) : undefined;
    const { error } = await supabase.from('brc_options' as any).delete().eq('id', id);
    if (error) { toast({ title: 'ลบไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    if (opt && topic) {
      await logCriteria('delete_option', topic.supplier_type,
        `ลบตัวเลือก "${opt.label}" จากหัวข้อ "${topic.topic}"`,
        { options: [opt] }, null);
    }
    toast({ title: 'ลบแล้ว' }); load(true);
  };

  const toggleTopic = async (t: BrcTopic, active: boolean) => {
    setTopics(prev => prev.map(x => x.id === t.id ? { ...x, active } : x)); // optimistic
    const { error } = await supabase.from('brc_topics' as any).update({ active }).eq('id', t.id);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); load(true); }
  };

  const toScoreOptions = (opts: BrcOption[]) =>
    opts.map(o => ({ id: o.id, label: o.label, score: Number(o.score), is_mandatory: o.is_mandatory }));

  // Marking the top-scoring option mandatory makes a topic's full marks
  // unreachable, so offer to rebalance it right away.
  const [mandatoryFix, setMandatoryFix] = useState<null | {
    topic: BrcTopic;
    opts: BrcOption[];
    rawMax: number;
    target: number;
    scaled: { id: string; label: string; from: number; to: number; changed: boolean }[];
  }>(null);

  /** Switch how a lapsed document is treated for this option. */
  const toggleExpiredPolicy = async (o: BrcOption) => {
    const next = o.expired_policy === 'warn' ? 'block' : 'warn';
    setOptions(prev => prev.map(x => x.id === o.id ? { ...x, expired_policy: next } : x)); // optimistic
    const { error } = await supabase.from('brc_options' as any).update({ expired_policy: next }).eq('id', o.id);
    if (error) {
      setOptions(prev => prev.map(x => x.id === o.id ? { ...x, expired_policy: o.expired_policy } : x));
      toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    const parent = topics.find(t => t.id === o.topic_id);
    if (parent) {
      await logCriteria('update_option', parent.supplier_type,
        `ตั้งเอกสารหมดอายุของ "${o.label}" เป็น ${next === 'warn' ? 'ยังนับแต่เตือน' : 'ถือว่าไม่มีเอกสาร'}`,
        { option: o }, { expired_policy: next });
    }
    toast({
      title: next === 'warn' ? 'หมดอายุแล้วยังนับคะแนน (แจ้งเตือน)' : 'หมดอายุแล้วถือว่าไม่มีเอกสาร',
    });
  };

  const toggleMandatory = async (o: BrcOption) => {
    const next = !o.is_mandatory;
    const optimistic = options.map(x => x.id === o.id ? { ...x, is_mandatory: next } : x);
    setOptions(optimistic); // optimistic, no reload
    const { error } = await supabase.from('brc_options' as any).update({ is_mandatory: next }).eq('id', o.id);
    if (error) {
      setOptions(prev => prev.map(x => x.id === o.id ? { ...x, is_mandatory: o.is_mandatory } : x)); // revert
      toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' });
      return;
    }
    const parent = topics.find(t => t.id === o.topic_id);
    if (parent) {
      await logCriteria('update_option', parent.supplier_type,
        `${next ? 'ตั้ง' : 'ยกเลิก'}เอกสารบังคับ "${o.label}" ในหัวข้อ "${parent.topic}"`,
        { option: o }, { is_mandatory: next });
    }
    toast({ title: next ? 'ตั้งเป็นเอกสารบังคับแล้ว' : 'ยกเลิกบังคับแล้ว' });

    // Does the topic still reach its full marks?
    if (!parent) return;
    const topicOpts = optimistic.filter(x => x.topic_id === parent.id);
    const scoreOpts = toScoreOptions(topicOpts);
    const rawMax = achievableMax(parent.scoring_mode, scoreOpts);
    const target = Number(parent.target_score);
    if (!needsRebalance(parent.scoring_mode, target, rawMax)) return;

    const scaled = buildScaleSuggestion(parent.scoring_mode, target, scoreOpts, rawMax);
    if (!scaled.some(s => s.changed)) return; // nothing meaningful to change
    setMandatoryFix({ topic: parent, opts: topicOpts, rawMax, target, scaled });
  };

  /** Scale the remaining options so the best of them reaches the topic's marks. */
  const applyScaleOptions = async () => {
    if (!mandatoryFix) return;
    setSaving(true);
    try {
      const before = mandatoryFix.opts.map(o => ({ ...o, score: Number(o.score) }));
      const results = await Promise.all(mandatoryFix.scaled.filter(s => s.changed).map(s =>
        supabase.from('brc_options' as any).update({ score: s.to }).eq('id', s.id)));
      const failed = results.find((r: any) => r?.error);
      if (failed?.error) throw failed.error;
      await logCriteria('update_option', mandatoryFix.topic.supplier_type,
        `ปรับคะแนนตัวเลือกในหัวข้อ "${mandatoryFix.topic.topic}" ให้ทำคะแนนเต็ม ${mandatoryFix.target} ได้`,
        { options: before }, { scaled: mandatoryFix.scaled });
      toast({ title: 'ปรับคะแนนตัวเลือกแล้ว' });
      setMandatoryFix(null); load(true);
    } catch (e: any) {
      toast({ title: 'ปรับไม่สำเร็จ', description: e?.message ?? String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  /** Lower the topic's marks to what is actually achievable. */
  const applyLowerTarget = async () => {
    if (!mandatoryFix) return;
    setSaving(true);
    try {
      const st = mandatoryFix.topic.supplier_type;
      const before = snapshotType(st);
      const { error } = await supabase.from('brc_topics' as any)
        .update({ target_score: mandatoryFix.rawMax }).eq('id', mandatoryFix.topic.id);
      if (error) throw error;
      await logCriteria('update_topic', st,
        `ลดคะแนนเต็มหัวข้อ "${mandatoryFix.topic.topic}" จาก ${mandatoryFix.target} เป็น ${mandatoryFix.rawMax}`,
        before, { target_score: mandatoryFix.rawMax });
      toast({
        title: 'ปรับคะแนนเต็มแล้ว',
        description: 'คะแนนเต็มรวมของหมวดเปลี่ยน — ควรกด "แก้ไขช่วงเกรด" ปรับตาม',
      });
      setMandatoryFix(null); load(true);
    } catch (e: any) {
      toast({ title: 'ปรับไม่สำเร็จ', description: e?.message ?? String(e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // Edit topic full mark (target_score) + scoring mode
  const [editTopic, setEditTopic] = useState<BrcTopic | null>(null);
  const [topicForm, setTopicForm] = useState<{ target_score: number; scoring_mode: 'best_match' | 'additive' }>({ target_score: 0, scoring_mode: 'best_match' });
  const openEditTopic = (t: BrcTopic) => { setEditTopic(t); setTopicForm({ target_score: Number(t.target_score), scoring_mode: t.scoring_mode }); };
  const saveTopic = async () => {
    if (!editTopic) return;
    setSaving(true);
    const { error } = await supabase.from('brc_topics' as any)
      .update({ target_score: Number(topicForm.target_score) || 0, scoring_mode: topicForm.scoring_mode }).eq('id', editTopic.id);
    setSaving(false);
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'บันทึกหัวข้อแล้ว' });
    setEditTopic(null); load(true);
  };

  // Edit grade bands per supplier type
  const [editBandsType, setEditBandsType] = useState<string | null>(null);
  const [bandDraft, setBandDraft] = useState<Record<string, { min: number; max: number }>>({});
  const openEditBands = (st: string) => {
    const draft: Record<string, { min: number; max: number }> = {};
    bands.filter(b => b.supplier_type === st).forEach(b => { draft[b.grade] = { min: b.min_score, max: b.max_score }; });
    setBandDraft(draft); setEditBandsType(st);
  };
  const saveBands = async () => {
    if (!editBandsType) return;
    setSaving(true);
    const results = await Promise.all(Object.entries(bandDraft).map(([grade, v]) =>
      supabase.from('brc_grade_bands' as any)
        .update({ min_score: Number(v.min) || 0, max_score: Number(v.max) || 0 })
        .eq('supplier_type', editBandsType).eq('grade', grade)));
    setSaving(false);
    const err = results.find(r => r.error);
    if (err?.error) { toast({ title: 'บันทึกไม่สำเร็จ', description: err.error.message, variant: 'destructive' }); return; }
    toast({ title: 'บันทึกช่วงเกรดแล้ว' });
    setEditBandsType(null); load(true);
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
                <History className="w-3.5 h-3.5 mr-1" />ประวัติน้ำหนัก
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={loadCritLog}>
                <History className="w-3.5 h-3.5 mr-1" />ประวัติเกณฑ์
              </Button>
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setManageTypesOpen(true)}>
                  <Settings className="w-3.5 h-3.5 mr-1" />จัดการหมวดหมู่
                </Button>
              )}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      {typeBands.map(b => (
                        <Badge key={b.grade} variant="outline" className={`${GRADE_COLOR[b.grade]} text-xs`}>
                          {b.grade}: {b.min_score}–{b.max_score}
                        </Badge>
                      ))}
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditBands(st)}>
                          <Pencil className="w-3 h-3" />แก้ไขช่วงเกรด
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5 flex-1 min-w-[260px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span>ตัวเลือกที่ตั้ง <b className="text-red-700">บังคับ</b> = supplier ต้องมีอย่างน้อย 1 ตัวเลือกบังคับต่อหัวข้อ (จับคู่ใบรับรอง/เอกสาร + ไม่หมดอายุ) ไม่งั้นจะเลือกเข้า RFQ หมวดนี้ไม่ได้ — และ<b>ไม่คิดคะแนน rate</b> (เป็นด่านเข้าล้วนๆ เพราะทุกรายที่เข้ามาต้องมีอยู่แล้ว)</span>
                </p>
                {canEdit && (
                  <Button size="sm" className="shrink-0 gap-1" onClick={() => openAddTopic(st)}>
                    <Plus className="w-4 h-4" />เพิ่มหัวข้อใหม่
                  </Button>
                )}
              </div>

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
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEditTopic(t)}>
                                <Pencil className="w-3 h-3" />แก้ไขคะแนนเต็ม
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                onClick={() => { setAddTopic(t); setAddForm({ label: '', score: 0, match_type: t.auto_source === 'quotation' ? 'auto' : 'certificate', keywordsText: '', is_mandatory: false, requirement: '' }); }}>
                                <Plus className="w-3 h-3" />ตัวเลือก
                              </Button>
                              <Switch checked={t.active} onCheckedChange={v => toggleTopic(t, v)} />
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="ลบหัวข้อนี้"
                                onClick={() => askDeleteTopic(t)}>
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </Button>
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
                                  {o.match_type === 'certificate' && (
                                    <button
                                      onClick={() => toggleExpiredPolicy(o)}
                                      title="เมื่อใบรับรองหมดอายุ: ยังนับคะแนนแต่แจ้งเตือน หรือ ถือว่าไม่มีเอกสาร"
                                      className={`text-[10px] px-1.5 py-0.5 rounded border mr-1 transition-colors ${o.expired_policy === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted'}`}
                                    >
                                      {o.expired_policy === 'warn' ? 'หมดอายุ: ยังนับ (เตือน)' : 'หมดอายุ: ไม่นับ'}
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
            <DialogDescription>ปรับชื่อ คำอธิบาย คะแนน หรือคำค้นสำหรับจับคู่อัตโนมัติ</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ชื่อ</Label>
              <Input value={optForm.label} onChange={e => setOptForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div>
              <Label>คำอธิบาย / อ้างอิงเอกสาร</Label>
              <Input value={optForm.requirement}
                placeholder="เช่น FM-PUR-000-03 >73"
                onChange={e => setOptForm(p => ({ ...p, requirement: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground mt-1">แสดงเป็นบรรทัดคำอธิบายใต้ชื่อตัวเลือก — เว้นว่างได้</p>
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
            <div>
              <Label>คำอธิบาย / อ้างอิงเอกสาร</Label>
              <Input value={addForm.requirement}
                placeholder="เช่น FM-PUR-000-03 >73"
                onChange={e => setAddForm(p => ({ ...p, requirement: e.target.value }))} />
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
                  {addTopic?.auto_source === 'quotation' ? (
                    // A quotation topic resolves its own tier — there is nothing to match on.
                    <option value="auto">จากใบเสนอราคา (ระบบเลือกระดับให้เอง)</option>
                  ) : (
                    <>
                      <option value="certificate">ใบรับรอง (auto)</option>
                      <option value="document">เอกสาร (auto)</option>
                      <option value="manual">ประเมินเอง</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            {addForm.match_type !== 'manual' && (
              <div>
                <Label>คำค้นจับคู่ (คั่นด้วยจุลภาค)</Label>
                <Input value={addForm.keywordsText} onChange={e => setAddForm(p => ({ ...p, keywordsText: e.target.value }))} placeholder="เช่น halal, ฮาลาล" />
              </div>
            )}
            {addTopic?.auto_source !== 'quotation' && (
              <label className="flex items-start gap-2 cursor-pointer rounded-md border p-2.5">
                <input type="checkbox" className="mt-0.5" checked={addForm.is_mandatory}
                  onChange={e => setAddForm(p => ({ ...p, is_mandatory: e.target.checked }))} />
                <div>
                  <p className="text-sm font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-500" />ตั้งเป็นเอกสารบังคับ (ด่านเข้า)</p>
                  <p className="text-[11px] text-muted-foreground">ถ้าติ๊ก: supplier ต้องมีตัวเลือกนี้จึงเข้า RFQ ได้ และ<b>ไม่คิดคะแนน rate</b></p>
                </div>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTopic(null)}>ยกเลิก</Button>
            <Button onClick={saveNewOpt} disabled={saving || !addForm.label.trim()}>{saving ? 'กำลังเพิ่ม...' : 'เพิ่ม'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add new criterion (topic) dialog */}
      <Dialog open={!!addTopicType} onOpenChange={v => !v && setAddTopicType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มหัวข้อใหม่</DialogTitle>
            <DialogDescription>{addTopicType && SUPPLIER_TYPE_LABEL[addTopicType as BrcSupplierType]} — สร้างเกณฑ์ให้คะแนน แล้วเพิ่มระดับคะแนน (ตัวเลือก) ภายหลัง</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>หมวด (Section) *</Label>
                <Input list="brc-sections" value={newTopic.section}
                  onChange={e => setNewTopic(p => ({ ...p, section: e.target.value }))}
                  placeholder="พิมพ์ชื่อใหม่ หรือเลือกจากรายการ" />
                <datalist id="brc-sections">
                  {Array.from(new Set(topics.filter(t => t.supplier_type === addTopicType).map(t => t.section))).map(s => <option key={s} value={s} />)}
                </datalist>
                <p className="text-[11px] text-muted-foreground mt-1">พิมพ์ชื่อหมวดใหม่ได้เลย — ระบบจะสร้างหมวดให้อัตโนมัติ</p>
              </div>
              <div>
                <Label>ชื่อหัวข้อ *</Label>
                <Input value={newTopic.topic} onChange={e => setNewTopic(p => ({ ...p, topic: e.target.value }))} placeholder="เช่น Audit Score" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>คะแนนเต็ม</Label>
                <Input type="number" min={0} value={newTopic.target_score}
                  onChange={e => setNewTopic(p => ({ ...p, target_score: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>วิธีรวมคะแนน</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
                  value={newTopic.scoring_mode} onChange={e => setNewTopic(p => ({ ...p, scoring_mode: e.target.value as 'best_match' | 'additive' }))}>
                  <option value="best_match">เลือกคะแนนสูงสุดที่เข้าเกณฑ์</option>
                  <option value="additive">บวกสะสมทุกข้อที่มี</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>กลุ่มเกณฑ์</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
                  value={newTopic.criterion_group} onChange={e => setNewTopic(p => ({ ...p, criterion_group: e.target.value as 'safety_quality' | 'commercial' }))}>
                  <option value="safety_quality">ความปลอดภัย & คุณภาพ</option>
                  <option value="commercial">เชิงพาณิชย์</option>
                </select>
              </div>
              <div>
                <Label>แหล่งตรวจ</Label>
                <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
                  value={newTopic.auto_source}
                  onChange={e => {
                    const src = e.target.value as 'manual' | 'evidence' | 'quotation';
                    setNewTopic(p => ({
                      ...p,
                      auto_source: src,
                      // A quotation criterion is commercial by definition and always
                      // resolves to exactly one tier.
                      criterion_group: src === 'quotation' ? 'commercial' : p.criterion_group,
                      scoring_mode: src === 'quotation' ? 'best_match' : p.scoring_mode,
                      quotation_field: src === 'quotation' ? p.quotation_field : null,
                    }));
                  }}>
                  <option value="manual">ประเมินเอง (ผู้ประเมินเลือกระดับ)</option>
                  <option value="evidence">Auto จากใบรับรอง/เอกสาร</option>
                  <option value="quotation">Auto จากใบเสนอราคา</option>
                </select>
              </div>
            </div>

            {newTopic.auto_source === 'quotation' && (() => {
              const used = usedQuotationFields(addTopicType);
              const free = QUOTATION_FIELDS.filter(f => !used.has(f.value));
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                  <Label className="text-xs">ข้อมูลที่ใช้คิดคะแนน *</Label>
                  {free.length === 0 ? (
                    <p className="text-[11px] text-red-600">
                      ข้อมูลจากใบเสนอราคาทั้ง 3 แบบถูกใช้ครบแล้วในหมวดนี้ — ปิดหรือลบหัวข้อเดิมก่อนจึงจะสร้างใหม่ได้
                    </p>
                  ) : (
                    <select className="w-full h-9 border rounded-md px-3 text-sm bg-background"
                      value={newTopic.quotation_field ?? ''}
                      onChange={e => setNewTopic(p => ({ ...p, quotation_field: (e.target.value || null) as any }))}>
                      <option value="">— เลือกข้อมูล —</option>
                      {free.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    ระบบคิดคะแนนได้เฉพาะ 3 อย่างนี้จากใบเสนอราคา และแต่ละอย่างใช้ได้หัวข้อเดียวต่อหมวดผู้ขาย ·
                    หลังสร้างแล้วให้เพิ่มตัวเลือก <b>3 ระดับเรียงจากดีที่สุดไปแย่ที่สุด</b> (เช่น 15 / 10 / 0) ระบบจะเลือกให้เองตอนเปรียบเทียบราคา
                  </p>
                </div>
              );
            })()}
            <p className="text-[11px] text-muted-foreground">
              💡 สร้างหัวข้อแบบ 3 ระดับ (15/10/0): เลือก "เลือกคะแนนสูงสุด" แล้วเพิ่มตัวเลือก 3 ระดับที่ปุ่ม "+ ตัวเลือก" ของหัวข้อ ·
              <b className="text-teal-700"> ขั้นถัดไปจะให้ปรับคะแนนรายหัวข้อและช่วงเกรดให้สอดคล้องกันก่อนบันทึก</b>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTopicType(null)}>ยกเลิก</Button>
            <Button onClick={startAddRebalance} disabled={saving || !newTopic.section.trim() || !newTopic.topic.trim()}>
              ถัดไป: ปรับคะแนน →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full marks became unreachable after a mandatory change — offer a fix */}
      <Dialog open={!!mandatoryFix} onOpenChange={v => { if (!v && !saving) setMandatoryFix(null); }}>
        <DialogContent className="max-w-lg">
          {mandatoryFix && (() => {
            const isBest = mandatoryFix.topic.scoring_mode === 'best_match';
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />คะแนนเต็มของหัวข้อนี้ทำไม่ถึงแล้ว
                  </DialogTitle>
                  <DialogDescription asChild>
                    <div className="space-y-1">
                      <p>
                        หัวข้อ <b>{mandatoryFix.topic.topic}</b> ตั้งคะแนนเต็มไว้ <b>{mandatoryFix.target}</b> แต่
                        {isBest ? ' คะแนนสูงสุดของตัวเลือกที่คิดคะแนน' : ' ผลรวมของตัวเลือกที่คิดคะแนน'} เหลือเพียง <b className="text-amber-700">{mandatoryFix.rawMax}</b>
                      </p>
                      <p className="text-[11px]">เพราะตัวเลือกที่ตั้งเป็น "บังคับ" เป็นด่านเข้า จึงไม่คิดคะแนน</p>
                    </div>
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {/* Option A — scale remaining options */}
                  <div className="rounded-lg border border-teal-300 bg-teal-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-teal-600 text-white text-[10px]">แนะนำ</Badge>
                      <p className="text-sm font-medium">ปรับคะแนนตัวเลือกที่เหลือขึ้นให้ถึง {mandatoryFix.target}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      คงน้ำหนักของหัวข้อไว้เท่าเดิม — คะแนนเต็มรวมของหมวดไม่เปลี่ยน จึงไม่ต้องแก้ช่วงเกรด
                    </p>
                    <div className="rounded-md border bg-background divide-y max-h-44 overflow-y-auto">
                      {mandatoryFix.scaled.map(s => (
                        <div key={s.id} className={`flex items-center justify-between gap-2 px-2.5 py-1 text-xs ${s.changed ? '' : 'opacity-60'}`}>
                          <span className="truncate flex-1">{s.label}</span>
                          <span className="tabular-nums shrink-0">
                            {s.changed ? (
                              <>
                                <span className="text-muted-foreground">{s.from}</span>
                                <span className="mx-1">→</span>
                                <b className="text-teal-700">{s.to}</b>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{s.to} (เท่าเดิม)</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      ตัวเลือกที่คะแนนเท่ากันอยู่แล้วจะยังเท่ากัน · ตัวเลือกที่คะแนนต่างกันจะไม่ถูกปรับมาชนกัน · ข้อที่ได้ 0 คะแนนไม่ถูกแตะ
                    </p>
                    <Button size="sm" className="w-full h-8" disabled={saving} onClick={applyScaleOptions}>
                      {saving ? 'กำลังปรับ...' : 'ใช้วิธีนี้'}
                    </Button>
                  </div>

                  {/* Option B — lower the topic target */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <p className="text-sm font-medium">ลดคะแนนเต็มของหัวข้อเป็น {mandatoryFix.rawMax}</p>
                    <p className="text-[11px] text-amber-700">
                      ⚠️ คะแนนเต็มรวมของหมวดจะเปลี่ยน ({mandatoryFix.target} → {mandatoryFix.rawMax}) ต้องกด "แก้ไขช่วงเกรด" ปรับตาม
                    </p>
                    <Button size="sm" variant="outline" className="w-full h-8" disabled={saving} onClick={applyLowerTarget}>
                      ใช้วิธีนี้
                    </Button>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => setMandatoryFix(null)}>
                    ไว้ก่อน (ปล่อยให้ทำคะแนนเต็มไม่ได้)
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Criteria change log + rollback */}
      <Dialog open={critLogOpen} onOpenChange={setCritLogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" />ประวัติการแก้ไขเกณฑ์</DialogTitle>
            <DialogDescription>
              บันทึกการเพิ่ม/ลบหมวด หัวข้อ และตัวเลือก พร้อมย้อนกลับได้ — การย้อนกลับจะคืนคะแนน ช่วงเกรด และข้อมูลที่ถูกลบไปพร้อมกัน
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {critLog.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีประวัติการแก้ไข</p>
            ) : (
              <div className="space-y-2">
                {critLog.map(e => (
                  <div key={e.id} className={`rounded-lg border p-3 ${e.rolled_back_at ? 'opacity-60 bg-muted/30' : ''}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-[240px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className={`text-[10px] ${
                            e.action.startsWith('delete') ? 'border-red-300 bg-red-50 text-red-700'
                            : e.action.startsWith('add') ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-blue-300 bg-blue-50 text-blue-700'
                          }`}>
                            {e.action.startsWith('delete') ? 'ลบ' : e.action.startsWith('add') ? 'เพิ่ม' : 'แก้ไข'}
                          </Badge>
                          <span className="text-sm font-medium">{e.summary}</span>
                          {e.rolled_back_at && (
                            <Badge variant="secondary" className="text-[10px]">ย้อนกลับแล้ว</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {SUPPLIER_TYPE_LABEL[e.supplier_type as BrcSupplierType]?.split('(')[0].trim() || e.supplier_type}
                          {' · '}{e.changed_by_email || '—'}
                          {' · '}{new Date(e.changed_at).toLocaleString('th-TH')}
                        </p>
                      </div>
                      {canEdit && !e.rolled_back_at && (
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0"
                          disabled={rollingBack !== null}
                          onClick={() => rollbackCriteria(e)}>
                          {rollingBack === e.id ? 'กำลังย้อนกลับ...' : '↩ ย้อนกลับ'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mandatory rebalance step after adding / removing a topic */}
      <Dialog open={!!rebalance} onOpenChange={v => { if (!v && !saving) setRebalance(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {rebalance && (() => {
            const total = rebalance.rows.reduce((a, r) => a + (r.target || 0), 0);
            const grades = ['A', 'B', 'C', 'D'].filter(g => rebalance.bandDraft[g]);
            const bandErrors: string[] = [];
            grades.forEach(g => {
              const b = rebalance.bandDraft[g];
              if (b.min > b.max) bandErrors.push(`เกรด ${g}: ค่าต่ำสุดมากกว่าค่าสูงสุด`);
            });
            const topBand = rebalance.bandDraft['A'];
            if (topBand && topBand.max !== total) bandErrors.push(`เกรด A ต้องสูงสุดที่ ${total} (คะแนนเต็มรวม)`);
            // contiguity check, best → worst
            const asc = ['D', 'C', 'B', 'A'].filter(g => rebalance.bandDraft[g]);
            for (let i = 1; i < asc.length; i++) {
              const prev = rebalance.bandDraft[asc[i - 1]], cur = rebalance.bandDraft[asc[i]];
              if (cur.min !== prev.max + 1) bandErrors.push(`ช่วงเกรด ${asc[i - 1]} → ${asc[i]} ไม่ต่อเนื่องกัน`);
            }
            const blocked = bandErrors.length > 0 || total <= 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {rebalance.mode === 'add' ? 'ปรับคะแนนก่อนเพิ่มหัวข้อ' : 'ปรับคะแนนก่อนลบหัวข้อ'}
                  </DialogTitle>
                  <DialogDescription>
                    {SUPPLIER_TYPE_LABEL[rebalance.st as BrcSupplierType]} — คะแนนเต็มรวมเปลี่ยน จึงต้องตรวจคะแนนรายหัวข้อและช่วงเกรดให้สอดคล้องกันก่อนบันทึก
                  </DialogDescription>
                </DialogHeader>

                {/* Marks per topic */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">
                      คะแนนเต็มรายหัวข้อ
                      {rebalance.mode === 'add' && <span className="font-normal text-muted-foreground"> — ใส่คะแนนของหัวข้อใหม่ และปรับหัวข้ออื่นได้ตามต้องการ</span>}
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      รวม <b className="text-foreground tabular-nums">{total}</b> คะแนน
                    </span>
                  </div>
                  <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                    {rebalance.rows.map(r => (
                      <div key={r.id} className={`flex items-center gap-2 px-3 py-1.5 ${r.isNew ? 'bg-emerald-50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {r.topic}
                            {r.isNew && <Badge variant="outline" className="ml-1.5 text-[9px] border-emerald-300 bg-emerald-100 text-emerald-700">ใหม่</Badge>}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{r.section}</p>
                        </div>
                        <Input type="number" min={0} value={r.target} autoFocus={r.isNew}
                          className={`h-8 w-20 text-right ${r.isNew ? 'border-emerald-400 ring-1 ring-emerald-300' : ''}`}
                          onChange={e => setRebalanceTarget(r.id, parseInt(e.target.value) || 0)} />
                      </div>
                    ))}
                  </div>
                  {rebalance.mode === 'delete' && (
                    <p className="text-[11px] text-red-600">หัวข้อที่จะลบถูกนำออกจากรายการนี้แล้ว</p>
                  )}
                </div>

                {/* Grade bands */}
                <div className="space-y-1.5 border-t pt-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-semibold">
                      ช่วงเกรด (0–{total})
                      {rebalance.bandsAuto
                        ? <Badge variant="outline" className="ml-1.5 text-[9px] border-teal-300 bg-teal-50 text-teal-700">แนะนำอัตโนมัติ</Badge>
                        : <Badge variant="outline" className="ml-1.5 text-[9px] border-amber-300 bg-amber-50 text-amber-700">แก้ไขเอง</Badge>}
                    </Label>
                    {!rebalance.bandsAuto && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={autoScaleBands}>
                        กลับไปใช้ค่าแนะนำ
                      </Button>
                    )}
                  </div>
                  {rebalance.bandsAuto && (
                    <p className="text-[11px] text-muted-foreground">
                      ระบบคำนวณให้ตามสัดส่วนเดิม (จากคะแนนเต็ม {rebalance.baseTotal} → {total}) — แก้ไขเองได้
                    </p>
                  )}
                  {grades.map(g => (
                    <div key={g} className="flex items-center gap-2">
                      <Badge variant="outline" className={`${GRADE_COLOR[g]} w-8 justify-center`}>{g}</Badge>
                      <Input type="number" className="h-8" value={rebalance.bandDraft[g].min}
                        onChange={e => setRebalanceBand(g, 'min', parseInt(e.target.value) || 0)} />
                      <span className="text-muted-foreground">–</span>
                      <Input type="number" className="h-8" value={rebalance.bandDraft[g].max}
                        onChange={e => setRebalanceBand(g, 'max', parseInt(e.target.value) || 0)} />
                    </div>
                  ))}
                  {bandErrors.length > 0 ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700 space-y-0.5">
                      {bandErrors.map((e, i) => <p key={i}>• {e}</p>)}
                    </div>
                  ) : (
                    <p className="text-[11px] text-emerald-700">✓ ช่วงเกรดต่อเนื่องและครอบคลุมคะแนนเต็มพอดี</p>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setRebalance(null)} disabled={saving}>ย้อนกลับ</Button>
                  <Button onClick={commitRebalance} disabled={saving || blocked}
                    className={rebalance.mode === 'delete' ? 'bg-red-600 hover:bg-red-700' : ''}>
                    {saving ? 'กำลังบันทึก...' : rebalance.mode === 'add' ? 'ยืนยันเพิ่มหัวข้อ' : 'ยืนยันลบหัวข้อ'}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirm topic delete — shows the cascade impact */}
      <AlertDialog open={!!delTopic} onOpenChange={v => !v && setDelTopic(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหัวข้อ "{delTopic?.topic.topic}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>การลบนี้กู้คืนไม่ได้ และจะลบข้อมูลที่ผูกกับหัวข้อนี้ทั้งหมด:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>ตัวเลือก/ระดับคะแนน <b>{delTopic?.options ?? 0}</b> รายการ</li>
                  <li>ผลประเมินเอง (manual) ของ supplier <b>{delTopic?.manual ?? 0}</b> รายการ</li>
                  <li>เอกสารที่แนบไว้ในหัวข้อนี้ <b>{delTopic?.evidence ?? 0}</b> ไฟล์ (ไฟล์ยังอยู่ใน storage แต่จะไม่ผูกกับเกณฑ์อีก)</li>
                </ul>
                {(delTopic?.manual ?? 0) + (delTopic?.evidence ?? 0) > 0 && (
                  <p className="text-red-600 font-medium">
                    ⚠️ มีข้อมูลการประเมินของ supplier ผูกอยู่ — หากต้องการเก็บประวัติไว้ ให้ใช้สวิตช์ปิดใช้งานแทนการลบ
                  </p>
                )}
                <p className="text-teal-700">ขั้นถัดไปจะให้ปรับคะแนนรายหัวข้อและช่วงเกรดให้สอดคล้องกันก่อนลบจริง</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={startDeleteRebalance} className="bg-red-600 hover:bg-red-700">
              ถัดไป: ปรับคะแนน →
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit topic full mark + scoring mode */}
      <Dialog open={!!editTopic} onOpenChange={v => !v && setEditTopic(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขคะแนนเต็ม — {editTopic?.topic}</DialogTitle>
            <DialogDescription>กำหนดคะแนนเต็มของหัวข้อ และวิธีรวมคะแนน</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>คะแนนเต็ม (target)</Label>
              <Input type="number" min={0} value={topicForm.target_score}
                onChange={e => setTopicForm(p => ({ ...p, target_score: parseInt(e.target.value) || 0 }))} />
              <p className="text-[11px] text-muted-foreground mt-1">คะแนนสูงสุดที่หัวข้อนี้ทำได้ (เพดานของ "บวกสะสม")</p>
              {editTopic && (() => {
                const others = topics
                  .filter(t => t.supplier_type === editTopic.supplier_type && t.active && t.id !== editTopic.id)
                  .reduce((a, t) => a + Number(t.target_score), 0);
                const newTotal = others + (Number(topicForm.target_score) || 0);
                const topBand = bands.find(b => b.supplier_type === editTopic.supplier_type && b.grade === 'A');
                const mismatch = topBand && topBand.max !== newTotal;
                return (
                  <p className={`text-[11px] mt-1 ${mismatch ? 'text-amber-700' : 'text-emerald-700'}`}>
                    คะแนนเต็มรวมใหม่ = <b>{newTotal}</b>
                    {mismatch
                      ? ` — ไม่ตรงกับเกรด A สูงสุด (${topBand!.max}) ควรกด "แก้ไขช่วงเกรด" ปรับตาม`
                      : ' — ตรงกับช่วงเกรดปัจจุบัน'}
                  </p>
                );
              })()}
            </div>
            <div>
              <Label>วิธีรวมคะแนน</Label>
              <select className="w-full h-10 border rounded-md px-3 text-sm bg-background"
                value={topicForm.scoring_mode}
                onChange={e => setTopicForm(p => ({ ...p, scoring_mode: e.target.value as 'best_match' | 'additive' }))}>
                <option value="best_match">เลือกคะแนนสูงสุดที่เข้าเกณฑ์</option>
                <option value="additive">บวกสะสมทุกข้อที่มี (ไม่เกินคะแนนเต็ม)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTopic(null)}>ยกเลิก</Button>
            <Button onClick={saveTopic} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit grade bands */}
      <Dialog open={!!editBandsType} onOpenChange={v => !v && setEditBandsType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แก้ไขช่วงเกรด</DialogTitle>
            <DialogDescription>{editBandsType && SUPPLIER_TYPE_LABEL[editBandsType as BrcSupplierType]} — กำหนดช่วงคะแนนของแต่ละเกรด</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(['A', 'B', 'C', 'D'] as const).filter(g => bandDraft[g]).map(g => (
              <div key={g} className="flex items-center gap-2">
                <Badge variant="outline" className={`${GRADE_COLOR[g]} w-8 justify-center`}>{g}</Badge>
                <Input type="number" className="h-9" value={bandDraft[g].min}
                  onChange={e => setBandDraft(p => ({ ...p, [g]: { ...p[g], min: parseInt(e.target.value) || 0 } }))} />
                <span className="text-muted-foreground">–</span>
                <Input type="number" className="h-9" value={bandDraft[g].max}
                  onChange={e => setBandDraft(p => ({ ...p, [g]: { ...p[g], max: parseInt(e.target.value) || 0 } }))} />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">ช่วงคะแนน (ต่ำสุด–สูงสุด) ของแต่ละเกรด ควรต่อเนื่องกันและไม่ทับซ้อน</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBandsType(null)}>ยกเลิก</Button>
            <Button onClick={saveBands} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
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

      {/* Manage supplier types (Catalog/BRC categories) */}
      <Dialog open={manageTypesOpen} onOpenChange={setManageTypesOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>จัดการหมวดหมู่ผู้ขาย</DialogTitle>
            <DialogDescription>
              หมวดนี้ใช้ทั้งเป็นแท็บเกณฑ์ BRCGS ด้านล่างและเป็นตัวเลือกหมวดหมู่ Catalog
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">เพิ่มหมวดใหม่</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Key (a-z, 0-9, _)</Label>
                  <Input className="h-8" placeholder="เช่น cold_chain_logistics"
                    value={newTypeForm.key}
                    onChange={e => setNewTypeForm(p => ({ ...p, key: e.target.value.trim().toLowerCase() }))} />
                </div>
                <div>
                  <Label className="text-xs">ชื่อภาษาไทย</Label>
                  <Input className="h-8" placeholder="เช่น โลจิสติกส์ห้องเย็น"
                    value={newTypeForm.label_th}
                    onChange={e => setNewTypeForm(p => ({ ...p, label_th: e.target.value }))} />
                </div>
              </div>
              {newTypeForm.key && !KEY_PATTERN.test(newTypeForm.key) && (
                <p className="text-[11px] text-red-600">Key ต้องขึ้นต้นด้วยตัวอักษร a-z และมีแค่ a-z, 0-9, _</p>
              )}
              <Button size="sm" className="w-full"
                disabled={savingType || !KEY_PATTERN.test(newTypeForm.key) || !newTypeForm.label_th.trim()}
                onClick={addSupplierType}>
                <Plus className="w-3.5 h-3.5 mr-1" />{savingType ? 'กำลังเพิ่ม...' : 'เพิ่มหมวด'}
              </Button>
            </div>

            <div className="space-y-1.5">
              {typeRows.map(t => (
                <div key={t.id} className={`flex items-center gap-2 rounded-lg border p-2 ${!t.active ? 'opacity-50' : ''}`}>
                  <Input className="h-8 flex-1" value={labelDrafts[t.id] ?? t.label_th}
                    onChange={e => setLabelDrafts(p => ({ ...p, [t.id]: e.target.value }))} />
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">{t.key}</span>
                  {(labelDrafts[t.id] ?? t.label_th) !== t.label_th && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => saveTypeLabel(t)}>
                      <Save className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" onClick={() => toggleTypeActive(t)}>
                    {t.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => askDeleteType(t)}>
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete supplier type — blocked if in use */}
      <AlertDialog open={!!deleteTypeTarget} onOpenChange={v => { if (!v) { setDeleteTypeTarget(null); setDeleteTypeBlock(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTypeBlock ? 'ลบหมวดนี้ไม่ได้' : `ลบหมวด "${deleteTypeTarget?.label_th}"?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTypeBlock ? (
                <>
                  หมวดนี้ยังมีข้อมูลผูกอยู่ — ลบไม่ได้จนกว่าจะย้ายออกก่อน:
                  {deleteTypeBlock.topics > 0 && <> ยังมีเกณฑ์ประเมิน {deleteTypeBlock.topics} หัวข้อ</>}
                  {deleteTypeBlock.topics > 0 && deleteTypeBlock.suppliers > 0 && ' และ '}
                  {deleteTypeBlock.suppliers > 0 && <>มี supplier {deleteTypeBlock.suppliers} รายที่ใช้หมวดนี้อยู่</>}
                </>
              ) : 'ลบแล้วไม่สามารถย้อนกลับผ่านประวัติเกณฑ์ได้ (ต่างจากการลบหัวข้อ/ตัวเลือก)'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{deleteTypeBlock ? 'ปิด' : 'ยกเลิก'}</AlertDialogCancel>
            {!deleteTypeBlock && (
              <AlertDialogAction disabled={deletingType} onClick={confirmDeleteType} className="bg-red-600 hover:bg-red-700">
                {deletingType ? 'กำลังลบ...' : 'ลบ'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
