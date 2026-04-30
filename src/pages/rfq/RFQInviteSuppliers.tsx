import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, UserPlus, Building2, ShieldOff, XCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RiskBadge, { EligibilityBadge } from '@/components/RiskBadge';
import { checkSupplierEligibility } from '@/lib/eligibility';
import type { EligibilityResult } from '@/types/procurement';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { hasRole } = useAuth();
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

      if (suppRes.data) {
        const enriched: SupplierWithEligibility[] = suppRes.data.map((s: any) => ({
          ...s,
          eligibility: checkSupplierEligibility(s),
        }));
        setAllSuppliers(enriched);
      }
      if (invRes.data) {
        setInvitedIds(new Set(invRes.data.map((r: any) => r.supplier_id)));
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
      setLoading(false);
    };
    fetch();
  }, [rfqId]);

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

  const handleRemove = async (supplierId: string) => {
    await supabase.from('rfq_suppliers').delete().eq('rfq_id', rfqId).eq('supplier_id', supplierId);
    setInvitedIds(prev => { const n = new Set(prev); n.delete(supplierId); return n; });
    toast({ title: 'Supplier removed from RFQ' });
    onUpdate();
  };

  const canEdit = (hasRole('admin') || hasRole('procurement_officer')) && rfqStatus === 'draft';

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const invited = allSuppliers.filter(s => invitedIds.has(s.id));
  const available = allSuppliers.filter(s => !invitedIds.has(s.id));
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
                            <RiskBadge level={s.risk_level as any} />
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
                        <Button variant="ghost" size="sm" className="text-xs shrink-0 ml-2" onClick={() => handleRemove(s.id)}>
                          Remove
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
                            <RiskBadge level={s.risk_level as any} />
                            <EligibilityBadge status={status} />
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
    </div>
  );
}
