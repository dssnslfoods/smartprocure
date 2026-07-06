import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import RiskBadge from '@/components/RiskBadge';
import { computeRfqBidRisk, type BidRiskResult } from '@/lib/bidRisk';
import { DIMENSION_LABEL } from '@/lib/riskCriteria';
import {
  ArrowLeft, Play, Square, Trophy, Clock, TrendingDown,
  Send, CheckCircle, AlertTriangle, Settings, RotateCcw, History, Save, Pencil,
} from 'lucide-react';

const statusColor: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

const statusLabel: Record<string, string> = {
  scheduled: 'ตั้งค่า (Setup)',
  active: 'กำลังประมูล (Active)',
  closed: 'ปิดการประมูล (Closed)',
  cancelled: 'ยกเลิก (Cancelled)',
};

function toLocalDatetime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BiddingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [bidRisk, setBidRisk] = useState<BidRiskResult | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidForm, setBidForm] = useState({ supplier_id: '', bid_amount: '' });
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [sentToFQ, setSentToFQ] = useState(false);
  const [sendingFQ, setSendingFQ] = useState(false);
  const { user, hasRole, profile: authProfile } = useAuth();
  const canManage = hasRole('admin') || hasRole('procurement_officer');
  const isSupplier = hasRole('supplier');
  const mySupplierId = authProfile?.supplier_id ?? null;

  // Setup form
  const [setupForm, setSetupForm] = useState({
    title: '', description: '', max_rounds: 3,
    start_time: '', end_time: '',
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rollback dialog
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollingBack, setRollingBack] = useState(false);

  // Status logs
  const [statusLogs, setStatusLogs] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    const [evRes, bidRes, supRes, logRes] = await Promise.all([
      supabase.from('bidding_events').select('*, rfqs(title, rfq_number)').eq('id', id!).single(),
      supabase.from('bid_entries').select('*, suppliers(company_name)').eq('bidding_event_id', id!).order('bid_amount', { ascending: true }),
      supabase.from('suppliers').select('id, company_name').eq('status', 'approved'),
      supabase.from('bidding_status_logs').select('*').eq('bidding_event_id', id!).order('changed_at', { ascending: false }),
    ]);
    if (evRes.data) {
      setEvent(evRes.data);
      setSetupForm({
        title: evRes.data.title || '',
        description: evRes.data.description || '',
        max_rounds: evRes.data.max_rounds || 3,
        start_time: toLocalDatetime(evRes.data.start_time),
        end_time: toLocalDatetime(evRes.data.end_time),
      });
    }
    if (bidRes.data) setBids(bidRes.data);
    if (supRes.data) setSuppliers(supRes.data);
    if (logRes.data) setStatusLogs(logRes.data);

    if (evRes.data?.rfq_id && bidRes.data?.length) {
      const supplierIds = Array.from(new Set(bidRes.data.map((b: any) => b.supplier_id)));
      const risk = await computeRfqBidRisk(evRes.data.rfq_id, supplierIds);
      setBidRisk(risk);
    } else {
      setBidRisk(null);
    }

    if (evRes.data?.rfq_id) {
      const { data: awdData } = await supabase.from('awards').select('id').eq('rfq_id', evRes.data.rfq_id).maybeSingle();
      setSentToFQ(!!awdData);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (isSupplier && mySupplierId) setBidForm(f => ({ ...f, supplier_id: mySupplierId }));
  }, [isSupplier, mySupplierId]);

  useEffect(() => {
    const channel = supabase
      .channel(`bids-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bid_entries', filter: `bidding_event_id=eq.${id}` }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  useEffect(() => {
    if (!event || event.status !== 'active') return;
    const interval = setInterval(() => {
      const end = new Date(event.end_time).getTime();
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('หมดเวลา');
        clearInterval(interval);
        supabase.from('bidding_events').update({ status: 'closed' }).eq('id', id!).then(() => fetchData());
      } else {
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [event, id, fetchData]);

  const logStatusChange = async (from: string, to: string, reason?: string) => {
    await supabase.from('bidding_status_logs').insert({
      bidding_event_id: id,
      from_status: from,
      to_status: to,
      reason: reason || null,
      changed_by: user?.id,
      tenant_id: authProfile?.tenant_id,
    } as any);
  };

  const updateStatus = async (status: string, reason?: string) => {
    const prev = event.status;
    const { error } = await supabase.from('bidding_events').update({
      status: status as any,
      updated_at: new Date().toISOString(),
      ...(status === 'scheduled' ? { current_round: 1 } : {}),
    }).eq('id', id!);
    if (error) { toast.error(error.message); return; }
    await logStatusChange(prev, status, reason);
    toast.success(`สถานะเปลี่ยนเป็น ${statusLabel[status] || status}`);
    fetchData();
  };

  const handleSaveSetup = async () => {
    if (!setupForm.title || !setupForm.start_time || !setupForm.end_time) {
      toast.error('กรุณากรอกชื่อ, เวลาเริ่ม และเวลาสิ้นสุด');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('bidding_events').update({
      title: setupForm.title,
      description: setupForm.description || null,
      max_rounds: 1,
      start_time: new Date(setupForm.start_time).toISOString(),
      end_time: new Date(setupForm.end_time).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id!);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('บันทึกการตั้งค่าแล้ว');
    setEditing(false);
    fetchData();
  };

  const handleRollback = async () => {
    if (!rollbackReason.trim()) { toast.error('กรุณาใส่เหตุผล'); return; }
    setRollingBack(true);
    await updateStatus('scheduled', rollbackReason.trim());
    setRollingBack(false);
    setRollbackOpen(false);
    setRollbackReason('');
  };

  const submitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bidForm.supplier_id || !bidForm.bid_amount) { toast.error('เลือกผู้จัดจำหน่ายและใส่จำนวนเงิน'); return; }
    setSubmitting(true);
    const { error } = await supabase.from('bid_entries').insert({
      bidding_event_id: id,
      supplier_id: bidForm.supplier_id,
      round_number: event?.current_round || 1,
      bid_amount: parseFloat(bidForm.bid_amount),
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { toast.success('บันทึกราคาเสนอแล้ว'); setBidForm({ supplier_id: '', bid_amount: '' }); fetchData(); }
  };

  const bestBidBySupplier = new Map<string, any>();
  bids.forEach((b) => {
    const existing = bestBidBySupplier.get(b.supplier_id);
    if (!existing || b.bid_amount < existing.bid_amount) bestBidBySupplier.set(b.supplier_id, b);
  });
  const ranked = Array.from(bestBidBySupplier.values()).sort((a, b) => a.bid_amount - b.bid_amount);
  const winner = ranked[0] || null;

  const sendWinnerToFQ = async () => {
    if (!user || !winner || !event) return;
    setSendingFQ(true);
    try {
      const { data: existing } = await supabase.from('awards').select('id').eq('rfq_id', event.rfq_id).eq('supplier_id', winner.supplier_id).maybeSingle();
      if (existing) { setSentToFQ(true); setSendingFQ(false); return; }
      const { error } = await supabase.from('awards').insert({
        rfq_id: event.rfq_id || null,
        supplier_id: winner.supplier_id,
        tenant_id: authProfile?.tenant_id,
        amount: winner.bid_amount,
        final_amount: winner.bid_amount,
        status: 'pending' as any,
        award_lifecycle_status: 'pending_approval' as any,
        awarded_at: new Date().toISOString(),
        recommendation: `จากการประมูล "${event.title}"${event.rfqs ? ` — ${event.rfqs.rfq_number}` : ''}`,
      } as any);
      if (error) throw error;
      if (event.rfq_id) {
        await supabase.from('rfqs').update({ status: 'awarded' as any, updated_at: new Date().toISOString() }).eq('id', event.rfq_id);
      }
      setSentToFQ(true);
      toast.success(`สร้าง Award สำหรับ ${winner.suppliers?.company_name} แล้ว — ไปอนุมัติได้ที่เมนู Awards`);
    } catch (err: any) {
      toast.error(err.message);
    }
    setSendingFQ(false);
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!event) return <div className="p-8 text-center text-muted-foreground">Event not found</div>;

  const isSetup = event.status === 'scheduled';
  const isActive = event.status === 'active';
  const isClosed = event.status === 'closed';

  // Duration display
  const durationMs = event.start_time && event.end_time
    ? new Date(event.end_time).getTime() - new Date(event.start_time).getTime() : 0;
  const durationDays = Math.floor(durationMs / 86400000);
  const durationHours = Math.floor((durationMs % 86400000) / 3600000);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="text-sm text-muted-foreground">
              {event.rfqs ? `${event.rfqs.rfq_number} — ${event.rfqs.title}` : 'ไม่ได้เชื่อมกับ RFQ'}
            </p>
          </div>
        </div>
        <Badge className={statusColor[event.status] || ''}>{statusLabel[event.status] || event.status}</Badge>
      </div>

      {/* Setup Card — show when scheduled OR editing */}
      {(isSetup || editing) && canManage && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4" /> ตั้งค่าการประมูล
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ชื่อการประมูล *</Label>
                <Input value={setupForm.title} onChange={(e) => setSetupForm({ ...setupForm, title: e.target.value })} />
              </div>
              <div />
              <div className="space-y-2">
                <Label>วันเวลาเปิดประมูล *</Label>
                <Input type="datetime-local" value={setupForm.start_time} onChange={(e) => setSetupForm({ ...setupForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>วันเวลาปิดประมูล *</Label>
                <Input type="datetime-local" value={setupForm.end_time} onChange={(e) => setSetupForm({ ...setupForm, end_time: e.target.value })} />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>รายละเอียด / กฎการประมูล</Label>
                <Textarea value={setupForm.description} onChange={(e) => setSetupForm({ ...setupForm, description: e.target.value })} rows={3} placeholder="ระบุเงื่อนไข กฎ และรายละเอียดเพิ่มเติม..." />
              </div>
            </div>
            {setupForm.start_time && setupForm.end_time && (
              <p className="text-xs text-muted-foreground mt-3">
                ระยะเวลาประมูล: {durationDays > 0 ? `${durationDays} วัน ` : ''}{durationHours > 0 ? `${durationHours} ชั่วโมง` : ''}{durationDays === 0 && durationHours === 0 ? 'น้อยกว่า 1 ชั่วโมง' : ''}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSaveSetup} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </Button>
              {isSetup && (
                <Button variant="default" className="bg-green-600 hover:bg-green-700" onClick={() => {
                  if (!setupForm.start_time || !setupForm.end_time) { toast.error('กรุณาตั้งเวลาก่อนเปิดประมูล'); return; }
                  handleSaveSetup().then(() => updateStatus('active'));
                }}>
                  <Play className="w-4 h-4 mr-2" /> บันทึก & เปิดประมูล
                </Button>
              )}
              {editing && !isSetup && (
                <Button variant="outline" onClick={() => setEditing(false)}>ยกเลิก</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row — show when not in setup */}
      {!isSetup && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">เวลาคงเหลือ</p>
                  <p className="font-bold text-sm">{isActive ? timeLeft || 'กำลังคำนวณ...' : '—'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">ราคาต่ำสุด</p>
                  <p className="font-bold text-sm">{ranked.length > 0 ? `฿${ranked[0].bid_amount.toLocaleString()}` : '—'}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Trophy className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">จำนวน Bids</p>
                  <p className="font-bold text-sm">{bids.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action buttons */}
          {canManage && (
            <div className="flex gap-2 flex-wrap">
              {isActive && (
                <>
                  <Button onClick={() => updateStatus('closed')} variant="destructive" className="gap-2"><Square className="w-4 h-4" /> ปิดการประมูล</Button>
                  <Button variant="outline" onClick={() => setRollbackOpen(true)} className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50">
                    <RotateCcw className="w-4 h-4" /> กลับไปตั้งค่าใหม่
                  </Button>
                  {!editing && (
                    <Button variant="ghost" onClick={() => setEditing(true)} className="gap-2"><Pencil className="w-4 h-4" /> แก้ไขการตั้งค่า</Button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Winner banner */}
          {isClosed && winner && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Trophy className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium uppercase tracking-wide">ผู้ชนะการประมูล</p>
                    <p className="text-lg font-bold">{winner.suppliers?.company_name || '—'}</p>
                    <p className="text-sm text-emerald-700">
                      ราคาประมูล: <span className="font-bold font-mono">฿{winner.bid_amount.toLocaleString()}</span>
                    </p>
                  </div>
                </div>
                {canManage && (
                  sentToFQ ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 shrink-0">
                      <CheckCircle className="w-4 h-4" /> ส่งไป Award แล้ว
                    </span>
                  ) : (
                    <Button className="bg-emerald-600 hover:bg-emerald-700 shrink-0" disabled={sendingFQ} onClick={sendWinnerToFQ}>
                      <Send className="w-4 h-4 mr-2" />{sendingFQ ? 'กำลังสร้าง...' : 'สร้าง Award'}
                    </Button>
                  )
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Setup summary when in setup mode (read-only overview) */}
      {isSetup && !canManage && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Settings className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium text-foreground">การประมูลอยู่ระหว่างการตั้งค่า</p>
            <p className="text-xs mt-1">รอผู้ดูแลตั้งค่าและเปิดการประมูล</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs — show when not in setup OR when setup but with content */}
      {!isSetup && (
        <Tabs defaultValue="ranking">
          <TabsList>
            <TabsTrigger value="ranking">อันดับ</TabsTrigger>
            <TabsTrigger value="submit">เสนอราคา</TabsTrigger>
            <TabsTrigger value="history">ประวัติ Bids</TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> บันทึก
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ranking">
            {(() => {
              const leadRisk = bidRisk?.hasCriteria && ranked[0] ? bidRisk.bySupplier[ranked[0].supplier_id] : null;
              if (leadRisk && (leadRisk.level === 'high' || leadRisk.level === 'critical')) {
                return (
                  <div className="mb-3 flex items-start gap-3 p-3 rounded-lg border border-orange-200 bg-orange-50">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-800">
                      ผู้เสนอราคาต่ำสุด ({ranked[0].suppliers?.company_name}) มีความเสี่ยงสูงตามเกณฑ์ BRC ({leadRisk.risk10.toFixed(1)}/10) — ควรพิจารณาก่อนเลือกเป็นผู้ชนะ
                    </p>
                  </div>
                );
              }
              return null;
            })()}
            <Card>
              <CardHeader><CardTitle className="text-base">อันดับการเสนอราคา</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground w-16">อันดับ</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">ผู้จัดจำหน่าย</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ราคาเสนอ</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">ความเสี่ยง</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">ยังไม่มีผู้เสนอราคาในรอบนี้</td></tr>
                    ) : (
                      ranked.map((b, i) => {
                        const r = bidRisk?.hasCriteria ? bidRisk.bySupplier[b.supplier_id] : null;
                        return (
                          <tr key={b.id} className={`border-b ${i === 0 ? 'bg-green-50 dark:bg-green-950/20' : 'hover:bg-muted/30'}`}>
                            <td className="p-3 font-bold">{i === 0 ? <span className="text-green-600">🏆 1</span> : i + 1}</td>
                            <td className="p-3 font-medium">{b.suppliers?.company_name || '—'}</td>
                            <td className="p-3 text-right font-mono font-semibold">฿{b.bid_amount.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              {r ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <RiskBadge level={r.level} />
                                  {r.assessed && <span className="text-[10px] text-muted-foreground">BRC {r.risk10.toFixed(1)}/10</span>}
                                </div>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{new Date(b.submitted_at).toLocaleTimeString()}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submit">
            {/* Real-time lowest bid banner */}
            {isActive && ranked.length > 0 && (
              <div className="mb-4 p-4 rounded-lg border-2 border-green-300 bg-green-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="text-xs text-green-600 font-medium uppercase tracking-wide">ราคาต่ำสุดปัจจุบัน (Real-time)</p>
                    <p className="text-2xl font-bold text-green-700 font-mono">฿{ranked[0].bid_amount.toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-right text-xs text-green-600">
                  <p>จำนวนผู้เสนอราคา: {ranked.length} ราย</p>
                  <p>Bids ทั้งหมด: {bids.length} ครั้ง</p>
                </div>
              </div>
            )}
            <Card>
              <CardHeader><CardTitle className="text-base">เสนอราคา</CardTitle></CardHeader>
              <CardContent>
                {!isActive ? (
                  <p className="text-muted-foreground text-sm">เสนอราคาได้เฉพาะเมื่อการประมูลเปิดอยู่เท่านั้น</p>
                ) : (
                  <form onSubmit={submitBid} className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label>ผู้จัดจำหน่าย *</Label>
                      {isSupplier && mySupplierId ? (
                        <>
                          <div className="flex items-center gap-2 p-2.5 border rounded-md bg-muted/40">
                            <span className="font-medium">
                              {suppliers.find(s => s.id === mySupplierId)?.company_name || authProfile?.full_name || 'My company'}
                            </span>
                          </div>
                        </>
                      ) : (
                        <Select value={bidForm.supplier_id} onValueChange={(v) => setBidForm({ ...bidForm, supplier_id: v })}>
                          <SelectTrigger><SelectValue placeholder="เลือกผู้จัดจำหน่าย" /></SelectTrigger>
                          <SelectContent>
                            {suppliers.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>ราคาเสนอ (บาท) *</Label>
                      <Input type="number" step="0.01" min="0" value={bidForm.bid_amount} onChange={(e) => setBidForm({ ...bidForm, bid_amount: e.target.value })} placeholder="ใส่จำนวนเงิน" />
                      {isActive && ranked.length > 0 && bidForm.bid_amount && parseFloat(bidForm.bid_amount) > 0 && (
                        <p className={`text-xs mt-1 ${parseFloat(bidForm.bid_amount) < ranked[0].bid_amount ? 'text-green-600 font-semibold' : 'text-orange-600'}`}>
                          {parseFloat(bidForm.bid_amount) < ranked[0].bid_amount
                            ? `✓ ต่ำกว่าราคาต่ำสุดปัจจุบัน ฿${(ranked[0].bid_amount - parseFloat(bidForm.bid_amount)).toLocaleString()}`
                            : `สูงกว่าราคาต่ำสุดปัจจุบัน ฿${(parseFloat(bidForm.bid_amount) - ranked[0].bid_amount).toLocaleString()}`}
                        </p>
                      )}
                    </div>
                    <Button type="submit" disabled={submitting}>{submitting ? 'กำลังบันทึก...' : 'เสนอราคา'}</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader><CardTitle className="text-base">ประวัติราคาเสนอทั้งหมด</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">ผู้จัดจำหน่าย</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ราคา</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">เวลา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bids.length === 0 ? (
                      <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">ยังไม่มีราคาเสนอ</td></tr>
                    ) : (
                      bids.map((b) => (
                        <tr key={b.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">{b.suppliers?.company_name || '—'}</td>
                          <td className="p-3 text-right font-mono">฿{b.bid_amount.toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground text-xs">{new Date(b.submitted_at).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader><CardTitle className="text-base">บันทึกการเปลี่ยนสถานะ</CardTitle></CardHeader>
              <CardContent>
                {statusLogs.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-4">ยังไม่มีบันทึก</p>
                ) : (
                  <div className="space-y-3">
                    {statusLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                        <History className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">{statusLabel[log.from_status] || log.from_status}</Badge>
                            <span className="text-muted-foreground">→</span>
                            <Badge className={`text-xs ${statusColor[log.to_status] || ''}`}>{statusLabel[log.to_status] || log.to_status}</Badge>
                          </div>
                          {log.reason && (
                            <p className="text-sm mt-1">เหตุผล: {log.reason}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">{new Date(log.changed_at).toLocaleString('th-TH')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Status log in setup mode */}
      {isSetup && statusLogs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> บันทึกการเปลี่ยนสถานะ</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statusLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                  <History className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-xs">{statusLabel[log.from_status] || log.from_status}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge className={`text-xs ${statusColor[log.to_status] || ''}`}>{statusLabel[log.to_status] || log.to_status}</Badge>
                    </div>
                    {log.reason && <p className="text-sm mt-1">เหตุผล: {log.reason}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(log.changed_at).toLocaleString('th-TH')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rollback Dialog */}
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>กลับไปตั้งค่าใหม่</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">การประมูลจะถูกหยุดชั่วคราวและกลับไปสถานะ "ตั้งค่า" เพื่อแก้ไขรายละเอียดก่อนเปิดประมูลใหม่อีกครั้ง</p>
          <div className="space-y-2 mt-2">
            <Label>เหตุผลในการกลับไปตั้งค่า *</Label>
            <Textarea value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} placeholder="เช่น ต้องแก้ไขจำนวนรอบ, เปลี่ยนเวลาปิดประมูล..." rows={3} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setRollbackOpen(false); setRollbackReason(''); }}>ยกเลิก</Button>
            <Button variant="destructive" onClick={handleRollback} disabled={rollingBack || !rollbackReason.trim()}>
              <RotateCcw className="w-4 h-4 mr-2" />{rollingBack ? 'กำลังดำเนินการ...' : 'ยืนยัน กลับไปตั้งค่า'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
