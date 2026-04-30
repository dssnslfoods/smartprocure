import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Building2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  rfqId: string;
  rfqItems: any[];
}

export default function RFQQuotations({ rfqId, rfqItems }: Props) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [declinedRows, setDeclinedRows] = useState<{ supplier_id: string; declined_at: string; declined_reason: string | null; company_name: string }[]>([]);
  const { user, hasRole, profile } = useAuth();
  const isSupplier   = hasRole('supplier');
  const mySupplierId = profile?.supplier_id ?? null;
  const { toast } = useToast();

  const [form, setForm] = useState({
    supplier_id: '',
    currency: 'USD',
    payment_term: '',
    delivery_terms: '',
    validity_days: '30',
    lead_time_days: '',
    warranty: '',
    discount: '0',
    vat: '0',
    spec_compliance_score: '',
    remark: '',
    notes: '',
  });
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});

  // Decline-to-quote state
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const [myInviteRow, setMyInviteRow] = useState<{ id: string; declined_at: string | null; declined_reason: string | null; responded: boolean } | null>(null);

  const fetchQuotations = async () => {
    const { data } = await supabase
      .from('quotations')
      .select('*, suppliers(company_name)')
      .eq('rfq_id', rfqId)
      .order('created_at', { ascending: false });
    if (data) setQuotations(data);
    setLoading(false);
  };

  const fetchInvitedSuppliers = async () => {
    const { data } = await supabase
      .from('rfq_suppliers')
      .select('id, supplier_id, responded, declined_at, declined_reason, suppliers(id, company_name)')
      .eq('rfq_id', rfqId);
    if (data) {
      setSuppliers(data.map((r: any) => r.suppliers).filter(Boolean));
      setDeclinedRows(
        data
          .filter((r: any) => r.declined_at)
          .map((r: any) => ({
            supplier_id: r.supplier_id,
            declined_at: r.declined_at,
            declined_reason: r.declined_reason,
            company_name: r.suppliers?.company_name || 'Unknown',
          }))
      );
      if (mySupplierId) {
        const mine = data.find((r: any) => r.supplier_id === mySupplierId);
        setMyInviteRow(mine ? {
          id: mine.id,
          declined_at: mine.declined_at,
          declined_reason: mine.declined_reason,
          responded: mine.responded,
        } : null);
      }
    }
  };

  useEffect(() => {
    fetchQuotations();
    fetchInvitedSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId, mySupplierId]);

  const handleDecline = async () => {
    if (!mySupplierId) return;
    if (!declineReason.trim()) {
      toast({ title: 'กรุณาใส่เหตุผล', variant: 'destructive' });
      return;
    }
    setDeclining(true);
    const { data, error } = await supabase
      .from('rfq_suppliers')
      .update({
        declined_at: new Date().toISOString(),
        declined_reason: declineReason.trim(),
        responded: true,
      })
      .eq('rfq_id', rfqId)
      .eq('supplier_id', mySupplierId)
      .select();
    setDeclining(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (!data || data.length === 0) {
      toast({
        title: 'บันทึกไม่สำเร็จ',
        description: 'อาจไม่มีสิทธิ์ — ตรวจสอบว่า account นี้ผูกกับ supplier และถูก invite ใน RFQ นี้',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'แจ้งจัดซื้อแล้ว', description: 'การถอนตัวพร้อมเหตุผลถูกบันทึก' });
    setDeclineOpen(false);
    setDeclineReason('');
    fetchInvitedSuppliers();
  };

  const handleUndoDecline = async () => {
    if (!mySupplierId) return;
    const { error } = await supabase
      .from('rfq_suppliers')
      .update({ declined_at: null, declined_reason: null, responded: false })
      .eq('rfq_id', rfqId)
      .eq('supplier_id', mySupplierId);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'ยกเลิกการถอนตัวแล้ว' });
    fetchInvitedSuppliers();
  };

  // Auto-fill supplier when login as supplier role
  useEffect(() => {
    if (isSupplier && mySupplierId && !form.supplier_id) {
      setForm(p => ({ ...p, supplier_id: mySupplierId }));
    }
  }, [isSupplier, mySupplierId, form.supplier_id]);

  const handleSubmit = async () => {
    if (!form.supplier_id) return;
    setSaving(true);

    const subtotal = Object.values(itemPrices).reduce((sum, p) => sum + (parseFloat(p) || 0), 0);
    const discount = parseFloat(form.discount) || 0;
    const vat = parseFloat(form.vat) || 0;
    const totalAmount = Math.max(0, subtotal - discount + vat);

    const { data: quotation, error } = await supabase.from('quotations').insert({
      rfq_id: rfqId,
      supplier_id: form.supplier_id,
      price: subtotal,
      discount,
      vat,
      total_amount: totalAmount,
      currency: form.currency,
      payment_terms: form.payment_term,
      payment_term: form.payment_term,
      delivery_terms: form.delivery_terms,
      validity_days: parseInt(form.validity_days) || 30,
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      warranty: form.warranty || null,
      spec_compliance_score: form.spec_compliance_score ? parseFloat(form.spec_compliance_score) : null,
      remark: form.remark || null,
      notes: form.notes || null,
      evaluation_status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).select().single();

    if (error || !quotation) {
      toast({ title: 'Error', description: error?.message || 'Failed', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Insert quotation items
    const qItems = rfqItems.filter(i => itemPrices[i.id]).map(item => ({
      quotation_id: quotation.id,
      rfq_item_id: item.id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: parseFloat(itemPrices[item.id]) || 0,
      total_price: (item.quantity || 1) * (parseFloat(itemPrices[item.id]) || 0),
    }));

    if (qItems.length > 0) {
      await supabase.from('quotation_items').insert(qItems);
    }

    // Mark supplier as responded
    await supabase.from('rfq_suppliers').update({ responded: true }).eq('rfq_id', rfqId).eq('supplier_id', form.supplier_id);

    toast({ title: 'Quotation submitted' });
    setOpen(false);
    setForm({ supplier_id: '', currency: 'USD', payment_term: '', delivery_terms: '', validity_days: '30', lead_time_days: '', warranty: '', discount: '0', vat: '0', spec_compliance_score: '', remark: '', notes: '' });
    setItemPrices({});
    setSaving(false);
    fetchQuotations();
  };

  const canSubmit = hasRole('admin') || hasRole('procurement_officer') || hasRole('supplier');

  const declined = !!myInviteRow?.declined_at;

  return (
    <Card>
      {isSupplier && declined && (
        <div className="mx-6 mt-6 p-3 rounded-md border border-red-200 bg-red-50 text-sm">
          <div className="font-semibold text-red-700 flex items-center gap-1">
            <XCircle className="h-4 w-4" />
            คุณถอนตัวจาก RFQ นี้แล้ว
          </div>
          {myInviteRow?.declined_reason && (
            <div className="text-xs text-red-700 mt-1">
              เหตุผล: {myInviteRow.declined_reason}
            </div>
          )}
          <Button size="sm" variant="outline" className="mt-2" onClick={handleUndoDecline}>
            ยกเลิกการถอนตัว
          </Button>
        </div>
      )}
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Quotations ({quotations.length})</CardTitle>
        <div className="flex items-center gap-2">
          {isSupplier && mySupplierId && !declined && myInviteRow && (
            <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-1" />ถอนตัว
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>ถอนตัว ไม่เสนอราคา</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    ระบุเหตุผลที่ไม่สามารถเสนอราคาในครั้งนี้ — ข้อความจะถูกส่งให้ทีมจัดซื้อ
                  </p>
                  <Textarea
                    rows={4}
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="เช่น สินค้าขาดสต็อก, ไม่สามารถส่งภายใน lead time, ราคาวัตถุดิบไม่นิ่ง..."
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setDeclineOpen(false)}>ยกเลิก</Button>
                    <Button onClick={handleDecline} disabled={declining || !declineReason.trim()}
                      className="bg-red-600 hover:bg-red-700">
                      {declining ? 'กำลังบันทึก...' : 'ยืนยันถอนตัว'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canSubmit && !declined && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Submit Quotation</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Submit Quotation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Supplier *</Label>
                  {isSupplier && mySupplierId ? (
                    <div className="flex items-center gap-2 p-2.5 border rounded-md bg-muted/40">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {suppliers.find(s => s.id === mySupplierId)?.company_name
                          || profile?.full_name
                          || 'My company'}
                      </span>
                    </div>
                  ) : (
                    <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {rfqItems.length > 0 && (
                  <div className="space-y-2">
                    <Label>Item Pricing</Label>
                    {rfqItems.map(item => (
                      <div key={item.id} className="flex items-center gap-2 p-2 border rounded">
                        <div className="flex-1 text-sm">
                          <span className="font-medium">{item.item_name}</span>
                          <span className="text-muted-foreground ml-1">({item.quantity || '—'} {item.unit || ''})</span>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Unit price"
                          className="w-28"
                          value={itemPrices[item.id] || ''}
                          onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Currency</Label>
                    <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="THB">THB</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="ETB">ETB</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Lead Time (days)</Label>
                    <Input type="number" value={form.lead_time_days} onChange={e => setForm(p => ({ ...p, lead_time_days: e.target.value }))} placeholder="14" />
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Discount</Label>
                    <Input type="number" step="0.01" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">VAT</Label>
                    <Input type="number" step="0.01" value={form.vat} onChange={e => setForm(p => ({ ...p, vat: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Validity (days)</Label>
                    <Input value={form.validity_days} onChange={e => setForm(p => ({ ...p, validity_days: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Payment Term</Label>
                    <Input value={form.payment_term} onChange={e => setForm(p => ({ ...p, payment_term: e.target.value }))} placeholder="Net 30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Spec Compliance % (0–100)</Label>
                    <Input type="number" min="0" max="100" value={form.spec_compliance_score} onChange={e => setForm(p => ({ ...p, spec_compliance_score: e.target.value }))} placeholder="85" />
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Delivery Terms</Label>
                    <Input value={form.delivery_terms} onChange={e => setForm(p => ({ ...p, delivery_terms: e.target.value }))} placeholder="FOB, CIF..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Warranty</Label>
                    <Input value={form.warranty} onChange={e => setForm(p => ({ ...p, warranty: e.target.value }))} placeholder="12 months" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Remark</Label>
                  <Textarea value={form.remark} onChange={e => setForm(p => ({ ...p, remark: e.target.value }))} rows={2} placeholder="Any additional remarks..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Internal Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                </div>
                <Button onClick={handleSubmit} disabled={saving || !form.supplier_id} className="w-full">
                  {saving ? 'Submitting...' : 'Submit Quotation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : quotations.length === 0 && declinedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No quotations submitted yet</p>
        ) : (
          <div className="space-y-3">
            {quotations.map(q => (
              <div key={q.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{q.suppliers?.company_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {q.currency} {q.total_amount?.toLocaleString()} · {q.payment_terms || '—'} · v{q.version}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">{q.currency} {q.total_amount?.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{q.submitted_at ? new Date(q.submitted_at).toLocaleDateString() : '—'}</p>
                </div>
              </div>
            ))}

            {declinedRows.length > 0 && (
              <>
                <div className="pt-2 text-xs font-medium text-muted-foreground">
                  ถอนตัว ไม่เสนอราคา ({declinedRows.length})
                </div>
                {declinedRows.map(d => (
                  <div key={d.supplier_id} className="p-4 border border-red-200 rounded-lg bg-red-50/50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                          <XCircle className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{d.company_name}</p>
                          <p className="text-xs text-red-700 mt-0.5">
                            <span className="font-medium">เหตุผล:</span> {d.declined_reason || '— ไม่ระบุ —'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          ถอนตัว
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(d.declined_at).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
