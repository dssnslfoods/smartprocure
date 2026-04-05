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
import { Plus, FileText, Building2 } from 'lucide-react';
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
  const { user, hasRole } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    supplier_id: '',
    currency: 'USD',
    payment_terms: '',
    delivery_terms: '',
    validity_days: '30',
    notes: '',
  });
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});

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
      .select('supplier_id, suppliers(id, company_name)')
      .eq('rfq_id', rfqId);
    if (data) setSuppliers(data.map((r: any) => r.suppliers).filter(Boolean));
  };

  useEffect(() => {
    fetchQuotations();
    fetchInvitedSuppliers();
  }, [rfqId]);

  const handleSubmit = async () => {
    if (!form.supplier_id) return;
    setSaving(true);

    const totalAmount = Object.values(itemPrices).reduce((sum, p) => sum + (parseFloat(p) || 0), 0);

    const { data: quotation, error } = await supabase.from('quotations').insert({
      rfq_id: rfqId,
      supplier_id: form.supplier_id,
      total_amount: totalAmount,
      currency: form.currency,
      payment_terms: form.payment_terms,
      delivery_terms: form.delivery_terms,
      validity_days: parseInt(form.validity_days) || 30,
      notes: form.notes,
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
    setForm({ supplier_id: '', currency: 'USD', payment_terms: '', delivery_terms: '', validity_days: '30', notes: '' });
    setItemPrices({});
    setSaving(false);
    fetchQuotations();
  };

  const canSubmit = hasRole('admin') || hasRole('procurement_officer') || hasRole('supplier');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Quotations ({quotations.length})</CardTitle>
        {canSubmit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Submit Quotation</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Submit Quotation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Supplier *</Label>
                  <Select value={form.supplier_id} onValueChange={v => setForm(p => ({ ...p, supplier_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                        <SelectItem value="ETB">ETB</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Validity (days)</Label>
                    <Input value={form.validity_days} onChange={e => setForm(p => ({ ...p, validity_days: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Payment Terms</Label>
                  <Input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} placeholder="Net 30" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Delivery Terms</Label>
                  <Input value={form.delivery_terms} onChange={e => setForm(p => ({ ...p, delivery_terms: e.target.value }))} placeholder="FOB, CIF..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                </div>
                <Button onClick={handleSubmit} disabled={saving || !form.supplier_id} className="w-full">
                  {saving ? 'Submitting...' : 'Submit Quotation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : quotations.length === 0 ? (
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
