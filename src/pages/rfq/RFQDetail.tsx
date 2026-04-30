import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, BarChart2, Trophy, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RFQInviteSuppliers from './RFQInviteSuppliers';
import RFQQuotations from './RFQQuotations';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-blue-500/10 text-blue-600',
  closed: 'bg-muted text-muted-foreground',
  evaluation: 'bg-amber-500/10 text-amber-600',
  awarded: 'bg-emerald-500/10 text-emerald-600',
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'draft',      label: 'Draft' },
  { value: 'published',  label: 'Published' },
  { value: 'closed',     label: 'Closed' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'awarded',    label: 'Awarded' },
];

export default function RFQDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [rfq, setRfq] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [invitedCount, setInvitedCount] = useState(0);
  const [winner, setWinner] = useState<{ supplier_id: string; company_name: string; final_score: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!id) return;
    const [rfqRes, itemsRes, invRes, winRes] = await Promise.all([
      supabase.from('rfqs').select('*').eq('id', id).single(),
      supabase.from('rfq_items').select('*').eq('rfq_id', id).order('created_at'),
      supabase.from('rfq_suppliers').select('id').eq('rfq_id', id),
      supabase.from('quotations')
        .select('supplier_id, final_score, suppliers(company_name)')
        .eq('rfq_id', id)
        .eq('is_recommended_winner', true)
        .maybeSingle(),
    ]);
    if (rfqRes.data) setRfq(rfqRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    setInvitedCount(invRes.data?.length || 0);
    if (winRes.data) {
      const w = winRes.data as any;
      setWinner({
        supplier_id: w.supplier_id,
        company_name: w.suppliers?.company_name || '—',
        final_score: w.final_score,
      });
    } else {
      setWinner(null);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id || newStatus === rfq?.status) return;

    // Guard rules
    if (newStatus === 'published' && invitedCount === 0) {
      toast({ title: 'Publish ไม่ได้', description: 'ต้อง invite supplier อย่างน้อย 1 รายก่อน', variant: 'destructive' });
      return;
    }
    if (newStatus === 'awarded' && !winner) {
      toast({
        title: 'Award ไม่ได้',
        description: 'ต้องเลือก winner ก่อน — ไปที่แท็บ Bid Comparison แล้วกด Recommend Winner',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase.from('rfqs').update({
      status: newStatus as any,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    // When awarding, create/update an awards row for the winner
    if (newStatus === 'awarded' && winner) {
      const { data: existing } = await supabase
        .from('awards')
        .select('id')
        .eq('rfq_id', id)
        .eq('supplier_id', winner.supplier_id)
        .maybeSingle();

      if (!existing) {
        await supabase.from('awards').insert({
          rfq_id: id,
          supplier_id: winner.supplier_id,
          status: 'pending' as any,
          award_lifecycle_status: 'pending_approval' as any,
          awarded_at: new Date().toISOString(),
        } as any);
      }
    }

    toast({ title: 'อัปเดตแล้ว', description: `RFQ → ${newStatus}` });
    fetchData();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!rfq) return <div className="text-center py-16 text-muted-foreground">RFQ not found</div>;

  const canManage = hasRole('admin') || hasRole('procurement_officer');
  const awardedDisabled = !winner;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/rfq"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{rfq.title}</h1>
              <Badge variant="secondary" className={statusColors[rfq.status] || ''}>{rfq.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{rfq.rfq_number} · Deadline: {rfq.deadline ? new Date(rfq.deadline).toLocaleString() : 'None'}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">เปลี่ยนสถานะ:</span>
              <Select value={rfq.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.value === 'awarded' && awardedDisabled}
                    >
                      {opt.label}
                      {opt.value === 'awarded' && awardedDisabled && ' (ต้องเลือก winner ก่อน)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {winner ? (
              <span className="text-xs text-emerald-700 flex items-center gap-1">
                <Trophy className="h-3 w-3" />
                Winner: <strong>{winner.company_name}</strong>
                {winner.final_score != null && ` · Score ${winner.final_score}`}
              </span>
            ) : awardedDisabled && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                ยังไม่ได้เลือก winner — ไปที่ Bid Comparison
              </span>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details & Items</TabsTrigger>
          <TabsTrigger value="suppliers">Invited Suppliers ({invitedCount})</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="comparison" className="flex items-center gap-1">
            <BarChart2 className="w-3.5 h-3.5" />Bid Comparison
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">RFQ Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Title" value={rfq.title} />
                <Row label="RFQ Number" value={rfq.rfq_number} />
                <Row label="Status" value={rfq.status} />
                <Row label="Deadline" value={rfq.deadline ? new Date(rfq.deadline).toLocaleString() : null} />
                <Row label="Description" value={rfq.description} />
                <Row label="Notes" value={rfq.notes} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Line Items ({items.length})</CardTitle></CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No items</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={item.id} className="p-3 border rounded-lg text-sm">
                        <div className="font-medium">{i + 1}. {item.item_name}</div>
                        <div className="text-muted-foreground mt-1">
                          {[item.quantity && `Qty: ${item.quantity}`, item.unit, item.specifications].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="suppliers">
          <RFQInviteSuppliers rfqId={id!} rfqStatus={rfq.status} onUpdate={fetchData} />
        </TabsContent>

        <TabsContent value="quotations">
          <RFQQuotations rfqId={id!} rfqItems={items} />
        </TabsContent>

        <TabsContent value="comparison">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">Side-by-side comparison with Best Value scoring.</p>
            <Link to={`/rfq/${id}/comparison`}>
              <Button size="sm" variant="outline">
                <BarChart2 className="w-4 h-4 mr-1" />Open Full Comparison
              </Button>
            </Link>
          </div>
          <RFQComparisonInline rfqId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value || '—'}</span>
    </div>
  );
}

import { useEffect as useEff, useState as useSt } from 'react';
import { supabase as sb } from '@/integrations/supabase/client';
import { scoreQuotations } from '@/lib/scoring';
import RiskBadge from '@/components/RiskBadge';
import type { RiskLevel } from '@/types/procurement';

function RFQComparisonInline({ rfqId }: { rfqId: string }) {
  const [rows, setRows] = useSt<any[]>([]);
  const [supMap, setSupMap] = useSt<Record<string, any>>({});
  const [loading, setLoading] = useSt(true);

  useEff(() => {
    const fetch = async () => {
      const { data } = await sb.from('quotations')
        .select('*, suppliers(id, company_name, risk_level)')
        .eq('rfq_id', rfqId).order('final_score', { ascending: false });
      if (data) {
        const sm: Record<string, any> = {};
        data.forEach((q: any) => { if (q.suppliers) sm[q.supplier_id] = q.suppliers; });
        setSupMap(sm);
        const hasScores = data.some((q: any) => q.final_score != null);
        if (hasScores) {
          setRows(data.sort((a: any, b: any) => (b.final_score ?? 0) - (a.final_score ?? 0)));
        } else {
          const scored = scoreQuotations(data, sm);
          setRows(data.map((q: any) => {
            const s = scored.find(x => x.quotation_id === q.id);
            return { ...q, ...(s ?? {}) };
          }).sort((a: any, b: any) => (b.final_score ?? 0) - (a.final_score ?? 0)));
        }
      }
      setLoading(false);
    };
    fetch();
  }, [rfqId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No quotations yet.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border text-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium text-muted-foreground">Supplier</th>
            <th className="text-right p-3 font-medium text-muted-foreground">Net Price</th>
            <th className="text-center p-3 font-medium text-muted-foreground">Risk</th>
            <th className="text-right p-3 font-medium text-muted-foreground">Commercial</th>
            <th className="text-right p-3 font-medium text-muted-foreground">Technical</th>
            <th className="text-right p-3 font-medium text-muted-foreground">Risk Score</th>
            <th className="text-right p-3 font-medium text-muted-foreground">Final</th>
            <th className="text-center p-3 font-medium text-muted-foreground">Rank</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q: any, idx: number) => {
            const sup = supMap[q.supplier_id];
            const ep = (q.price ?? q.total_amount ?? 0) - (q.discount ?? 0);
            return (
              <tr key={q.id} className={`border-b ${idx === 0 ? 'bg-emerald-50/50' : 'hover:bg-muted/30'}`}>
                <td className="p-3 font-medium">{sup?.company_name || '—'}</td>
                <td className="p-3 text-right tabular-nums">{ep > 0 ? ep.toLocaleString() : '—'}</td>
                <td className="p-3 text-center"><RiskBadge level={sup?.risk_level as RiskLevel} /></td>
                <td className="p-3 text-right tabular-nums">{q.commercial_score ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{q.technical_score ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{q.risk_score ?? '—'}</td>
                <td className="p-3 text-right tabular-nums font-bold">{q.final_score ?? '—'}</td>
                <td className="p-3 text-center text-muted-foreground">#{q.rank ?? (idx + 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
