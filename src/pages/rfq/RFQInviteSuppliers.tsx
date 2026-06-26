import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, UserPlus, Building2, ShieldOff, XCircle, CheckCircle2, Trash2, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import RiskBadge, { EligibilityBadge } from '@/components/RiskBadge';
import { checkSupplierEligibility } from '@/lib/eligibility';
import { computeRfqBidRisk, risk10ToLevel, type BidRiskResult } from '@/lib/bidRisk';
import { computeDimensionRisks, DIMENSION_LABEL, type RiskCriterion, type SupplierCert, type SupplierDoc } from '@/lib/riskCriteria';
import type { EligibilityResult } from '@/types/procurement';

interface ExpiredCert { certificate_type: string | null; expiry_date: string | null; }

interface Props {
  rfqId: string;
  rfqStatus: string;
  onUpdate: () => void;
}

interface SupplierWithEligibility {
  id: string;
  company_name: string;
  email: string | null;
  tier: string | null;
  status: string;
  supplier_type: string | null;
  risk_level: string | null;
  certificate_expiry_date: string | null;
  qa_approval_status: string | null;
  is_blacklisted: boolean;
  eligibility: EligibilityResult;
}

export default function RFQInviteSuppliers({ rfqId, rfqStatus, onUpdate }: Props) {
  const [allSuppliers, setAllSuppliers] = useState<SupplierWithEligibility[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [inviteMeta, setInviteMeta] = useState<Record<string, { responded: boolean; declined_at: string | null; declined_reason: string | null }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [brcScores, setBrcScores] = useState<Record<string, { score: number; risk10: number; met: number; total: number }>>({});
  const [bidRisk, setBidRisk] = useState<BidRiskResult | null>(null);
  const [expiredCerts, setExpiredCerts] = useState<Record<string, ExpiredCert[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SupplierWithEligibility | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removals, setRemovals] = useState<{ supplier_id: string; reason: string; removed_at: string; removed_by_name: string | null }[]>([]);
  const { hasRole, user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const [suppRes, invRes] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id, company_name, email, tier, status, supplier_type, risk_level, certificate_expiry_date, qa_approval_status, is_blacklisted')
          .neq('status', 'draft')
          .order('company_name'),
        supabase.from('rfq_suppliers')
          .select('supplier_id, responded, declined_at, declined_reason')
          .eq('rfq_id', rfqId),
      ]);

      const rawSuppliers = suppRes.data || [];
      const supplierIds = rawSuppliers.map((s: any) => s.id);

      // Compute BRC scores for ALL suppliers (for sorting Available list)
      const [critRes, allCertRes, allDocRes] = await Promise.all([
        supabase.from('risk_criteria').select('*').eq('active', true),
        supplierIds.length ? supabase.from('supplier_certificates').select('supplier_id, certificate_type, expiry_date').in('supplier_id', supplierIds) : Promise.resolve({ data: [] as any[] }),
        supplierIds.length ? supabase.from('supplier_documents').select('supplier_id, document_type, document_name').in('supplier_id', supplierIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const criteria = (critRes.data as RiskCriterion[]) || [];
      const certsBy: Record<string, SupplierCert[]> = {};
      (allCertRes.data || []).forEach((c: any) => (certsBy[c.supplier_id] ??= []).push(c));
      const docsBy: Record<string, SupplierDoc[]> = {};
      (allDocRes.data || []).forEach((d: any) => (docsBy[d.supplier_id] ??= []).push(d));

      const scores: Record<string, { score: number; risk10: number; met: number; total: number }> = {};
      if (criteria.length > 0) {
        for (const s of rawSuppliers) {
          const dims = computeDimensionRisks(criteria, certsBy[s.id] || [], docsBy[s.id] || [], 'all');
          const dimList = Object.values(dims);
          const totalC = dimList.reduce((a, d) => a + d.criteria.length, 0);
          const metC = dimList.reduce((a, d) => a + d.criteria.filter(c => c.met).length, 0);
          const wSum = dimList.reduce((a, d) => a + d.totalWeight, 0);
          const hasMandatoryUnmet = dimList.some(d => d.mandatoryUnmet);
          const risk10 = hasMandatoryUnmet ? 10 : wSum > 0 ? dimList.reduce((a, d) => a + (d.score ?? 0) * d.totalWeight, 0) / wSum : 0;
          scores[s.id] = { score: Math.round((1 - risk10 / 10) * 100), risk10, met: metC, total: totalC };
        }
      }
      setBrcScores(scores);

      if (rawSuppliers.length) {
        const enriched: SupplierWithEligibility[] = rawSuppliers.map((s: any) => ({
          ...s,
          eligibility: checkSupplierEligibility(s),
        }));
        setAllSuppliers(enriched);
      }
      const invitedIdList: string[] = (invRes.data || []).map((r: any) => r.supplier_id);
      if (invRes.data) {
        setInvitedIds(new Set(invitedIdList));
        const meta: Record<string, any> = {};
        invRes.data.forEach((r: any) => {
          meta[r.supplier_id] = {
            responded: r.responded,
            declined_at: r.declined_at,
            declined_reason: r.declined_reason,
          };
        });
        setInviteMeta(meta);
      }

      // BRC risk (from เกณฑ์ความเสี่ยง of this RFQ's catalog) + expired certificates.
      if (invitedIdList.length > 0) {
        const [risk, certRes] = await Promise.all([
          computeRfqBidRisk(rfqId, invitedIdList),
          supabase.from('supplier_certificates')
            .select('supplier_id, certificate_type, expiry_date').in('supplier_id', invitedIdList),
        ]);
        setBidRisk(risk);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const exp: Record<string, ExpiredCert[]> = {};
        (certRes.data || []).forEach((c: any) => {
          if (c.expiry_date && new Date(c.expiry_date) < today) (exp[c.supplier_id] ??= []).push(c);
        });
        setExpiredCerts(exp);
      } else {
        setBidRisk(null);
        setExpiredCerts({});
      }

      // Fetch removal history
      const { data: remData } = await supabase.from('rfq_supplier_removals')
        .select('supplier_id, reason, removed_at, removed_by')
        .eq('rfq_id', rfqId)
        .order('removed_at', { ascending: false });
      if (remData && remData.length > 0) {
        const userIds = [...new Set(remData.map((r: any) => r.removed_by).filter(Boolean))];
        let nameMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles')
            .select('id, full_name, email').in('id', userIds);
          (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || '—'; });
        }
        setRemovals(remData.map((r: any) => ({
          supplier_id: r.supplier_id,
          reason: r.reason,
          removed_at: r.removed_at,
          removed_by_name: r.removed_by ? (nameMap[r.removed_by] || '—') : null,
        })));
      } else {
        setRemovals([]);
      }

      setLoading(false);
    };
    fetch();
  }, [rfqId, invitedIds.size]);

  const toggle = (id: string, canInvite: boolean) => {
    if (!canInvite) return;
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleInvite = async () => {
    if (selected.size === 0) return;
    setSaving(true);

    const rows = Array.from(selected).map(supplier_id => {
      const s = allSuppliers.find(x => x.id === supplier_id);
      return {
        rfq_id: rfqId,
        supplier_id,
        eligibility_status: s?.eligibility.status ?? 'eligible',
        eligibility_notes: s?.eligibility.reasons.join('; ') || null,
      };
    });

    const { error } = await supabase.from('rfq_suppliers').insert(rows);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Suppliers invited', description: `${selected.size} supplier(s) invited to RFQ` });
      setSelected(new Set());
      setInvitedIds(prev => new Set([...prev, ...selected]));
      onUpdate();
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || !removeReason.trim()) return;
    setSaving(true);
    await supabase.from('rfq_supplier_removals').insert({
      rfq_id: rfqId,
      supplier_id: removeTarget.id,
      reason: removeReason.trim(),
      removed_by: user?.id || null,
    });
    await supabase.from('rfq_suppliers').delete().eq('rfq_id', rfqId).eq('supplier_id', removeTarget.id);
    setSaving(false);
    setInvitedIds(prev => { const n = new Set(prev); n.delete(removeTarget.id); return n; });
    toast({ title: 'นำ Supplier ออกแล้ว', description: `${removeTarget.company_name} — ${removeReason.trim()}` });
    setRemoveTarget(null);
    setRemoveReason('');
    onUpdate();
  };

  const canEdit = (hasRole('admin') || hasRole('procurement_officer')) && (rfqStatus === 'draft' || rfqStatus === 'published');

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const invited = allSuppliers.filter(s => invitedIds.has(s.id));
  const available = allSuppliers.filter(s => !invitedIds.has(s.id)).sort((a, b) => {
    const sa = brcScores[a.id];
    const sb = brcScores[b.id];
    if (sa && sb) return sb.score - sa.score;
    if (sa) return -1;
    if (sb) return 1;
    return a.company_name.localeCompare(b.company_name);
  });
  const warnings = available.filter(s => s.eligibility.status === 'warning' || s.eligibility.status === 'requires_qa' || s.eligibility.status === 'requires_nomination');

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">
            {warnings.length} supplier(s) have eligibility warnings. Review before inviting.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Invited ({invited.length})</CardTitle></CardHeader>
          <CardContent>
            {invited.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No suppliers invited yet</p>
            ) : (
              <div className="space-y-2">
                {invited.map(s => {
                  const meta = inviteMeta[s.id];
                  const isDeclined = !!meta?.declined_at;
                  return (
                  <div key={s.id} className={`p-3 border rounded-lg ${isDeclined ? 'bg-red-50/50 border-red-200' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className={`w-4 h-4 shrink-0 ${isDeclined ? 'text-red-500' : 'text-primary'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.company_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {(() => {
                              const r = bidRisk?.bySupplier[s.id];
                              if (bidRisk?.hasCriteria && r) {
                                return (
                                  <span className="inline-flex items-center gap-1">
                                    <RiskBadge level={r.level} />
                                    {r.assessed && <span className="text-[10px] text-muted-foreground">BRC {r.risk10.toFixed(1)}/10</span>}
                                  </span>
                                );
                              }
                              return <RiskBadge level={s.risk_level as any} />;
                            })()}
                            <EligibilityBadge status={s.eligibility.status} />
                            {isDeclined ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                                <XCircle className="h-3 w-3" />ถอนตัว
                              </span>
                            ) : meta?.responded ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />ตอบแล้ว
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600">
                                รอตอบ
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {canEdit && (
                        <Button variant="ghost" size="sm" className="text-xs shrink-0 ml-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setRemoveTarget(s); setRemoveReason(''); }}>
                          <Trash2 className="w-3 h-3 mr-1" />นำออก
                        </Button>
                      )}
                    </div>
                    {isDeclined && meta?.declined_reason && (
                      <div className="mt-2 pt-2 border-t border-red-200 text-xs text-red-700">
                        <span className="font-medium">เหตุผลที่ถอนตัว:</span> {meta.declined_reason}
                        <div className="text-[10px] text-red-600/70 mt-0.5">
                          แจ้งเมื่อ {meta.declined_at && new Date(meta.declined_at).toLocaleString('th-TH')}
                        </div>
                      </div>
                    )}

                    {/* Expired certificates */}
                    {(expiredCerts[s.id]?.length ?? 0) > 0 && (
                      <div className="mt-2 pt-2 border-t text-[11px]">
                        <p className="flex items-center gap-1 text-red-600 font-medium">
                          <AlertTriangle className="w-3 h-3" />ใบรับรองหมดอายุ ({expiredCerts[s.id].length})
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {expiredCerts[s.id].map((c, i) => (
                            <li key={i} className="text-red-600/90 flex items-center justify-between gap-2">
                              <span>{c.certificate_type || 'ใบรับรอง'}</span>
                              <span className="text-red-500/80">หมดอายุ {c.expiry_date && new Date(c.expiry_date).toLocaleDateString('th-TH')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* BRC risk breakdown — dimensions that fail / lack evidence */}
                    {(() => {
                      const r = bidRisk?.hasCriteria ? bidRisk.bySupplier[s.id] : null;
                      if (!r || !r.assessed) return null;
                      const dims = Object.values(r.dims).filter(d => d.score != null);
                      if (dims.length === 0) return null;
                      return (
                        <div className="mt-2 pt-2 border-t text-[11px] space-y-1">
                          <p className="text-muted-foreground font-medium">รายละเอียดความเสี่ยง (BRC)</p>
                          {dims.map((d, i) => {
                            const unmet = d.criteria.filter(c => !c.met);
                            return (
                              <div key={i} className="flex items-start justify-between gap-2">
                                <span className={d.mandatoryUnmet || (d.score as number) >= 6 ? 'text-red-600' : 'text-muted-foreground'}>
                                  {DIMENSION_LABEL[d.dimension] || d.dimension}
                                  {unmet.length > 0 && <span className="text-muted-foreground"> — ขาด: {unmet.map(c => c.name_th).join(', ')}</span>}
                                  {d.mandatoryUnmet && <span className="text-red-600 font-medium"> (ขาดเกณฑ์บังคับ)</span>}
                                </span>
                                <span className={`shrink-0 tabular-nums ${(d.score as number) >= 6 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>{d.score}/10</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {canEdit && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Available ({available.length})</CardTitle>
              <Button size="sm" disabled={selected.size === 0 || saving} onClick={handleInvite}>
                <UserPlus className="w-4 h-4 mr-1" />
                {saving ? 'Inviting...' : `Invite (${selected.size})`}
              </Button>
            </CardHeader>
            <CardContent>
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">All suppliers have been invited</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {available.map(s => {
                    const { canInvite, status, reasons } = s.eligibility;
                    const isBlocked = !canInvite;

                    return (
                      <label
                        key={s.id}
                        className={`flex items-start gap-3 p-3 border rounded-lg transition-colors ${
                          isBlocked
                            ? 'opacity-60 cursor-not-allowed bg-muted/30'
                            : 'cursor-pointer hover:bg-muted/30'
                        }`}
                      >
                        <Checkbox
                          checked={selected.has(s.id)}
                          onCheckedChange={() => toggle(s.id, canInvite)}
                          disabled={isBlocked}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{s.company_name}</p>
                            {isBlocked && <ShieldOff className="w-3.5 h-3.5 text-red-500" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {brcScores[s.id] ? (
                              <RiskBadge level={risk10ToLevel(brcScores[s.id].risk10)} />
                            ) : (
                              <RiskBadge level={s.risk_level as any} />
                            )}
                            <EligibilityBadge status={status} />
                            {brcScores[s.id] && (
                              <Badge variant="outline" className={`text-[10px] gap-0.5 ${
                                brcScores[s.id].score >= 75 ? 'border-green-300 bg-green-50 text-green-700' :
                                brcScores[s.id].score >= 50 ? 'border-amber-300 bg-amber-50 text-amber-700' :
                                'border-red-300 bg-red-50 text-red-700'
                              }`}>
                                BRC {brcScores[s.id].met}/{brcScores[s.id].total}
                              </Badge>
                            )}
                          </div>
                          {reasons.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                              {reasons.map((r, i) => (
                                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-yellow-500" />
                                  {r}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Removal history */}
      {removals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              ประวัติการนำออก ({removals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {removals.map((r, i) => {
                const sup = allSuppliers.find(s => s.id === r.supplier_id);
                return (
                  <div key={i} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/20">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium">{sup?.company_name || 'Supplier ที่ถูกลบ'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">เหตุผล: {r.reason}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        นำออกโดย {r.removed_by_name || '—'} · {new Date(r.removed_at).toLocaleString('th-TH')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeTarget} onOpenChange={open => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>นำ Supplier ออกจาก RFQ</DialogTitle>
            <DialogDescription>
              {removeTarget?.company_name} — กรุณาระบุเหตุผลในการนำออก เพื่อเก็บเป็นประวัติ
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>เหตุผล *</Label>
            <Textarea
              value={removeReason}
              onChange={e => setRemoveReason(e.target.value)}
              placeholder="เช่น Supplier ถอนตัว, ไม่ผ่านเกณฑ์ BRC, ..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              disabled={!removeReason.trim() || saving}
              onClick={handleRemove}
            >
              <Trash2 className="w-4 h-4 mr-1" />{saving ? 'กำลังบันทึก...' : 'ยืนยันนำออก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
