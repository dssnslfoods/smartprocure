import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileBadge, FileText, Zap, UserCheck, CheckCircle2, CircleDashed, Trophy,
  Paperclip, ExternalLink, Trash2, Loader2,
} from 'lucide-react';
import {
  evaluateBrc, loadBrcStandard, loadSupplierEvidence,
  SUPPLIER_TYPES, SUPPLIER_TYPE_LABEL,
  type BrcAssessment, type BrcSupplierType, type BrcTopic, type BrcOption,
  type BrcGradeBand, type BrcManualScore, type BrcEvidence,
  type SupplierCert, type SupplierDoc,
} from '@/lib/brcScoring';

const GRADE_STYLE: Record<string, { badge: string; card: string }> = {
  A: { badge: 'bg-green-600 text-white', card: 'border-green-300 bg-green-50/60' },
  B: { badge: 'bg-blue-600 text-white', card: 'border-blue-300 bg-blue-50/60' },
  C: { badge: 'bg-orange-500 text-white', card: 'border-orange-300 bg-orange-50/60' },
  D: { badge: 'bg-red-600 text-white', card: 'border-red-300 bg-red-50/60' },
};

// Supabase storage object keys must be ASCII-safe (no Thai / spaces)
const safeStorageName = (name: string) => {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'file';
  const ext = dot > 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]+/g, '') : '';
  return `${base}${ext}`;
};

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
  const [certs, setCerts] = useState<SupplierCert[]>([]);
  const [docs, setDocs] = useState<SupplierDoc[]>([]);
  const [manual, setManual] = useState<Record<string, BrcManualScore>>({});
  const [evidence, setEvidence] = useState<BrcEvidence[]>([]);
  const [supplierType, setSupplierType] = useState<BrcSupplierType>('rm_primary_pk');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null); // option id being uploaded
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ topicId: string; optionId: string | null }>({ topicId: '', optionId: null });

  const load = useCallback(async () => {
    setLoading(true);
    const [standard, ev] = await Promise.all([
      loadBrcStandard(),
      loadSupplierEvidence([supplierId]),
    ]);
    setTopics(standard.topics);
    setOptionsByTopic(standard.optionsByTopic);
    setBands(standard.bands);
    setCerts(ev.certsBy[supplierId] || []);
    setDocs(ev.docsBy[supplierId] || []);
    setManual(ev.manualBy[supplierId] || {});
    setEvidence(ev.evidenceBy[supplierId] || []);
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

  const startUpload = (topicId: string, optionId: string | null) => {
    uploadTarget.current = { topicId, optionId };
    fileRef.current?.click();
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { topicId, optionId } = uploadTarget.current;
    if (!topicId) return;

    setUploadingFor(optionId ?? topicId);
    const path = `${supplierId}/brc/${Date.now()}_${safeStorageName(file.name)}`;
    const { error: upErr } = await supabase.storage.from('supplier-documents').upload(path, file);
    if (upErr) {
      toast({ title: 'อัปโหลดไม่สำเร็จ', description: upErr.message, variant: 'destructive' });
      setUploadingFor(null);
      return;
    }
    const { data: urlData } = supabase.storage.from('supplier-documents').getPublicUrl(path);
    const { error: insErr } = await supabase.from('brc_evidence' as any).insert({
      supplier_id: supplierId,
      topic_id: topicId,
      option_id: optionId,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_size: file.size,
      uploaded_by: user?.id ?? null,
    });
    if (insErr) {
      toast({ title: 'บันทึกเอกสารไม่สำเร็จ', description: insErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'แนบเอกสารเรียบร้อย', description: file.name });
      await load();
      onRiskUpdated?.();
    }
    setUploadingFor(null);
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

  const brc: BrcAssessment = evaluateBrc(supplierType, topics, optionsByTopic, certs, docs, manual, bands, undefined, evidence);
  const gs = brc.grade ? GRADE_STYLE[brc.grade] : null;
  const sections = Array.from(new Set(brc.topics.map(r => r.topic.section)));

  return (
    <div className="space-y-4">
      {/* Hidden shared file input for per-item uploads */}
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={handleFilePicked} />

      {/* Type + grade summary */}
      <Card className={gs?.card || ''}>
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
                <p className="text-[11px] text-muted-foreground">อัปโหลดเอกสารประกอบในแต่ละข้อด้านล่าง เพื่อให้ระบบให้คะแนนอัตโนมัติ</p>
              )}
            </div>
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
          </div>
        </CardContent>
      </Card>

      {/* Topics per section */}
      {sections.map(section => (
        <div key={section} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{section}</h3>
          {brc.topics.filter(r => r.topic.section === section).map(r => {
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
                        {r.pending
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
                            return (
                              <div key={o.id} className={`rounded-md border px-2.5 py-1.5 ${met ? 'border-green-200 bg-green-50/50' : 'border-muted'}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {met
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                    : <CircleDashed className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />}
                                  {o.match_type === 'certificate' ? <FileBadge className="w-3 h-3 text-blue-500 shrink-0" />
                                    : o.match_type === 'document' ? <FileText className="w-3 h-3 text-violet-500 shrink-0" />
                                    : <UserCheck className="w-3 h-3 text-slate-500 shrink-0" />}
                                  <span className={`text-xs ${met ? 'font-medium' : 'text-muted-foreground'}`}>{o.label}</span>
                                  <span className="text-xs text-muted-foreground">(+{Number(o.score)})</span>
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
                                      disabled={uploadingFor !== null}
                                      onClick={() => startUpload(t.id, o.id)}
                                    >
                                      {uploadingFor === o.id
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Paperclip className="w-3 h-3" />}
                                      แนบไฟล์
                                    </Button>
                                  )}
                                </div>
                                {optEvidence.length > 0 && (
                                  <div className="mt-1 ml-6 space-y-0.5">
                                    {optEvidence.map(ev => (
                                      <div key={ev.id} className="flex items-center gap-1.5 text-[11px]">
                                        <a href={ev.file_url} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-primary hover:underline">
                                          <ExternalLink className="w-3 h-3" />
                                          {ev.file_name.length > 40 ? ev.file_name.slice(0, 40) + '…' : ev.file_name}
                                        </a>
                                        <span className="text-muted-foreground">
                                          {ev.file_size ? `(${(ev.file_size / 1024).toFixed(0)} KB)` : ''} · {new Date(ev.created_at).toLocaleDateString('th-TH')}
                                        </span>
                                        {canUpload && (
                                          <button onClick={() => deleteEvidence(ev)} className="text-muted-foreground hover:text-destructive">
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
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
                      <p className={`text-lg font-bold tabular-nums ${r.pending ? 'text-amber-500' : r.score >= r.maxScore ? 'text-green-600' : r.score > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                        {r.pending ? '—' : r.score}<span className="text-xs text-muted-foreground font-normal">/{r.maxScore}</span>
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Grade bands reference */}
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
    </div>
  );
}
