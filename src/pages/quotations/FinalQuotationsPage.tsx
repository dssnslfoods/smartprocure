import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, Plus, CheckCircle2, FileCheck, BarChart3, Eye, ArrowUpDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';

export default function FinalQuotationsPage() {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [sourceQuotations, setSourceQuotations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [compareRfqId, setCompareRfqId] = useState<string>('');
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const { hasRole, user } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    rfq_id: '', supplier_id: '', quotation_id: '', total_amount: '',
    currency: 'USD', payment_terms: '', delivery_terms: '', notes: '',
  });

  const fetchAll = async () => {
    const [fqRes, rfqRes, supRes] = await Promise.all([
      supabase.from('final_quotations').select('*, suppliers(company_name), rfqs(title, rfq_number)').order('created_at', { ascending: false }),
      supabase.from('rfqs').select('id, title, rfq_number').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, company_name').eq('status', 'approved'),
    ]);
    if (fqRes.data) setQuotations(fqRes.data);
    if (rfqRes.data) setRfqs(rfqRes.data);
    if (supRes.data) setSuppliers(supRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchSourceQuotations = async (rfqId: string) => {
    const { data } = await supabase.from('quotations').select('*, suppliers(company_name)').eq('rfq_id', rfqId);
    if (data) setSourceQuotations(data);
  };

  const handleRfqChange = (rfqId: string) => {
    setForm(p => ({ ...p, rfq_id: rfqId, quotation_id: '', supplier_id: '' }));
    fetchSourceQuotations(rfqId);
  };

  const handleSourceQuotationChange = (qId: string) => {
    const q = sourceQuotations.find(s => s.id === qId);
    if (q) {
      setForm(p => ({
        ...p, quotation_id: qId, supplier_id: q.supplier_id,
        total_amount: q.total_amount?.toString() || '', currency: q.currency || 'USD',
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
      currency: form.currency, payment_terms: form.payment_terms,
      delivery_terms: form.delivery_terms, notes: form.notes,
      created_by: user?.id, status: 'pending',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Final quotation created' });
      setCreateOpen(false);
      setForm({ rfq_id: '', supplier_id: '', quotation_id: '', total_amount: '', currency: 'USD', payment_terms: '', delivery_terms: '', notes: '' });
      fetchAll();
    }
    setSaving(false);
  };

  const handleSelect = async (id: string) => {
    const { error } = await supabase.from('final_quotations').update({ is_selected: true, status: 'selected', updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) { toast({ title: 'Quotation selected' }); fetchAll(); }
  };

  const handleReadyForPO = async (id: string) => {
    const { error } = await supabase.from('final_quotations').update({ ready_for_po: true, status: 'ready_for_po', updated_at: new Date().toISOString() }).eq('id', id);
    if (!error) { toast({ title: 'Marked ready for PO' }); fetchAll(); }
  };

  const handleCreateAward = async (fq: any) => {
    const { error } = await supabase.from('awards').insert({
      rfq_id: fq.rfq_id, supplier_id: fq.supplier_id,
      final_quotation_id: fq.id, amount: fq.total_amount,
      status: 'pending', awarded_by: user?.id,
      recommendation: `Based on final quotation evaluation`,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Award created for approval' });
      fetchAll();
    }
  };

  const filtered = quotations.filter((q) =>
    q.suppliers?.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.rfqs?.title?.toLowerCase().includes(search.toLowerCase())
  );

  const pagination = usePagination(filtered, { pageSize: 20 });

  const compareQuotations = quotations.filter(q => q.rfq_id === compareRfqId);
  const rfqsWithQuotations = [...new Set(quotations.map(q => q.rfq_id))].filter(Boolean);

  const canManage = hasRole('admin') || hasRole('procurement_officer');

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: 'bg-amber-500/10 text-amber-600', label: 'Pending' },
    selected: { color: 'bg-blue-500/10 text-blue-600', label: 'Selected' },
    ready_for_po: { color: 'bg-emerald-500/10 text-emerald-600', label: 'Ready for PO' },
    rejected: { color: 'bg-destructive/10 text-destructive', label: 'Rejected' },
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

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Quotations</TabsTrigger>
          <TabsTrigger value="compare"><BarChart3 className="w-4 h-4 mr-1" />Comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search quotations..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                    {loading ? (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                    ) : pagination.paginatedItems.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No final quotations</td></tr>
                    ) : (
                      pagination.paginatedItems.map((q) => {
                        const sc = statusConfig[q.status] || statusConfig.pending;
                        return (
                          <tr key={q.id} className="border-b hover:bg-muted/30">
                            <td className="p-3 font-medium">{q.suppliers?.company_name || '—'}</td>
                            <td className="p-3 text-muted-foreground">{q.rfqs?.title || '—'}</td>
                            <td className="p-3 font-semibold">{q.total_amount ? `${q.currency} ${Number(q.total_amount).toLocaleString()}` : '—'}</td>
                            <td className="p-3 text-muted-foreground text-xs">{[q.payment_terms, q.delivery_terms].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="p-3">
                              <Badge variant="secondary" className={sc.color}>{sc.label}</Badge>
                              {q.is_selected && <Badge variant="outline" className="ml-1 text-xs">✓ Selected</Badge>}
                              {q.ready_for_po && <Badge variant="outline" className="ml-1 text-xs border-emerald-500 text-emerald-600">PO Ready</Badge>}
                            </td>
                            <td className="p-3 text-muted-foreground">{q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}</td>
                            <td className="p-3 text-right">
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="sm" onClick={() => { setSelectedDetail(q); setDetailOpen(true); }}>
                                  <Eye className="w-3 h-3" />
                                </Button>
                                {canManage && !q.is_selected && (
                                  <Button variant="outline" size="sm" onClick={() => handleSelect(q.id)}>
                                    <CheckCircle2 className="w-3 h-3 mr-1" />Select
                                  </Button>
                                )}
                                {canManage && q.is_selected && !q.ready_for_po && (
                                  <Button variant="outline" size="sm" onClick={() => handleReadyForPO(q.id)}>
                                    <FileCheck className="w-3 h-3 mr-1" />PO Ready
                                  </Button>
                                )}
                                {canManage && q.ready_for_po && (
                                  <Button size="sm" onClick={() => handleCreateAward(q)}>Create Award</Button>
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
                {rfqsWithQuotations.map(rid => {
                  const rfq = rfqs.find(r => r.id === rid);
                  return <SelectItem key={rid} value={rid}>{rfq?.title || rid}</SelectItem>;
                })}
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
                      <Button key={q.id} variant="outline" size="sm" onClick={() => handleSelect(q.id)}>
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

      {/* Create Dialog */}
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
                <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="ETB">ETB</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
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

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Quotation Details</DialogTitle></DialogHeader>
          {selectedDetail && (
            <div className="space-y-3 text-sm">
              <Row label="Supplier" value={selectedDetail.suppliers?.company_name} />
              <Row label="RFQ" value={selectedDetail.rfqs?.title} />
              <Row label="Amount" value={selectedDetail.total_amount ? `${selectedDetail.currency} ${Number(selectedDetail.total_amount).toLocaleString()}` : null} />
              <Row label="Payment Terms" value={selectedDetail.payment_terms} />
              <Row label="Delivery Terms" value={selectedDetail.delivery_terms} />
              <Row label="Status" value={selectedDetail.status} />
              <Row label="Selected" value={selectedDetail.is_selected ? 'Yes' : 'No'} />
              <Row label="PO Ready" value={selectedDetail.ready_for_po ? 'Yes' : 'No'} />
              <Row label="Notes" value={selectedDetail.notes} />
              <Row label="Created" value={selectedDetail.created_at ? new Date(selectedDetail.created_at).toLocaleString() : null} />
            </div>
          )}
        </DialogContent>
      </Dialog>
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
