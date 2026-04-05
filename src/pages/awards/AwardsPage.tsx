import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, CheckCircle2, XCircle, RotateCcw, FileCheck, Eye } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';

export default function AwardsPage() {
  const [awards, setAwards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const { hasRole } = useAuth();
  const { toast } = useToast();

  const fetchAwards = async () => {
    const { data } = await supabase.from('awards')
      .select('*, suppliers(company_name), rfqs(title, rfq_number)')
      .order('created_at', { ascending: false });
    if (data) setAwards(data);
    setLoading(false);
  };

  useEffect(() => { fetchAwards(); }, []);

  const handleStatusChange = async (id: string, status: string) => {
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (decisionReason) updates.decision_reason = decisionReason;
    if (status === 'approved') updates.ready_for_po = true;

    const { error } = await supabase.from('awards').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Award ${status}` });
      setDecisionReason('');
      fetchAwards();
    }
  };

  const filtered = awards.filter(a =>
    a.suppliers?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.rfqs?.title?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, { pageSize: 20 });

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: 'bg-amber-500/10 text-amber-600', label: 'Pending Approval' },
    approved: { color: 'bg-emerald-500/10 text-emerald-600', label: 'Approved' },
    rejected: { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
    revise: { color: 'bg-blue-500/10 text-blue-600', label: 'Needs Revision' },
  };

  const canApprove = hasRole('admin') || hasRole('approver');

  const stats = {
    total: awards.length,
    pending: awards.filter(a => a.status === 'pending').length,
    approved: awards.filter(a => a.status === 'approved').length,
    poReady: awards.filter(a => a.ready_for_po).length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Awards & Approvals</h1>
        <p className="text-sm text-muted-foreground">Review, approve, and track supplier award decisions</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Awards</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pending Approval</p><p className="text-2xl font-bold text-amber-600">{stats.pending}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Approved</p><p className="text-2xl font-bold text-emerald-600">{stats.approved}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">PO Ready</p><p className="text-2xl font-bold text-blue-600">{stats.poReady}</p></CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search awards..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">RFQ</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">PO Ready</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                ) : pagination.paginatedItems.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No awards yet</td></tr>
                ) : (
                  pagination.paginatedItems.map(a => {
                    const sc = statusConfig[a.status] || statusConfig.pending;
                    return (
                      <tr key={a.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{a.suppliers?.company_name || '—'}</td>
                        <td className="p-3 text-muted-foreground">{a.rfqs?.title || '—'}</td>
                        <td className="p-3 font-semibold">{a.amount ? `$${Number(a.amount).toLocaleString()}` : '—'}</td>
                        <td className="p-3"><Badge variant="secondary" className={sc.color}>{sc.label}</Badge></td>
                        <td className="p-3">{a.ready_for_po ? <Badge variant="outline" className="border-emerald-500 text-emerald-600">✅ Ready</Badge> : '—'}</td>
                        <td className="p-3 text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                        <td className="p-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => { setSelected(a); setDetailOpen(true); }}>
                              <Eye className="w-3 h-3" />
                            </Button>
                            {canApprove && a.status === 'pending' && (
                              <>
                                <Button variant="outline" size="sm" className="text-emerald-600" onClick={() => handleStatusChange(a.id, 'approved')}>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                                </Button>
                                <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleStatusChange(a.id, 'rejected')}>
                                  <XCircle className="w-3 h-3 mr-1" />Reject
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleStatusChange(a.id, 'revise')}>
                                  <RotateCcw className="w-3 h-3 mr-1" />Revise
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Award Details</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Supplier" value={selected.suppliers?.company_name} />
              <DetailRow label="RFQ" value={selected.rfqs?.title} />
              <DetailRow label="Amount" value={selected.amount ? `$${Number(selected.amount).toLocaleString()}` : null} />
              <DetailRow label="Status" value={statusConfig[selected.status]?.label || selected.status} />
              <DetailRow label="Recommendation" value={selected.recommendation} />
              <DetailRow label="Decision Reason" value={selected.decision_reason} />
              <DetailRow label="PO Ready" value={selected.ready_for_po ? 'Yes' : 'No'} />
              <DetailRow label="Created" value={selected.created_at ? new Date(selected.created_at).toLocaleString() : null} />

              {canApprove && selected.status === 'pending' && (
                <div className="pt-3 space-y-2 border-t">
                  <Label>Decision Reason</Label>
                  <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Reason for your decision..." rows={2} />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { handleStatusChange(selected.id, 'approved'); setDetailOpen(false); }}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { handleStatusChange(selected.id, 'rejected'); setDetailOpen(false); }}>
                      <XCircle className="w-3 h-3 mr-1" />Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { handleStatusChange(selected.id, 'revise'); setDetailOpen(false); }}>
                      <RotateCcw className="w-3 h-3 mr-1" />Revise
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
