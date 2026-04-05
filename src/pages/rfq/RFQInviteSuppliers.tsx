import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { UserPlus, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  rfqId: string;
  rfqStatus: string;
  onUpdate: () => void;
}

export default function RFQInviteSuppliers({ rfqId, rfqStatus, onUpdate }: Props) {
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { hasRole } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetch = async () => {
      const [suppRes, invRes] = await Promise.all([
        supabase.from('suppliers').select('id, company_name, email, tier, status').eq('status', 'approved').order('company_name'),
        supabase.from('rfq_suppliers').select('supplier_id').eq('rfq_id', rfqId),
      ]);
      if (suppRes.data) setAllSuppliers(suppRes.data);
      if (invRes.data) {
        const ids = new Set(invRes.data.map((r: any) => r.supplier_id));
        setInvitedIds(ids);
      }
      setLoading(false);
    };
    fetch();
  }, [rfqId]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleInvite = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const rows = Array.from(selected).map(supplier_id => ({ rfq_id: rfqId, supplier_id }));
    const { error } = await supabase.from('rfq_suppliers').insert(rows);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Suppliers invited', description: `${selected.size} supplier(s) invited` });
      setSelected(new Set());
      setInvitedIds(prev => new Set([...prev, ...selected]));
      onUpdate();
    }
  };

  const handleRemove = async (supplierId: string) => {
    await supabase.from('rfq_suppliers').delete().eq('rfq_id', rfqId).eq('supplier_id', supplierId);
    setInvitedIds(prev => { const n = new Set(prev); n.delete(supplierId); return n; });
    toast({ title: 'Supplier removed from RFQ' });
    onUpdate();
  };

  const canEdit = (hasRole('admin') || hasRole('procurement_officer')) && rfqStatus === 'draft';

  if (loading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const invited = allSuppliers.filter(s => invitedIds.has(s.id));
  const available = allSuppliers.filter(s => !invitedIds.has(s.id));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Invited */}
      <Card>
        <CardHeader><CardTitle className="text-base">Invited Suppliers ({invited.length})</CardTitle></CardHeader>
        <CardContent>
          {invited.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No suppliers invited yet</p>
          ) : (
            <div className="space-y-2">
              {invited.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{s.company_name}</p>
                      <p className="text-xs text-muted-foreground">{s.email || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-xs">Invited</Badge>
                    {canEdit && <Button variant="ghost" size="sm" className="text-xs" onClick={() => handleRemove(s.id)}>Remove</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available */}
      {canEdit && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Available Suppliers ({available.length})</CardTitle>
            <Button size="sm" disabled={selected.size === 0 || saving} onClick={handleInvite}>
              <UserPlus className="w-4 h-4 mr-1" />{saving ? 'Inviting...' : `Invite (${selected.size})`}
            </Button>
          </CardHeader>
          <CardContent>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">All approved suppliers have been invited</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {available.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/30 transition-colors">
                    <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                    <div>
                      <p className="text-sm font-medium">{s.company_name}</p>
                      <p className="text-xs text-muted-foreground">{s.tier?.replace(/_/g, ' ') || 'No tier'} · {s.email || '—'}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
