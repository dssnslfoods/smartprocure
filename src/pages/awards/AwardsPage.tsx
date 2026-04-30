import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, CheckCircle2, XCircle, Eye, Trophy, Clock, ShieldAlert } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import RiskBadge from '@/components/RiskBadge';
import type { RiskLevel } from '@/types/procurement';
import { useTranslation } from '@/i18n';

const lifecycleConfig: Record<string, { color: string; label: string }> = {
  pending_approval: { color: 'bg-amber-500/10 text-amber-600', label: 'Pending Approval' },
  approved:         { color: 'bg-emerald-500/10 text-emerald-600', label: 'Approved' },
  rejected:         { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
  po_issued:        { color: 'bg-blue-500/10 text-blue-600', label: 'PO Issued' },
  completed:        { color: 'bg-emerald-700/10 text-emerald-700', label: 'Completed' },
  cancelled:        { color: 'bg-muted text-muted-foreground', label: 'Cancelled' },
};

const legacyStatusConfig: Record<string, { color: string; label: string }> = {
  pending:  { color: 'bg-amber-500/10 text-amber-600', label: 'Pending Approval' },
  approved: { color: 'bg-emerald-500/10 text-emerald-600', label: 'Approved' },
  rejected: { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
  revise:   { color: 'bg-blue-500/10 text-blue-600', label: 'Needs Revision' },
};

export default function AwardsPage() {
  const [loadingStats, setLoadingStats] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendingApproval: 0, approved: 0, poReady: 0 });
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchStats = async () => {
    setLoadingStats(true);
    const [
      { count: total },
      { count: pendingApproval },
      { count: approved },
      { count: poReady }
    ] = await Promise.all([
      supabase.from('awards').select('*', { count: 'exact', head: true }),
      supabase.from('awards').select('*', { count: 'exact', head: true }).or('status.eq.pending,award_lifecycle_status.eq.pending_approval'),
      supabase.from('awards').select('*', { count: 'exact', head: true }).or('status.eq.approved,award_lifecycle_status.eq.approved'),
      supabase.from('awards').select('*', { count: 'exact', head: true }).or('ready_for_po.eq.true,award_lifecycle_status.eq.po_issued'),
    ]);
    setStats({
      total: total || 0,
      pendingApproval: pendingApproval || 0,
      approved: approved || 0,
      poReady: poReady || 0,
    });
    setLoadingStats(false);
  };

  useEffect(() => { fetchStats(); }, []);

  const filters = useCallback((query: any) => {
    if (search) {
      return query.or(`award_number.ilike.%${search}%,award_no.ilike.%${search}%,recommendation.ilike.%${search}%`);
    }
    return query;
  }, [search]);

  const pagination = useSupabasePagination<any>({
    tableName: 'awards',
    select: '*, suppliers(company_name, risk_level), rfqs(title, rfq_number)',
    pageSize: 20,
    filters,
  });

  const handleStatusChange = async (id: string, status: string) => {
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (decisionReason) updates.decision_reason = decisionReason;
    if (status === 'approved') {
      updates.ready_for_po = true;
      updates.award_lifecycle_status = 'approved';
    }
    if (status === 'rejected') updates.award_lifecycle_status = 'rejected';

    const { error } = await supabase.from('awards').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Award ${status}` });
      setDecisionReason('');
      fetchStats();
      pagination.refresh();
    }
  };

  const getStatusDisplay = (a: any) => {
    const lifecycle = a.award_lifecycle_status;
    if (lifecycle && lifecycleConfig[lifecycle]) return lifecycleConfig[lifecycle];
    return legacyStatusConfig[a.status] || legacyStatusConfig.pending;
  };

  const canApprove = hasRole('admin') || hasRole('approver');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('awards.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('awards.subtitle')}</p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t('awards.totalAwards')}</p>
            <p className="text-2xl font-bold">{loadingStats ? '...' : stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <p className="text-xs text-muted-foreground">{t('awards.pendingApproval')}</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{loadingStats ? '...' : stats.pendingApproval}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <p className="text-xs text-muted-foreground">{t('awards.approved')}</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{loadingStats ? '...' : stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-blue-500" />
              <p className="text-xs text-muted-foreground">{t('awards.poReady')}</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{loadingStats ? '...' : stats.poReady}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={t('awards.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.awardNo')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.supplier')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.rfq')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{t('awards.finalAmount')}</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">{t('awards.risk')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('awards.awardedDate')}</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pagination.loading ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{t('common.loading')}</td></tr>
                ) : pagination.items.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{t('awards.noAwards')}</td></tr>
                ) : (
                  pagination.items.map(a => {
                    const sc = getStatusDisplay(a);
                    const displayAmount = a.final_amount ?? a.amount;
                    const riskLevel = a.suppliers?.risk_level as RiskLevel;
                    const isHighRisk = riskLevel === 'high' || riskLevel === 'critical';
                    return (
                      <tr key={a.id} className={`border-b hover:bg-muted/30 ${isHighRisk ? 'bg-orange-50/30' : ''}`}>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {a.award_no || a.award_number || '—'}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {isHighRisk && <ShieldAlert className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                            <span className="font-medium">{a.suppliers?.company_name || '—'}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          <div>{a.rfqs?.title || '—'}</div>
                          <div className="text-muted-foreground/70">{a.rfqs?.rfq_number}</div>
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {displayAmount ? `$${Number(displayAmount).toLocaleString()}` : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <RiskBadge level={riskLevel} />
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className={sc.color}>{sc.label}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {(a.awarded_at || a.created_at) ? new Date(a.awarded_at || a.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => { setSelected(a); setDetailOpen(true); }}>
                              <Eye className="w-3 h-3" />
                            </Button>
                            {a.rfq_id && (
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/rfq/${a.rfq_id}`)}>
                                <Trophy className="w-3 h-3" />
                              </Button>
                            )}
                            {canApprove && (a.status === 'pending' || a.award_lifecycle_status === 'pending_approval') && (
                              <>
                                <Button variant="outline" size="sm" className="text-emerald-600" onClick={() => handleStatusChange(a.id, 'approved')}>
                                  <CheckCircle2 className="w-3 h-3" />
                                </Button>
                                <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleStatusChange(a.id, 'rejected')}>
                                  <XCircle className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls {...pagination} />
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('awards.details')}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <DetailRow label={t('awards.awardNo')} value={selected.award_no || selected.award_number} />
              <DetailRow label={t('awards.supplier')} value={selected.suppliers?.company_name} />
              <DetailRow label={t('awards.rfq')} value={`${selected.rfqs?.rfq_number} · ${selected.rfqs?.title}`} />
              <DetailRow label={t('awards.finalAmount')} value={selected.final_amount != null ? `$${Number(selected.final_amount).toLocaleString()}` : selected.amount ? `$${Number(selected.amount).toLocaleString()}` : null} />
              <DetailRow label={t('common.status')} value={getStatusDisplay(selected).label} />
              <DetailRow label={t('awards.awardReason')} value={selected.award_reason} />
              <DetailRow label={t('awards.recommendation')} value={selected.recommendation} />
              <DetailRow label={t('awards.decisionReason')} value={selected.decision_reason} />
              <DetailRow label={t('awards.awardedAt')} value={selected.awarded_at ? new Date(selected.awarded_at).toLocaleString() : null} />
              <DetailRow label={t('awards.created')} value={selected.created_at ? new Date(selected.created_at).toLocaleString() : null} />

              {canApprove && (selected.status === 'pending' || selected.award_lifecycle_status === 'pending_approval') && (
                <div className="pt-3 space-y-2 border-t">
                  <Label>Decision Reason</Label>
                  <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Reason for your decision..." rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { handleStatusChange(selected.id, 'approved'); setDetailOpen(false); }}>
                      {t('awards.approve')}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { handleStatusChange(selected.id, 'rejected'); setDetailOpen(false); }}>
                      {t('awards.reject')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { handleStatusChange(selected.id, 'revise'); setDetailOpen(false); }}>
                      {t('awards.revise')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value || '—'}</span>
    </div>
  );
}
