import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  FileBadge, FileText, Zap, UserCheck, CheckCircle2, CircleDashed, Trophy,
  Paperclip, ExternalLink, Trash2, Loader2, Sparkles, AlertTriangle, Clock, XCircle,
} from 'lucide-react';
import {
  evaluateBrc, loadBrcStandard, loadSupplierEvidence, groupWeightsFor,
  SUPPLIER_TYPES, SUPPLIER_TYPE_LABEL,
  type BrcAssessment, type BrcSupplierType, type BrcTopic, type BrcOption,
  type BrcGradeBand, type BrcManualScore, type BrcEvidence, type BrcCategoryWeight,
  type SupplierCert, type SupplierDoc,
} from '@/lib/brcScoring';
import { expiryStatus } from '@/lib/dateUtils';
import { safeStorageName } from '@/lib/companyDocs';

const GRADE_STYLE: Record<string, { badge: string; card: string }> = {
  A: { badge: 'bg-green-600 text-white', card: 'border-green-300 bg-green-50/60' },
  B: { badge: 'bg-blue-600 text-white', card: 'border-blue-300 bg-blue-50/60' },
  C: { badge: 'bg-orange-500 text-white', card: 'border-orange-300 bg-orange-50/60' },
  D: { badge: 'bg-red-600 text-white', card: 'border-red-300 bg-red-50/60' },
};


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

