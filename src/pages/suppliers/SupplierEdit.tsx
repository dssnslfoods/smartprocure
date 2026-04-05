import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SupplierEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '', tax_id: '', address: '', city: '', country: '',
    phone: '', email: '', website: '', tier: '', notes: '',
    is_preferred: false, is_blacklisted: false,
  });

  useEffect(() => {
    if (!id) return;
    supabase.from('suppliers').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setForm({
        company_name: data.company_name || '', tax_id: data.tax_id || '',
        address: data.address || '', city: data.city || '', country: data.country || '',
        phone: data.phone || '', email: data.email || '', website: data.website || '',
        tier: data.tier || '', notes: data.notes || '',
        is_preferred: data.is_preferred || false, is_blacklisted: data.is_blacklisted || false,
      });
      setLoading(false);
    });
  }, [id]);

  const handleChange = (field: string, value: string | boolean) => setForm(p => ({ ...p, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('suppliers').update({
      ...form, updated_at: new Date().toISOString(),
    } as any).eq('id', id!);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Supplier updated successfully' });
      navigate(`/suppliers/${id}`);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link to={`/suppliers/${id}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Edit Supplier</h1>
          <p className="text-sm text-muted-foreground">Update supplier information</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input value={form.company_name} onChange={e => handleChange('company_name', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Tax ID</Label>
                <Input value={form.tax_id} onChange={e => handleChange('tax_id', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={e => handleChange('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input value={form.country} onChange={e => handleChange('country', e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Address</Label>
                <Input value={form.address} onChange={e => handleChange('address', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input value={form.website} onChange={e => handleChange('website', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={form.tier} onValueChange={v => handleChange('tier', v)}>
                  <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical_tier_1">Critical Tier 1</SelectItem>
                    <SelectItem value="non_critical_tier_1">Non-Critical Tier 1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_preferred} onCheckedChange={v => handleChange('is_preferred', v)} />
                <Label>Preferred Supplier</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_blacklisted} onCheckedChange={v => handleChange('is_blacklisted', v)} />
                <Label>Blacklisted</Label>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Link to={`/suppliers/${id}`}><Button variant="outline">Cancel</Button></Link>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Update Supplier'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
