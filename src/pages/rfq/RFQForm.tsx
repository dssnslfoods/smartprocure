import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LineItem {
  item_name: string;
  description: string;
  quantity: string;
  unit: string;
  specifications: string;
}

export default function RFQForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', deadline: '', notes: '' });
  const [items, setItems] = useState<LineItem[]>([
    { item_name: '', description: '', quantity: '', unit: '', specifications: '' },
  ]);

  const addItem = () => setItems(p => [...p, { item_name: '', description: '', quantity: '', unit: '', specifications: '' }]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof LineItem, value: string) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.filter(i => i.item_name.trim()).length === 0) {
      toast({ title: 'Error', description: 'Add at least one line item', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const rfqNumber = `RFQ-${Date.now().toString(36).toUpperCase()}`;
    const { data: rfq, error } = await supabase.from('rfqs').insert({
      rfq_number: rfqNumber,
      title: form.title,
      description: form.description,
      deadline: form.deadline || null,
      notes: form.notes,
      status: 'draft',
      created_by: user?.id,
    }).select().single();

    if (error || !rfq) {
      toast({ title: 'Error', description: error?.message || 'Failed to create RFQ', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const validItems = items.filter(i => i.item_name.trim());
    if (validItems.length > 0) {
      await supabase.from('rfq_items').insert(
        validItems.map(i => ({
          rfq_id: rfq.id,
          item_name: i.item_name,
          description: i.description,
          quantity: parseFloat(i.quantity) || null,
          unit: i.unit,
          specifications: i.specifications,
        }))
      );
    }

    toast({ title: 'RFQ Created', description: `${rfqNumber} created successfully` });
    setSaving(false);
    navigate(`/rfq/${rfq.id}`);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link to="/rfq"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold">Create RFQ</h1>
          <p className="text-sm text-muted-foreground">New Request for Quotation</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">General Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Deadline</Label>
                <Input type="datetime-local" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Line Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" />Add Item</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3 relative">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Item #{i + 1}</span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(i)}>
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Item Name *</Label>
                    <Input value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)} placeholder="e.g. Sugar 50kg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} placeholder="100" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} placeholder="bags" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Specifications</Label>
                  <Input value={item.specifications} onChange={e => updateItem(i, 'specifications', e.target.value)} placeholder="ISO certified, food-grade..." />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link to="/rfq"><Button variant="outline">Cancel</Button></Link>
          <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create RFQ'}</Button>
        </div>
      </form>
    </div>
  );
}