interface VerifyResult {
  is_valid_document: boolean;
  doc_type_found: string | null;
  matches_requirement: boolean;
  company_name_found: string | null;
  company_match: boolean | null;
  issued_date: string | null;
  expiry_date: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

const evidenceExpiry = (expiry: string | null) => expiryStatus(expiry, 30);

interface Props {
  supplierId: string;
  onRiskUpdated?: () => void;
  /** Supplier-portal mode: supplier uploads evidence per item but cannot change type or manual picks. */
  portalMode?: boolean;
}

export default function SupplierBrcAssessment({ supplierId, onRiskUpdated, portalMode = false }: Props) {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole('admin') || hasRole('procurement_officer') || hasRole('approver');
  const canUpload = portalMode || canEdit;

  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<BrcTopic[]>([]);
  const [optionsByTopic, setOptionsByTopic] = useState<Record<string, BrcOption[]>>({});
  const [bands, setBands] = useState<BrcGradeBand[]>([]);
  const [weightsByType, setWeightsByType] = useState<Record<string, BrcCategoryWeight>>({});
  const [certs, setCerts] = useState<SupplierCert[]>([]);
  const [docs, setDocs] = useState<SupplierDoc[]>([]);
  const [manual, setManual] = useState<Record<string, BrcManualScore>>({});
  const [evidence, setEvidence] = useState<BrcEvidence[]>([]);
  const [supplierType, setSupplierType] = useState<BrcSupplierType>('rm_primary_pk');
  const [companyName, setCompanyName] = useState('');

  // AI verification dialog state
  const [verify, setVerify] = useState<null | {
    file: File;
    topic: BrcTopic;
    option: BrcOption | null;
    checking: boolean;
    saving: boolean;
    result?: VerifyResult;
    error?: string;
  }>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ topic: BrcTopic; option: BrcOption | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [standard, ev, supRes] = await Promise.all([
      loadBrcStandard(),
      loadSupplierEvidence([supplierId]),
      supabase.from('suppliers').select('company_name').eq('id', supplierId).single(),
    ]);
    setTopics(standard.topics);
    setOptionsByTopic(standard.optionsByTopic);
    setBands(standard.bands);
    setWeightsByType(standard.weightsByType);
    setCerts(ev.certsBy[supplierId] || []);
    setDocs(ev.docsBy[supplierId] || []);
    setManual(ev.manualBy[supplierId] || {});
    setEvidence(ev.evidenceBy[supplierId] || []);
    setCompanyName(supRes.data?.company_name || '');
    const st = ev.typesBy[supplierId] as BrcSupplierType | null;
    if (st && SUPPLIER_TYPES.includes(st)) setSupplierType(st);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  const changeType = async (st: BrcSupplierType) => {
    setSupplierType(st);
    await supabase.from('suppliers').update({ brc_supplier_type: st } as any).eq('id', supplierId);
    onRiskUpdated?.();
  };

  const pickManual = async (topicId: string, optionId: string) => {
    const { error } = await supabase.from('brc_manual_scores' as any).upsert({
      supplier_id: supplierId,
      topic_id: topicId,
      option_id: optionId === '_none' ? null : optionId,
      scored_by: user?.id ?? null,
      scored_at: new Date().toISOString(),
    }, { onConflict: 'supplier_id,topic_id' });
    if (error) { toast({ title: 'บันทึกไม่สำเร็จ', description: error.message, variant: 'destructive' }); return; }
    setManual(prev => ({ ...prev, [topicId]: { supplier_id: supplierId, topic_id: topicId, option_id: optionId === '_none' ? null : optionId, note: null } }));
    onRiskUpdated?.();
  };

  const startUpload = (topic: BrcTopic, option: BrcOption | null) => {
    uploadTarget.current = { topic, option };
    fileRef.current?.click();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = uploadTarget.current;
    if (!file || !target) return;

    // Open verification dialog and run the AI check
    setVerify({ file, topic: target.topic, option: target.option, checking: true, saving: false });

    const isPdf = file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) {
      // AI can't read office docs — allow but without verification/expiry
      setVerify(v => v ? {
        ...v, checking: false,
        result: {
          is_valid_document: true, doc_type_found: null, matches_requirement: true,
          company_name_found: null, company_match: null, issued_date: null, expiry_date: null,
          confidence: 'low', reason: 'ไฟล์ประเภทนี้ AI ตรวจสอบไม่ได้ (รองรับเฉพาะ PDF/รูปภาพ) — อัปโหลดได้โดยไม่มีการตรวจอัตโนมัติ',
        },
      } : v);
      return;
    }

    try {
      const file_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('verify-brc-evidence', {
        body: {
          file_base64,
          mime_type: file.type,
          company_name: companyName,
          topic: target.topic.topic,
          option_label: target.option?.label ?? target.topic.topic,
          keywords: target.option?.match_keywords ?? [],
        },
      });
      if (error || data?.error) {
        setVerify(v => v ? { ...v, checking: false, error: error?.message || data?.error || 'AI ตรวจสอบไม่สำเร็จ' } : v);
        return;
      }
      setVerify(v => v ? { ...v, checking: false, result: data as VerifyResult } : v);
    } catch (err: any) {
      setVerify(v => v ? { ...v, checking: false, error: err?.message || String(err) } : v);
    }
  };

  const verdictOk = (r: VerifyResult) =>
    r.is_valid_document && r.matches_requirement && r.company_match !== false &&
    evidenceExpiry(r.expiry_date) !== 'expired';

  const doUpload = async () => {
    if (!verify) return;
    const { file, topic, option, result } = verify;
    setVerify(v => v ? { ...v, saving: true } : v);

    const path = `${supplierId}/brc/${Date.now()}_${safeStorageName(file.name)}`;
    const { error: upErr } = await supabase.storage.from('supplier-documents').upload(path, file);
    if (upErr) {
      toast({ title: 'อัปโหลดไม่สำเร็จ', description: upErr.message, variant: 'destructive' });
      setVerify(null);
      return;
    }
    const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(path);
    const { error: insErr } = await supabase.from('brc_evidence' as any).insert({
      supplier_id: supplierId,
      topic_id: topic.id,
      option_id: option?.id ?? null,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_size: file.size,
      expiry_date: result?.expiry_date ?? null,
      note: result ? `AI: ${result.doc_type_found ?? '-'} | ${result.reason}`.slice(0, 500) : null,
      uploaded_by: user?.id ?? null,
    });
    if (insErr) {
      toast({ title: 'บันทึกเอกสารไม่สำเร็จ', description: insErr.message, variant: 'destructive' });
    } else {
      toast({
        title: '✅ แนบเอกสารเรียบร้อย',
        description: result?.expiry_date
          ? `${file.name} — วันหมดอายุ ${new Date(result.expiry_date).toLocaleDateString('th-TH')}`
          : file.name,
      });
      await load();
      onRiskUpdated?.();
    }
    setVerify(null);
  };

