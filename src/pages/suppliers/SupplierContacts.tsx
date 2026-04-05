import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Props { supplierId: string; }

export default function SupplierContacts({ supplierId }: Props) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const [form, setForm] = useState({ contact_name: '', position: '', email: '', phone: '', is_primary: false });

  const fetch = async () => {
    const { data } = await supabase.from('supplier_contacts').select('*').eq('supplier_id', supplierId).order('is_primary', { ascending: false });
    if (data) setContacts(data);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [supplierId]);

  const handleAdd = async () => {
    const { error } = await supabase.from('supplier_contacts').insert({ ...form, supplier_id: supplierId });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Contact added' });
    setForm({ contact_name: '', position: '', email: '', phone: '', is_primary: false });
    setOpen(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('supplier_contacts').delete().eq('id', id);
    toast({ title: 'Contact removed' });
    fetch();
  };

  const canEdit = hasRole('admin') || hasRole('procurement_officer');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Contacts</CardTitle>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Contact</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label>Name *</Label><Input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Position</Label><Input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
                <div className="flex items-center gap-2"><Switch checked={form.is_primary} onCheckedChange={v => setForm(p => ({ ...p, is_primary: v }))} /><Label>Primary Contact</Label></div>
                <Button onClick={handleAdd} disabled={!form.contact_name} className="w-full">Add Contact</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No contacts added yet</p>
        ) : (
          <div className="space-y-3">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{c.contact_name}</span>
                      {c.is_primary && <Badge variant="secondary" className="text-xs">Primary</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{[c.position, c.email, c.phone].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
