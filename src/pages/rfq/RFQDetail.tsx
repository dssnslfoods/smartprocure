import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, BarChart2, Trophy, AlertCircle, Send, CheckCircle, Gavel, XOctagon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import RFQInviteSuppliers from './RFQInviteSuppliers';
import RFQQuotations from './RFQQuotations';
import RFQTechnicalCriteria from './RFQTechnicalCriteria';

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
  const navigate = useNavigate();
  const { hasRole, profile } = useAuth();
  const { toast } = useToast();
  const [rfq, setRfq] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [invitedCount, setInvitedCount] = useState(0);
  const [winner, setWinner] = useState<{ supplier_id: string; company_name: string; final_score: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const isSupplier = hasRole('supplier');
  const mySupplierId = profile?.supplier_id ?? null;

  const fetchData = async () => {
    if (!id) return;
    const [rfqRes, itemsRes, invRes, winRes] = await Promise.all([
      supabase.from('rfqs').select('*').eq('id', id).single(),
      supabase.from('rfq_items').select('*').eq('rfq_id', id).order('created_at'),
      supabase.from('rfq_suppliers').select('id, supplier_id').eq('rfq_id', id),
      supabase.from('quotations')
        .select('supplier_id, final_score, suppliers(company_name)')
        .eq('rfq_id', id)
        .eq('is_recommended_winner', true)
        .maybeSingle(),
    ]);

    // Access check: supplier can only see RFQs they're invited to
    if (isSupplier && mySupplierId && invRes.data) {
      const invited = invRes.data.some((r: any) => r.supplier_id === mySupplierId);
      if (!invited) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
    }

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

  const handleCancelRfq = async () => {
    if (!id || !cancelReason.trim()) return;
    setCancelling(true);
    const { error } = await supabase.from('rfqs').update({
      status: 'closed' as any,
      notes: `[ยกเลิกการจัดซื้อ] ${cancelReason.trim()}${rfq?.notes ? `\n\n${rfq.notes}` : ''}`,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setCancelling(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'ยกเลิกการจัดซื้อแล้ว', description: 'สถานะเปลี่ยนเป็น Closed' });
    setCancelOpen(false);
    setCancelReason('');
    fetchData();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (accessDenied) return (
    <div className="text-center py-16 space-y-3">
      <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground" />
      <p className="text-muted-foreground">คุณไม่ได้รับเชิญในรายการจัดซื้อนี้</p>
      <Link to="/rfq"><Button variant="outline">กลับไปรายการ RFQ</Button></Link>
    </div>
  );
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
            {rfq.status !== 'closed' && rfq.status !== 'awarded' && (
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1">
                    <XOctagon className="w-3.5 h-3.5" />ยกเลิกการจัดซื้อ
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>ยกเลิกการจัดซื้อ</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      ยกเลิก RFQ นี้โดยไม่ประกาศผู้ชนะ — สถานะจะเปลี่ยนเป็น Closed
                    </p>
                    <div className="space-y-1">
                      <Label>เหตุผลที่ยกเลิก *</Label>
                      <Textarea rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                        placeholder="เช่น งบประมาณไม่เพียงพอ, เปลี่ยนแผนจัดซื้อ, ราคาสูงเกินงบ..." />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setCancelOpen(false)}>ยกเลิก</Button>
                      <Button onClick={handleCancelRfq} disabled={cancelling || !cancelReason.trim()}
                        className="bg-red-600 hover:bg-red-700">
                        {cancelling ? 'กำลังบันทึก...' : 'ยืนยันยกเลิก'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
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
          <TabsTrigger value="ebidding" className="flex items-center gap-1">
            <Gavel className="w-3.5 h-3.5" />E-Bidding
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
            <RFQTechnicalCriteria rfqId={id!} canManage={canManage} />
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
          <RFQComparisonInline rfqId={id!} onWinnerSelected={fetchData} />
        </TabsContent>

        <TabsContent value="ebidding">
          <RFQBiddingResults rfqId={id!} />
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
import { computeRfqBidRisk, type BidRiskResult } from '@/lib/bidRisk';
import { DIMENSION_LABEL } from '@/lib/riskCriteria';
import RiskBadge from '@/components/RiskBadge';
import type { RiskLevel } from '@/types/procurement';

function RFQComparisonInline({ rfqId, onWinnerSelected }: { rfqId: string; onWinnerSelected?: () => void }) {
  const [rows, setRows] = useSt<any[]>([]);
  const [supMap, setSupMap] = useSt<Record<string, any>>({});
  const [bidRisk, setBidRisk] = useSt<BidRiskResult | null>(null);
  const [loading, setLoading] = useSt(true);
  const [rfqData, setRfqData] = useSt<any>(null);
  const [sentToFQ, setSentToFQ] = useSt<Set<string>>(new Set());
  const [sendingFQ, setSendingFQ] = useSt<string | null>(null);
  const [selectingWinner, setSelectingWinner] = useSt<string | null>(null);
  const { user, hasRole: hr } = useAuth();
  const { toast: t } = useToast();
  const canMng = hr('admin') || hr('procurement_officer');

  useEff(() => {
    const fetch = async () => {
      const [qRes, rfqRes, fqRes] = await Promise.all([
        sb.from('quotations')
          .select('*, suppliers(id, company_name, risk_level)')
          .eq('rfq_id', rfqId).order('final_score', { ascending: false }),
        sb.from('rfqs').select('rfq_number, title').eq('id', rfqId).single(),
        sb.from('final_quotations').select('quotation_id').eq('rfq_id', rfqId).not('quotation_id', 'is', null),
      ]);
      if (rfqRes.data) setRfqData(rfqRes.data);
      if (fqRes.data) setSentToFQ(new Set(fqRes.data.map((d: any) => d.quotation_id)));
      if (qRes.data) {
        const sm: Record<string, any> = {};
        qRes.data.forEach((q: any) => { if (q.suppliers) sm[q.supplier_id] = q.suppliers; });
        setSupMap(sm);
        // BRC criteria-based risk scoped to this RFQ's catalog categories.
        const risk = await computeRfqBidRisk(rfqId, qRes.data.map((q: any) => q.supplier_id));
        setBidRisk(risk);
        const override = risk.hasCriteria
          ? Object.fromEntries(Object.entries(risk.bySupplier).map(([sid, r]) => [sid, r.riskScore]))
          : undefined;
        const hasScores = qRes.data.some((q: any) => q.final_score != null);
        // Recompute when criteria exist so risk-based scores are reflected live; otherwise
        // fall back to stored scores.
        if (hasScores && !risk.hasCriteria) {
          setRows(qRes.data.sort((a: any, b: any) => (b.final_score ?? 0) - (a.final_score ?? 0)));
        } else {
          const scored = scoreQuotations(qRes.data, sm, undefined, override);
          setRows(qRes.data.map((q: any) => {
            const s = scored.find(x => x.quotation_id === q.id);
            return { ...q, ...(s ?? {}) };
          }).sort((a: any, b: any) => (b.final_score ?? 0) - (a.final_score ?? 0)));
        }
      }
      setLoading(false);
    };
    fetch();
  }, [rfqId]);

  const handleSendFQ = async (q: any) => {
    if (!user) return;
    setSendingFQ(q.id);
    try {
      const { data: existing } = await sb.from('final_quotations').select('id').eq('rfq_id', rfqId).eq('quotation_id', q.id).maybeSingle();
      if (existing) { setSentToFQ(prev => new Set(prev).add(q.id)); setSendingFQ(null); return; }
      const ep = (q.price ?? q.total_amount ?? 0) - (q.discount ?? 0);
      const { error } = await sb.from('final_quotations').insert({
        rfq_id: rfqId, supplier_id: q.supplier_id, quotation_id: q.id,
        total_amount: ep || q.total_amount, currency: q.currency || 'THB',
        payment_terms: q.payment_term || q.payment_terms || '',
        delivery_terms: q.delivery_terms || (q.lead_time_days ? `${q.lead_time_days} days` : ''),
        notes: `จาก RFQ ${rfqData?.rfq_number || ''} — ${rfqData?.title || ''} | Score: ${q.final_score ?? '—'}`,
        status: 'pending', created_by: user.id,
      });
      if (error) throw error;
      setSentToFQ(prev => new Set(prev).add(q.id));
      t({ title: 'ส่งไป Final Quotation แล้ว', description: supMap[q.supplier_id]?.company_name });
    } catch (err: any) { t({ title: 'Error', description: err.message, variant: 'destructive' }); }
    setSendingFQ(null);
  };

  const handleSelectWinner = async (q: any) => {
    if (!user) return;
    setSelectingWinner(q.id);
    try {
      // Clear previous winner
      await sb.from('quotations').update({ is_recommended_winner: false }).eq('rfq_id', rfqId);
      // Set new winner
      const { error } = await sb.from('quotations').update({ is_recommended_winner: true }).eq('id', q.id);
      if (error) throw error;
      // Update RFQ status to awarded + create award record
      await sb.from('rfqs').update({ status: 'awarded' as any, updated_at: new Date().toISOString() }).eq('id', rfqId);
      const { data: existing } = await sb.from('awards').select('id').eq('rfq_id', rfqId).eq('supplier_id', q.supplier_id).maybeSingle();
      if (!existing) {
        await sb.from('awards').insert({
          rfq_id: rfqId, supplier_id: q.supplier_id,
          status: 'pending' as any, award_lifecycle_status: 'pending_approval' as any,
          awarded_at: new Date().toISOString(),
        } as any);
      }
      setRows(prev => prev.map(r => ({ ...r, is_recommended_winner: r.id === q.id })));
      t({ title: 'เลือกผู้ชนะแล้ว', description: `${supMap[q.supplier_id]?.company_name} — สถานะเปลี่ยนเป็น Awarded` });
      onWinnerSelected?.();
    } catch (err: any) { t({ title: 'Error', description: err.message, variant: 'destructive' }); }
    setSelectingWinner(null);
  };

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
            {canMng && <th className="text-center p-3 font-medium text-muted-foreground">Action</th>}
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
                <td className="p-3 text-center">
                  {(() => {
                    const r = bidRisk?.bySupplier[q.supplier_id];
                    if (bidRisk?.hasCriteria && r) {
                      const failing = Object.values(r.dims)
                        .filter(d => d.score != null && (d.mandatoryUnmet || (d.score as number) >= 6))
                        .map(d => `${DIMENSION_LABEL[d.dimension] || d.dimension}: ${d.score}/10`);
                      return (
                        <div className="flex flex-col items-center gap-0.5" title={failing.length ? `จุดเสี่ยง — ${failing.join(' · ')}` : 'ผ่านเกณฑ์ความเสี่ยงทุกด้าน'}>
                          <RiskBadge level={r.level} />
                          {r.assessed && <span className="text-[10px] text-muted-foreground">BRC {r.risk10.toFixed(1)}/10</span>}
                        </div>
                      );
                    }
                    return <RiskBadge level={sup?.risk_level as RiskLevel} />;
                  })()}
                </td>
                <td className="p-3 text-right tabular-nums">{q.commercial_score ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{q.technical_score ?? '—'}</td>
                <td className="p-3 text-right tabular-nums">{q.risk_score ?? '—'}</td>
                <td className="p-3 text-right tabular-nums font-bold">{q.final_score ?? '—'}</td>
                <td className="p-3 text-center text-muted-foreground">#{q.rank ?? (idx + 1)}</td>
                {canMng && (
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {q.is_recommended_winner ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <Trophy className="w-3.5 h-3.5" /> ผู้ชนะ
                        </span>
                      ) : (
                        <Button variant="outline" size="sm" disabled={selectingWinner === q.id}
                          onClick={() => handleSelectWinner(q)} className="text-xs">
                          <Trophy className="w-3.5 h-3.5 mr-1" />{selectingWinner === q.id ? '...' : 'เลือก'}
                        </Button>
                      )}
                      {sentToFQ.has(q.id) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CheckCircle className="w-3 h-3" />
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={sendingFQ === q.id} onClick={() => handleSendFQ(q)} className="text-xs px-1.5" title="ส่ง Final Quotation">
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// E-Bidding results for this RFQ — shows winner of each linked bidding event
function RFQBiddingResults({ rfqId }: { rfqId: string }) {
  const [events, setEvents] = useSt<any[]>([]);
  const [loading, setLoading] = useSt(true);
  const [rfqData, setRfqData] = useSt<any>(null);
  const [sentEvents, setSentEvents] = useSt<Set<string>>(new Set());
  const [sending, setSending] = useSt<string | null>(null);
  const { user, hasRole: hr } = useAuth();
  const { toast: t } = useToast();
  const canMng = hr('admin') || hr('procurement_officer');

  const load = async () => {
    const [evRes, rfqRes, fqRes] = await Promise.all([
      sb.from('bidding_events').select('*').eq('rfq_id', rfqId).order('created_at', { ascending: false }),
      sb.from('rfqs').select('rfq_number, title').eq('id', rfqId).single(),
      sb.from('final_quotations').select('bidding_event_id').eq('rfq_id', rfqId).not('bidding_event_id', 'is', null),
    ]);
    if (rfqRes.data) setRfqData(rfqRes.data);
    if (fqRes.data) setSentEvents(new Set(fqRes.data.map((d: any) => d.bidding_event_id)));

    if (evRes.data && evRes.data.length > 0) {
      const eventIds = evRes.data.map((e: any) => e.id);
      const { data: bids } = await sb
        .from('bid_entries')
        .select('*, suppliers(id, company_name)')
        .in('bidding_event_id', eventIds);

      const enriched = evRes.data.map((ev: any) => {
        const evBids = (bids || []).filter((b: any) => b.bidding_event_id === ev.id);
        // Winner = lowest bid in the highest round that has bids
        const maxRound = evBids.reduce((m: number, b: any) => Math.max(m, b.round_number || 1), 0);
        const finalRoundBids = evBids.filter((b: any) => (b.round_number || 1) === maxRound);
        const bestBySupplier = new Map<string, any>();
        finalRoundBids.forEach((b: any) => {
          const ex = bestBySupplier.get(b.supplier_id);
          if (!ex || b.bid_amount < ex.bid_amount) bestBySupplier.set(b.supplier_id, b);
        });
        const ranked = Array.from(bestBySupplier.values()).sort((a, b) => a.bid_amount - b.bid_amount);
        return { ...ev, winner: ranked[0] || null, totalBids: evBids.length, maxRound };
      });
      setEvents(enriched);
    }
    setLoading(false);
  };

  useEff(() => { load(); }, [rfqId]);

  const handleSendWinner = async (ev: any) => {
    if (!user || !ev.winner) return;
    setSending(ev.id);
    try {
      const { data: existing } = await sb.from('final_quotations').select('id').eq('rfq_id', rfqId).eq('bidding_event_id', ev.id).maybeSingle();
      if (existing) { setSentEvents(prev => new Set(prev).add(ev.id)); setSending(null); return; }
      const { error } = await sb.from('final_quotations').insert({
        rfq_id: rfqId,
        supplier_id: ev.winner.supplier_id,
        bidding_event_id: ev.id,
        quotation_id: null,
        total_amount: ev.winner.bid_amount,
        currency: 'THB',
        notes: `จากการประมูล "${ev.title}" — RFQ ${rfqData?.rfq_number || ''} | รอบสุดท้าย R${ev.maxRound} | ผู้ชนะ: ${ev.winner.suppliers?.company_name}`,
        status: 'pending',
        created_by: user.id,
      });
      if (error) throw error;
      setSentEvents(prev => new Set(prev).add(ev.id));
      t({ title: 'ส่งผู้ชนะการประมูลไป Final Quotation แล้ว', description: `${ev.winner.suppliers?.company_name} — ไปจัดการต่อที่เมนู "ใบเสนอราคาสุดท้าย"` });
    } catch (err: any) {
      t({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSending(null);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Gavel className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">ยังไม่มีการประมูล (E-Bidding) ที่เชื่อมกับ RFQ นี้</p>
        <p className="text-xs mt-1">สร้างการประมูลที่เมนู "การประมูล" แล้วเลือก Linked RFQ เป็น RFQ นี้</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((ev) => {
        const closed = ev.status === 'closed';
        const sent = sentEvents.has(ev.id);
        return (
          <Card key={ev.id} className={closed && ev.winner ? 'border-emerald-200' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{ev.title}</h3>
                    <Badge variant="secondary" className={
                      ev.status === 'active' ? 'bg-green-100 text-green-800' :
                      ev.status === 'closed' ? 'bg-muted text-muted-foreground' :
                      ev.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : ''
                    }>{ev.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.totalBids} bids · รอบสุดท้าย R{ev.maxRound} / {ev.max_rounds || '∞'}
                  </p>

                  {ev.winner ? (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
                      <Trophy className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">ผู้ชนะการประมูล</p>
                        <p className="font-bold">{ev.winner.suppliers?.company_name || '—'}</p>
                        <p className="text-sm text-emerald-700">
                          ราคาประมูล: <span className="font-bold font-mono">{ev.winner.bid_amount.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีผู้เสนอราคา</p>
                  )}
                </div>

                {canMng && ev.winner && (
                  <div className="shrink-0">
                    {sent ? (
                      <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
                        <CheckCircle className="w-4 h-4" /> ส่งแล้ว
                      </span>
                    ) : !closed ? (
                      <span className="text-xs text-muted-foreground">ปิดการประมูลก่อนจึงส่งได้</span>
                    ) : (
                      <Button size="sm" disabled={sending === ev.id} onClick={() => handleSendWinner(ev)}>
                        <Send className="w-4 h-4 mr-1" />{sending === ev.id ? 'กำลังส่ง...' : 'ส่ง Final'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