  const deleteEvidence = async (ev: BrcEvidence) => {
    const path = ev.file_url.split('/supplier-documents/')[1];
    if (path) await supabase.storage.from('supplier-documents').remove([decodeURIComponent(path)]);
    await supabase.from('brc_evidence' as any).delete().eq('id', ev.id);
    toast({ title: 'ลบเอกสารแล้ว' });
    await load();
    onRiskUpdated?.();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">กำลังโหลด...</div>;

  const brc: BrcAssessment = evaluateBrc(supplierType, topics, optionsByTopic, certs, docs, manual, bands, undefined, evidence, groupWeightsFor(weightsByType, supplierType));
  const gs = brc.grade ? GRADE_STYLE[brc.grade] : null;
  // When commercial weight is 0, BRCGS grades purely on safety/quality — price is
  // scored separately in the RFQ Commercial pillar, so hide the commercial topics here.
  const commercialExcluded = brc.commercialWeight === 0;
  const shownTopics = commercialExcluded ? brc.topics.filter(r => r.topic.criterion_group !== 'commercial') : brc.topics;
  const sections = Array.from(new Set(shownTopics.map(r => r.topic.section)));
  const hasMandatory = shownTopics.some(r => r.options.some(o => o.is_mandatory));
  // Portal shows document completeness instead of score/grade.
  const docsCompleteCount = shownTopics.filter(r => r.matchedOptions.length > 0).length;

  const topicName = (id: string) => topics.find(t => t.id === id)?.topic || '';
  const expiredEvidence = evidence.filter(e => evidenceExpiry(e.expiry_date) === 'expired');
  const expiringEvidence = evidence.filter(e => evidenceExpiry(e.expiry_date) === 'expiring');

  return (
    <div className="space-y-4">
      {/* Hidden shared file input for per-item uploads */}
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={handleFilePicked} />

      {/* Expiry alerts */}
      {expiredEvidence.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p>เอกสารประเมิน <strong>{expiredEvidence.length} ไฟล์</strong> หมดอายุแล้ว — คะแนนข้อดังกล่าวถูกตัดออกจนกว่าจะอัปโหลดฉบับใหม่</p>
            <ul className="mt-1 text-xs list-disc list-inside space-y-0.5">
              {expiredEvidence.map(e => (
                <li key={e.id}>{topicName(e.topic_id)} — {e.file_name} (หมดอายุ {new Date(e.expiry_date!).toLocaleDateString('th-TH')})</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {expiringEvidence.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-yellow-800 text-sm">
          <Clock className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p>เอกสารประเมิน <strong>{expiringEvidence.length} ไฟล์</strong> จะหมดอายุภายใน 30 วัน — ควรขอฉบับต่ออายุจาก supplier</p>
            <ul className="mt-1 text-xs list-disc list-inside space-y-0.5">
              {expiringEvidence.map(e => (
                <li key={e.id}>{topicName(e.topic_id)} — {e.file_name} (หมดอายุ {new Date(e.expiry_date!).toLocaleDateString('th-TH')})</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Type + (staff only) grade summary — the portal never shows score or grade */}
      <Card className={portalMode ? '' : (gs?.card || '')}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-1.5 min-w-[260px]">
              <Label className="text-xs">ประเภท Supplier (BRCGS)</Label>
              <Select value={supplierType} onValueChange={v => changeType(v as BrcSupplierType)} disabled={!canEdit}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPLIER_TYPES.map(st => <SelectItem key={st} value={st}>{SUPPLIER_TYPE_LABEL[st]}</SelectItem>)}
                </SelectContent>
              </Select>
              {portalMode && (
                <p className="text-[11px] text-muted-foreground">อัปโหลดเอกสารประกอบในแต่ละข้อด้านล่าง — AI จะตรวจสอบความถูกต้องและวันหมดอายุให้อัตโนมัติ</p>
              )}
            </div>

            {portalMode ? (
              /* Completeness only — no score, no grade */
              <div className="text-right">
                <p className="text-xs text-muted-foreground">ความครบถ้วนของเอกสาร</p>
                <p className="text-2xl font-bold tabular-nums">
                  {docsCompleteCount} <span className="text-sm text-muted-foreground font-normal">/ {shownTopics.length} หัวข้อ</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {docsCompleteCount >= shownTopics.length
                    ? 'ส่งเอกสารครบทุกหัวข้อแล้ว'
                    : `ยังขาดเอกสาร ${shownTopics.length - docsCompleteCount} หัวข้อ`}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">คะแนนรวม (ส่วนที่ประเมินได้)</p>
                  <p className="text-2xl font-bold tabular-nums">{brc.totalScore} <span className="text-sm text-muted-foreground font-normal">/ {brc.assessedMax}</span></p>
                  {brc.pendingCount > 0 && (
                    <p className="text-[11px] text-amber-600">รอประเมิน {brc.pendingCount} หัวข้อ (Competition ประเมิน auto ตอน RFQ)</p>
                  )}
                </div>
                {brc.grade && (
                  <div className="text-center">
                    <span className={`inline-flex items-center justify-center w-14 h-14 rounded-full text-2xl font-bold ${gs?.badge}`}>{brc.grade}</span>
                    <p className="text-[11px] text-muted-foreground mt-1 max-w-[140px]">{brc.gradeLabel?.split('/')[0]}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Group breakdown + grading note — staff only */}
          {!portalMode && (
            <>
              <div className="mt-4 pt-3 border-t space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">ความปลอดภัย & คุณภาพ</span>
                  <span className="text-muted-foreground">น้ำหนัก {brc.safetyWeight}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${brc.safetyPercent ?? 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {brc.safetyPercent == null ? 'ยังไม่มีข้อมูล (รอประเมิน)' : `ได้ ${brc.safetyPercent}% · ${brc.safetyScore}/${brc.safetyMax} คะแนน`}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {commercialExcluded
                  ? 'เกรด BRCGS คิดจากเกณฑ์ความปลอดภัย/คุณภาพ 100% ตาม BRCGS Clause 3.5.1.3 — ราคา/การส่งมอบ/เครดิต ประเมินแยกที่ขั้นตอนเปรียบเทียบราคา (Commercial) ใน RFQ'
                  : `เกรดคำนวณแบบถ่วงน้ำหนัก — ความปลอดภัย ${brc.safetyWeight}% / เชิงพาณิชย์ ${brc.commercialWeight}% · คะแนนถ่วงน้ำหนักรวม ${brc.percent}%`}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Mandatory qualification gate */}
      {hasMandatory && (
        brc.mandatoryFailures.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">ไม่ผ่านเอกสารบังคับ — ยังเข้าร่วม RFQ หมวดนี้ไม่ได้</p>
              <ul className="mt-1 text-xs list-disc list-inside space-y-0.5">
                {brc.mandatoryFailures.map((f, i) => (
                  <li key={i}>{f.topic}: ต้องมีอย่างน้อย 1 ใน — {f.options.join(' / ')}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-800 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>ผ่านเอกสารบังคับครบ — มีสิทธิ์เข้าร่วม RFQ ของหมวดนี้</span>
          </div>
        )
      )}

      {/* Topics per section */}
      {sections.map(section => (
        <div key={section} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section}</h3>
          {shownTopics.filter(r => r.topic.section === section).map(r => {
            const t = r.topic;
            const isQuotation = t.auto_source === 'quotation';
            const manualOptions = r.options.filter(o => o.match_type === 'manual');
            const hasManualChoice = t.auto_source === 'manual' || manualOptions.length > 0;
            const selected = manual[t.id]?.option_id ?? '_none';
            const matchedIds = new Set(r.matchedOptions.map(m => m.option.id));
            const viaOf = (optId: string) => r.matchedOptions.find(m => m.option.id === optId)?.via;
            return (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        {portalMode
                          /* Portal: submitted vs not — colour must not hint at the score */
                          ? (r.matchedOptions.length > 0
                              ? <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                              : <CircleDashed className="w-4 h-4 shrink-0 text-muted-foreground/50" />)
                          : r.pending
                            ? <CircleDashed className="w-4 h-4 text-amber-500 shrink-0" />
                            : <CheckCircle2 className={`w-4 h-4 shrink-0 ${r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-500' : 'text-red-400'}`} />}
                        <span className="font-medium text-sm">{t.topic}</span>
                        {isQuotation && (
                          <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-50 text-amber-700 border border-amber-200">
                            <Zap className="w-3 h-3" />Auto ตอน RFQ
                          </Badge>
                        )}
                      </div>

                      {isQuotation ? (
                        <p className="text-xs text-muted-foreground mt-1">ระบบให้คะแนนอัตโนมัติจากใบเสนอราคาตอนเปรียบเทียบใน RFQ (ราคา / การส่งมอบ / เครดิตเทอม) — ไม่ต้องแนบเอกสาร</p>
                      ) : (
                        /* Per-option checklist with attach buttons */
                        <div className="mt-2 space-y-1.5">
                          {r.options.map(o => {
                            const met = matchedIds.has(o.id);
                            const via = viaOf(o.id);
                            const optEvidence = r.evidence.filter(e => e.option_id === o.id);
                            const isManualOpt = o.match_type === 'manual';
                            const mandatoryUnmet = o.is_mandatory && !met;
                            return (
                              <div key={o.id} className={`rounded-md border px-2.5 py-1.5 ${met ? 'border-green-200 bg-green-50/50' : mandatoryUnmet ? 'border-red-300 bg-red-50/50' : 'border-muted'}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {met
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                    : <CircleDashed className={`w-3.5 h-3.5 shrink-0 ${mandatoryUnmet ? 'text-red-500' : 'text-muted-foreground/50'}`} />}
                                  {o.match_type === 'certificate' ? <FileBadge className="w-3 h-3 text-blue-500 shrink-0" />
                                    : o.match_type === 'document' ? <FileText className="w-3 h-3 text-violet-500 shrink-0" />
                                    : <UserCheck className="w-3 h-3 text-slate-500 shrink-0" />}
                                  <span className={`text-xs ${met ? 'font-medium' : 'text-muted-foreground'}`}>{o.label}</span>
                                  {o.is_mandatory ? (
                                    <Badge variant="outline" className="text-[9px] gap-0.5 border-red-300 bg-red-50 text-red-700 py-0">
                                      <AlertTriangle className="w-2.5 h-2.5" />{portalMode ? 'บังคับ' : 'บังคับ · ไม่คิดคะแนน'}
                                    </Badge>
                                  ) : !portalMode && (
                                    <span className="text-xs text-muted-foreground">(+{Number(o.score)})</span>
                                  )}
                                  {met && via && via !== 'manual' && via !== 'quotation' && (
                                    <span className="text-[10px] text-green-700">— พบ: {via}</span>
                                  )}
                                  {isManualOpt && (
                                    <span className="text-[10px] text-muted-foreground">({portalMode ? 'เจ้าหน้าที่เป็นผู้ประเมิน — แนบเอกสารประกอบได้' : 'ประเมินเอง'})</span>
                                  )}
                                  {canUpload && (
                                    <Button
                                      variant="ghost" size="sm"
                                      className="h-6 px-2 text-[11px] gap-1 ml-auto shrink-0"
                                      disabled={verify !== null}
                                      onClick={() => startUpload(t, o)}
                                    >
                                      <Paperclip className="w-3 h-3" />
                                      แนบไฟล์
                                    </Button>
                                  )}
                                </div>
                                {optEvidence.length > 0 && (
                                  <div className="mt-1 ml-6 space-y-0.5">
                                    {optEvidence.map(ev => {
                                      const exp = evidenceExpiry(ev.expiry_date);
                                      return (
                                        <div key={ev.id} className="flex items-center gap-1.5 text-[11px] flex-wrap">
                                          <a href={ev.file_url} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary hover:underline">
                                            <ExternalLink className="w-3 h-3" />
                                            {ev.file_name.length > 40 ? ev.file_name.slice(0, 40) + '…' : ev.file_name}
                                          </a>
                                          <span className="text-muted-foreground">
                                            {ev.file_size ? `(${(ev.file_size / 1024).toFixed(0)} KB)` : ''} · {new Date(ev.created_at).toLocaleDateString('th-TH')}
                                          </span>
                                          {ev.expiry_date && (
                                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[10px] font-medium ${
                                              exp === 'expired' ? 'border-red-200 bg-red-50 text-red-700'
                                              : exp === 'expiring' ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                              : exp === 'invalid' ? 'border-amber-300 bg-amber-50 text-amber-800'
                                              : 'border-green-200 bg-green-50 text-green-700'
                                            }`}>
                                              {exp === 'expired' || exp === 'invalid' ? <AlertTriangle className="w-2.5 h-2.5" /> : exp === 'expiring' ? <Clock className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                                              {exp === 'invalid' ? 'วันหมดอายุไม่ถูกต้อง' : `หมดอายุ ${new Date(ev.expiry_date!).toLocaleDateString('th-TH')}`}
                                            </span>
                                          )}
                                          {canUpload && (
                                            <button onClick={() => deleteEvidence(ev)} className="text-muted-foreground hover:text-destructive">
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Manual evaluation dropdown (staff only) */}
                      {hasManualChoice && !isQuotation && !portalMode && (
                        <div className="mt-2 max-w-md">
                          <Select value={selected} onValueChange={v => pickManual(t.id, v)} disabled={!canEdit}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="เลือกผลประเมิน (Manual)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none" className="text-xs text-muted-foreground">— ยังไม่ประเมิน —</SelectItem>
                              {(t.auto_source === 'manual' ? r.options : manualOptions).map(o => (
                                <SelectItem key={o.id} value={o.id} className="text-xs">
                                  {o.label} (+{Number(o.score)}){o.requirement ? ` — ${o.requirement}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {portalMode ? (
                        /* Status only — the supplier never sees the score */
                        r.matchedOptions.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-green-300 bg-green-50 text-green-700">
                            <CheckCircle2 className="w-3 h-3" />ส่งแล้ว
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 bg-amber-50 text-amber-700">
                            <CircleDashed className="w-3 h-3" />ยังไม่ส่ง
                          </Badge>
                        )
                      ) : (
                        <p className={`text-lg font-bold tabular-nums ${r.pending ? 'text-amber-500' : r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                          {r.pending ? '—' : r.score}<span className="text-xs text-muted-foreground font-normal">/{r.maxScore}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Grade bands reference — staff only */}
      {!portalMode && (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />ช่วงคะแนนเกรด — {SUPPLIER_TYPE_LABEL[supplierType]}</p>
          <div className="flex gap-2 flex-wrap">
            {bands.filter(b => b.supplier_type === supplierType).sort((a, b) => b.min_score - a.min_score).map(b => (
              <Badge key={b.grade} variant="outline" className="text-xs">
                <span className="font-bold mr-1">{b.grade}</span> {b.min_score}–{b.max_score} · {b.label_th.split('/')[0].trim()}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      {/* AI verification dialog */}
      <Dialog open={verify !== null} onOpenChange={v => { if (!v && !verify?.saving) setVerify(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-4 h-4 text-primary" /> AI ตรวจสอบเอกสาร
            </DialogTitle>
          </DialogHeader>

          {verify && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium">{verify.file.name}</p>
                <p className="text-muted-foreground mt-0.5">
                  ข้อประเมิน: {verify.option?.label ?? verify.topic.topic}
                </p>
              </div>

              {verify.checking && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-primary">AI กำลังตรวจสอบเอกสาร...</p>
                  <p className="text-xs text-muted-foreground text-center">ตรวจประเภทเอกสาร · ชื่อบริษัท · วันหมดอายุ<br />ว่าตรงตามข้อประเมินหรือไม่</p>
                </div>
              )}

              {verify.error && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> AI ตรวจสอบไม่สำเร็จ</p>
                  <p className="mt-0.5">{verify.error}</p>
                  <p className="mt-1">สามารถอัปโหลดต่อได้ แต่จะไม่มีการบันทึกวันหมดอายุอัตโนมัติ</p>
                </div>
              )}

              {verify.result && !verify.checking && (() => {
                const r = verify.result;
                const ok = verdictOk(r);
                const expired = evidenceExpiry(r.expiry_date) === 'expired';
                const rows: { label: string; ok: boolean | null; text: string }[] = [
                  { label: 'ประเภทเอกสาร', ok: r.is_valid_document && r.matches_requirement, text: r.doc_type_found || (r.is_valid_document ? '—' : 'ไม่ใช่เอกสาร/อ่านไม่ได้') },
                  { label: 'ชื่อบริษัท', ok: r.company_match, text: r.company_name_found || 'ไม่พบชื่อบริษัทในเอกสาร' },
                  { label: 'วันหมดอายุ', ok: r.expiry_date ? !expired : null, text: r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('th-TH') + (expired ? ' (หมดอายุแล้ว)' : '') : 'ไม่มี/ไม่พบวันหมดอายุ' },
                ];
                return (
                  <>
                    <div className={`rounded-lg border px-3 py-2 ${ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                      <p className={`text-sm font-semibold flex items-center gap-1.5 ${ok ? 'text-green-700' : 'text-red-700'}`}>
                        {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {ok ? 'เอกสารถูกต้อง ตรงตามข้อประเมิน' : 'เอกสารไม่ผ่านการตรวจสอบ'}
                        <span className="text-[10px] font-normal opacity-70 uppercase">ความมั่นใจ: {r.confidence === 'high' ? 'สูง' : r.confidence === 'medium' ? 'ปานกลาง' : 'ต่ำ'}</span>
                      </p>
                      {r.reason && <p className={`text-xs mt-1 ${ok ? 'text-green-800/80' : 'text-red-800/80'}`}>{r.reason}</p>}
                    </div>
                    <div className="space-y-1">
                      {rows.map(row => (
                        <div key={row.label} className="flex items-center gap-2 text-xs">
                          {row.ok === true ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                            : row.ok === false ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            : <CircleDashed className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                          <span className="text-muted-foreground w-24 shrink-0">{row.label}</span>
                          <span className="font-medium">{row.text}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}

              {!verify.checking && (
                <DialogFooter className="gap-2">
                  <Button variant="outline" size="sm" disabled={verify.saving} onClick={() => setVerify(null)}>ยกเลิก</Button>
                  {(verify.error || (verify.result && verdictOk(verify.result))) && (
                    <Button size="sm" onClick={doUpload} disabled={verify.saving}>
                      {verify.saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> กำลังบันทึก...</> : 'ยืนยันอัปโหลด'}
                    </Button>
                  )}
                  {verify.result && !verdictOk(verify.result) && canEdit && !portalMode && (
                    <Button size="sm" variant="destructive" onClick={doUpload} disabled={verify.saving}>
                      {verify.saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> กำลังบันทึก...</> : 'อัปโหลดทั้งที่ไม่ผ่าน (เจ้าหน้าที่)'}
                    </Button>
                  )}
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
