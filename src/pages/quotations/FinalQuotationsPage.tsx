import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Search, Plus, CheckCircle2, FileCheck, BarChart3, Eye, ArrowRight, Award, Trophy, Clock, ListChecks } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSupabasePagination } from '@/hooks/use-supabase-pagination';
import { PaginationControls } from '@/components/PaginationControls';

export default function FinalQuotationsPage() {
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [sourceQuotations, setSourceQuotations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [compareQuotations, setCompareQuotations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compareRfqId, setCompareRfqId] = useState<string>('');
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [awardConfirm, setAwardConfirm] = useState<any>(null);
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState('THB');

  const [form, setForm] = useState({
    rfq_id: '', supplier_id: '', quotation_id: '', total_amount: '',
    currency: '', payment_terms: '', delivery_terms: '', notes: '',
  });

  const fetchBasics = async () => {
    const [rfqRes, supRes, curRes] = await Promise.all([
      supabase.from('rfqs').select('id, title, rfq_number').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, company_name').eq('status', 'approved'),
      // Derive currency options from actual data (no hardcode)
      supabase.from('final_quotations').select('currency'),
    ]);
    if (rfqRes.data) setRfqs(rfqRes.data);
    if (supRes.data) setSuppliers(supRes.data);

    // Build currency list + most-common default from DB
    const counts: Record<string, number> = {};
    (curRes.data ?? []).forEach((r: any) => {
      const c = (r.currency || '').trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const opts = sorted.length > 0 ? sorted : ['THB'];
    setCurrencyOptions(opts);
    const def = opts[0];
    setDefaultCurrency(def);
    setForm(p => ({ ...p, currency: p.currency || def }));
  };

  useEffect(() => { fetchBasics(); }, []);

  const fetchCompareData = useCallback(async (rfqId: string) => {
    if (!rfqId) {
      setCompareQuotations([]);
      return;
    }
    const { data } = await supabase.from('final_quotations').select('*, suppliers(company_name)').eq('rfq_id', rfqId);
    if (data) setCompareQuotations(data);
  }, []);

  useEffect(() => { fetchCompareData(compareRfqId); }, [compareRfqId, fetchCompareData]);

  const pagination = useSupabasePagination<any>({
    tableName: 'final_quotations',
    select: '*, suppliers(company_name), rfqs(title, rfq_number)',
    pageSize: 200,
  });

  // Client-side search across all visible columns
  const searchLower = search.toLowerCase().trim();
  const filteredItems = searchLower
    ? pagination.items.filter((q: any) => {
        const supplierName = q.suppliers?.company_name || '';
        const rfqTitle = q.rfqs?.title || '';
        const rfqNumber = q.rfqs?.rfq_number || '';
        const amount = q.total_amount ? `${q.currency} ${Number(q.total_amount).toLocaleString()}` : '';
        const terms = [q.payment_terms, q.delivery_terms].filter(Boolean).join(' ');
        const status = q.status || '';
        const date = q.created_at ? new Date(q.created_at).toLocaleDateString() : '';
        const notes = q.notes || '';
        const combined = `${supplierName} ${rfqTitle} ${rfqNumber} ${amount} ${terms} ${status} ${date} ${notes}`.toLowerCase();
        return combined.includes(searchLower);
      })
    : pagination.items;

  const handleRfqChange = async (rfqId: string) => {
    setForm(p => ({ ...p, rfq_id: rfqId, quotation_id: '', supplier_id: '' }));
    const { data } = await supabase.from('quotations').select('*, suppliers(company_name)').eq('rfq_id', rfqId);
    if (data) setSourceQuotations(data);
  };

  const handleSourceQuotationChange = (qId: string) => {
    const q = sourceQuotations.find(s => s.id === qId);
    if (q) {
      setForm(p => ({
        ...p, quotation_id: qId, supplier_id: q.supplier_id,
        total_amount: q.total_amount?.toString() || '', currency: q.currency || defaultCurrency,
        payment_terms: q.payment_terms || '', delivery_terms: q.delivery_terms || '',
      }));
    }
  };

  const handleCreate = async () => {
    if (!form.rfq_id || !form.supplier_id) return;
    setSaving(true);
    const { error } = await supabase.from('final_quotations').insert({
      rfq_id: form.rfq_id, supplier_id: form.supplier_id,
      quotation_id: form.quotation_id || null,
      total_amount: parseFloat(form.total_amount) || null,
      currency: form.currency || defaultCurrency, payment_terms: form.payment_terms,
      delivery_terms: form.delivery_terms, notes: form.notes,
      created_by: user?.id, status: 'pending',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Final quotation created' });
      setCreateOpen(false);
      setForm({ rfq_id: '', supplier_id: '', quotation_id: '', total_amount: '', currency: 'USD', payment_terms: '', delivery_terms: '', notes: '' });
      pagination.refresh();
      if (compareRfqId === form.rfq_id) fetchCompareData(compareRfqId);
    }
    setSaving(false);
  };

  const handleSelect = async (id: string, rfqId: string) => {
    const { error } = await supabase.from('final_quotations').update({ is_selected: true, status: 'selected', updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) { 
      toast({ title: 'Quotation selected' }); 
      pagination.refresh();
      if (compareRfqId === rfqId) fetchCompareData(compareRfqId);
    }
  };

  const handleReadyForPO = async (id: string) => {
    const { error } = await supabase.from('final_quotations').update({ ready_for_po: true, status: 'ready_for_po', updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) { toast({ title: 'Marked ready for PO' }); pagination.refresh(); }
  };

  const handleCreateAward = async (fq: any) => {
    const { error } = await supabase.from('awards').insert({
      rfq_id: fq.rfq_id, supplier_id: fq.supplier_id,
      final_quotation_id: fq.id, amount: fq.total_amount,
      status: 'pending', awarded_by: user?.id,
      recommendation: `Based on final quotation evaluation`,
    });
    if (error) {
      toast({ title: 'เกิดข้อผิดพลาด', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: '✓ สร้างใบมอบงานแล้ว',
        description: 'กำลังพาไปที่หน้า "การมอบงาน" เพื่อดำเนินการอนุมัติต่อ',
      });
      setAwardConfirm(null);
      pagination.refresh();
      setTimeout(() => navigate('/awards'), 800);
    }
  };

  const canManage = hasRole('admin') || hasRole('procurement_officer');

  const statusConfig: Record<string, { color: string; label: string; step: number }> = {
    pending:      { color: 'bg-amber-500/10 text-amber-600',     label: 'รอเลือก',      step: 1 },
    selected:     { color: 'bg-blue-500/10 text-blue-600',       label: 'เลือกแล้ว',     step: 2 },
    ready_for_po: { color: 'bg-emerald-500/10 text-emerald-600', label: 'พร้อมออก PO',  step: 3 },
    rejected:     { color: 'bg-destructive/10 text-destructive', label: 'ไม่ผ่าน',       step: 0 },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Final Quotations</h1>
          <p className="text-sm text-muted-foreground">Compare, select, and prepare quotations for PO</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Final Quotation</Button>
        )}
      </div>

      <Tabs defaultValue="all" className="space-y-4" onValueChange={(v) => v === 'compare' && compareRfqId && fetchCompareData(compareRfqId)}>
        <TabsList>
          <TabsTrigger value="all">All Quotations</TabsTrigger>
          <TabsTrigger value="compare"><BarChart3 className="w-4 h-4 mr-1" />Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {/* Compact workflow guide */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <ListChecks className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">ขั้นตอน:</span>
            <span>รอเลือก</span>
            <ArrowRight className="w-3 h-3" />
            <span>เลือกผู้ชนะ</span>
            <ArrowRight className="w-3 h-3" />
            <span>พร้อม PO</span>
            <ArrowRight className="w-3 h-3" />
            <span>สร้างใบมอบงาน</span>
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="ค้นหา (ผู้ขาย, RFQ, จำนวนเงิน, สถานะ...)" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Terms</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.loading ? (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                    ) : filteredItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{search ? 'ไม่พบผลลัพธ์ที่ค้นหา' : 'No final quotations'}</td></tr>
                    ) : (
                      filteredItems.map((q) => {
                        const sc = statusConfig[q.status] || statusConfig.pending;
                        return (
                          <tr key={q.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{q.suppliers?.company_name || '—'}</td>
                            <td className="p-3 text-muted-foreground">{q.rfqs?.title || '—'}</td>
                            <td className="p-3 font-semibold">{q.total_amount ? `${q.currency} ${Number(q.total_amount).toLocaleString()}` : '—'}</td>
                            <td className="p-3 text-muted-foreground text-xs">{[q.payment_terms, q.delivery_terms].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="p-3">
                              <div className="flex flex-col gap-1.5">
                                <Badge variant="secondary" className={`${sc.color} w-fit`}>{sc.label}</Badge>
                                {sc.step > 0 && (
                                  <div className="flex items-center gap-1" title={`ขั้นที่ ${sc.step} จาก 3`}>
                                    {[1, 2, 3].map(n => (
                                      <span key={n} className={`h-1.5 w-5 rounded-full ${n <= sc.step ? 'bg-primary' : 'bg-muted'}`} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</td>
                            <td className="p-3 text-right">
                              <div className="flex gap-1 justify-end items-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedDetail(q); setDetailOpen(true); }}>
                                      <Eye className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>ดูรายละเอียด</TooltipContent>
                                </Tooltip>

                                {canManage && !q.is_selected && q.status !== 'rejected' && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleSelect(q.id, q.rfq_id)}>
                                        <CheckCircle2 className="w-3 h-3 mr-1" />เลือกเป็นผู้ชนะ
                                        <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="p-3">
                                      <WorkflowProgressTooltip currentStep={1} action="เลือกใบเสนอราคานี้เป็นผู้ชนะของ RFQ" />
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {canManage && q.is_selected && !q.ready_for_po && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="outline" size="sm" onClick={() => handleReadyForPO(q.id)}>
                                        <FileCheck className="w-3 h-3 mr-1" />ยืนยันพร้อม PO
                                        <ArrowRight className="w-3 h-3 ml-1 opacity-50" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="p-3">
                                      <WorkflowProgressTooltip currentStep={2} action="ยืนยันว่าใบนี้พร้อมจัดทำใบสั่งซื้อ (PO)" />
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {canManage && q.ready_for_po && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="sm" onClick={() => setAwardConfirm(q)}>
                                        <Award className="w-3 h-3 mr-1" />สร้างใบมอบงาน
                                        <ArrowRight className="w-3 h-3 ml-1" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="p-3">
                                      <WorkflowProgressTooltip currentStep={3} action="สร้าง Award เข้ากระบวนการอนุมัติ" />
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                {q.status === 'rejected' && (
                                  <span className="text-xs text-muted-foreground italic">ถูกปฏิเสธ</span>
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
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>Compare quotations for RFQ:</Label>
            <Select value={compareRfqId} onValueChange={setCompareRfqId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Select an RFQ" /></SelectTrigger>
              <SelectContent>
                {rfqs.map(rfq => (
                  <SelectItem key={rfq.id} value={rfq.id}>{rfq.title || rfq.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {compareRfqId && compareQuotations.length > 0 ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Comparison Matrix — {compareQuotations.length} quotations</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium text-muted-foreground">Criteria</th>
                        {compareQuotations.map(q => (
                          <th key={q.id} className="text-center p-3 font-medium">
                            <div>{q.suppliers?.company_name}</div>
                            {q.is_selected && <Badge variant="outline" className="text-xs mt-1">Selected</Badge>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <CompareRow label="Total Amount" values={compareQuotations.map(q => q.total_amount ? `${q.currency} ${Number(q.total_amount).toLocaleString()}` : '—')} highlight="lowest" rawValues={compareQuotations.map(q => Number(q.total_amount) || Infinity)} />
                      <CompareRow label="Currency" values={compareQuotations.map(q => q.currency || '—')} />
                      <CompareRow label="Payment Terms" values={compareQuotations.map(q => q.payment_terms || '—')} />
                      <CompareRow label="Delivery Terms" values={compareQuotations.map(q => q.delivery_terms || '—')} />
                      <CompareRow label="Status" values={compareQuotations.map(q => q.status || 'pending')} />
                      <CompareRow label="PO Ready" values={compareQuotations.map(q => q.ready_for_po ? '✅ Yes' : '—')} />
                      <CompareRow label="Notes" values={compareQuotations.map(q => q.notes || '—')} />
                    </tbody>
                  </table>
                </div>

                {canManage && (
                  <div className="mt-4 flex gap-2 flex-wrap">
                    {compareQuotations.filter(q => !q.is_selected).map(q => (
                      <Button key={q.id} variant="outline" size="sm" onClick={() => handleSelect(q.id, q.rfq_id)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" />Select {q.suppliers?.company_name}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : compareRfqId ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No final quotations for this RFQ</CardContent></Card>
          ) : null}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Final Quotation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>RFQ *</Label>
              <Select value={form.rfq_id} onValueChange={handleRfqChange}>
                <SelectTrigger><SelectValue placeholder="Select RFQ" /></SelectTrigger>
                <SelectContent>{rfqs.map(r => <SelectItem key={r.id} value={r.id}>{r.title} ({r.rfq_number})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {sourceQuotations.length > 0 && (
              <div className="space-y-1">
                <Label>Import from Quotation (optional)</Label>
                <Select value={form.quotation_id} onValueChange={handleSourceQuotationChange}>
                  <SelectTrigger><SelectValue placeholder="Select source quotation" /></SelectTrigger>
                  <SelectContent>{sourceQuotations.map(q => (
                    <SelectItem key={q.id} value={q.id}>{q.suppliers?.company_name} — {q.currency} {q.total_amount?.toLocaleString()}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Supplier *</Label>
              <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 grid-cols-2">
              <div className="space-y-1">
                <Label>Total Amount</Label>
                <Input type="number" value={form.total_amount} onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={form.currency || defaultCurrency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Payment Terms</Label>
              <Input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} placeholder="Net 30" />
            </div>
            <div className="space-y-1">
              <Label>Delivery Terms</Label>
              <Input value={form.delivery_terms} onChange={e => setForm(p => ({ ...p, delivery_terms: e.target.value }))} placeholder="FOB, CIF..." />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <Button onClick={handleCreate} disabled={saving || !form.rfq_id || !form.supplier_id} className="w-full">
              {saving ? 'Creating...' : 'Create Final Quotation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>รายละเอียดใบเสนอราคา</DialogTitle></DialogHeader>
          {selectedDetail && (
            <div className="space-y-3 text-sm">
              <DetailRow label="ผู้ขาย" value={selectedDetail.suppliers?.company_name} />
              <DetailRow label="RFQ" value={selectedDetail.rfqs?.title} />
              <DetailRow label="จำนวนเงิน" value={selectedDetail.total_amount ? `${selectedDetail.currency || ''} ${Number(selectedDetail.total_amount).toLocaleString()}`.trim() : null} />
              <DetailRow label="เงื่อนไขชำระเงิน" value={selectedDetail.payment_terms} />
              <DetailRow label="เงื่อนไขส่งมอบ" value={selectedDetail.delivery_terms} />
              <DetailRow label="สถานะ" value={(statusConfig[selectedDetail.status] || statusConfig.pending).label} />
              <DetailRow label="หมายเหตุ" value={selectedDetail.notes} />
              <DetailRow label="วันที่สร้าง" value={selectedDetail.created_at ? new Date(selectedDetail.created_at).toLocaleString('th-TH') : null} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Award confirmation */}
      <AlertDialog open={!!awardConfirm} onOpenChange={(o) => !o && setAwardConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" /> ยืนยันสร้างใบมอบงาน (Award)?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>ระบบจะสร้างใบมอบงานจากใบเสนอราคานี้ และส่งเข้ากระบวนการอนุมัติ</p>
                {awardConfirm && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Trophy className="w-4 h-4 text-emerald-600" />
                      {awardConfirm.suppliers?.company_name || '—'}
                    </div>
                    <div className="text-muted-foreground">RFQ: {awardConfirm.rfqs?.title || '—'}</div>
                    <div className="text-muted-foreground">
                      จำนวนเงิน: <span className="font-semibold text-foreground">
                        {awardConfirm.total_amount ? `${awardConfirm.currency} ${Number(awardConfirm.total_amount).toLocaleString()}` : '—'}
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-xs flex items-center gap-1.5 text-primary">
                  <ArrowRight className="w-3.5 h-3.5" /> หลังยืนยัน จะพาไปที่หน้า "การมอบงาน" เพื่อดำเนินการอนุมัติต่อ
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => awardConfirm && handleCreateAward(awardConfirm)}>
              <Award className="w-4 h-4 mr-1" /> ยืนยันสร้างใบมอบงาน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function CompareRow({ label, values, highlight, rawValues }: { label: string; values: string[]; highlight?: 'lowest'; rawValues?: number[] }) {
  const minIdx = highlight === 'lowest' && rawValues ? rawValues.indexOf(Math.min(...rawValues)) : -1;
  return (
    <tr className="border-b">
      <td className="p-3 font-medium text-muted-foreground">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`p-3 text-center ${i === minIdx ? 'font-bold text-emerald-600 bg-emerald-500/5' : ''}`}>{v}</td>
      ))}
    </tr>
  );
}

const WORKFLOW_STEPS = [
  { label: 'รอเลือก' },
  { label: 'เลือกผู้ชนะ' },
  { label: 'พร้อม PO' },
  { label: 'มอบงาน' },
];

function WorkflowProgressTooltip({ currentStep, action }: { currentStep: 1 | 2 | 3; action: string }) {
  const toStep = currentStep + 1;
  return (
    <div className="space-y-2 py-0.5" style={{ minWidth: 220 }}>
      <p className="text-xs font-medium leading-tight">{action}</p>
      <div className="flex items-start">
        {WORKFLOW_STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < currentStep;
          const current = n === currentStep;
          const next = n === toStep;
          return (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center" style={{ minWidth: 48 }}>
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold',
                  done    && 'bg-emerald-500 text-white',
                  current && 'bg-amber-400 text-white ring-2 ring-amber-300/50',
                  next    && 'bg-blue-500 text-white ring-2 ring-blue-300/50',
                  !done && !current && !next && 'bg-muted-foreground/20 text-muted-foreground',
                )}>
                  {done ? '✓' : n}
                </div>
                <span className={cn(
                  'text-[9px] text-center mt-0.5 leading-tight whitespace-nowrap',
                  done    && 'text-emerald-400',
                  current && 'text-amber-400 font-bold',
                  next    && 'text-blue-400 font-bold',
                  !done && !current && !next && 'text-muted-foreground/50',
                )}>
                  {s.label}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className={cn(
                  'h-px w-3 mb-[18px] flex-shrink-0',
                  n < currentStep ? 'bg-emerald-500' :
                  n === currentStep ? 'bg-blue-400' : 'bg-muted-foreground/20',
                )} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-blue-400 font-medium">
        ↳ กดเพื่อไปยัง: {WORKFLOW_STEPS[toStep - 1]?.label}
      </p>
    </div>
  );
}
