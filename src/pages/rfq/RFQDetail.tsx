import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Send, Lock, Award, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import RFQInviteSuppliers from './RFQInviteSuppliers';
import RFQQuotations from './RFQQuotations';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-blue-500/10 text-blue-600',
  closed: 'bg-muted text-muted-foreground',
  evaluation: 'bg-amber-500/10 text-amber-600',
  awarded: 'bg-emerald-500/10 text-emerald-600',
};

const statusTransitions: Record<string, { next: string; label: string; icon: any }[]> = {
  draft: [{ next: 'published', label: 'Publish RFQ', icon: Send }],
  published: [{ next: 'closed', label: 'Close Submissions', icon: Lock }],
  closed: [{ next: 'evaluation', label: 'Start Evaluation', icon: Eye }],
  evaluation: [{ next: 'awarded', label: 'Mark Awarded', icon: Award }],
};

export default function RFQDetail() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [rfq, setRfq] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [invitedCount, setInvitedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!id) return;
    const [rfqRes, itemsRes, invRes] = await Promise.all([
      supabase.from('rfqs').select('*').eq('id', id).single(),
      supabase.from('rfq_items').select('*').eq('rfq_id', id).order('created_at'),
      supabase.from('rfq_suppliers').select('id').eq('rfq_id', id),
    ]);
    if (rfqRes.data) setRfq(rfqRes.data);
    if (itemsRes.data) setItems(itemsRes.data);
    setInvitedCount(invRes.data?.length || 0);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    if (newStatus === 'published' && invitedCount === 0) {
      toast({ title: 'Cannot publish', description: 'Invite at least one supplier first', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('rfqs').update({ status: newStatus as any, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status updated', description: `RFQ moved to ${newStatus}` });
      fetchData();
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!rfq) return <div className="text-center py-16 text-muted-foreground">RFQ not found</div>;

  const transitions = statusTransitions[rfq.status] || [];
  const canManage = hasRole('admin') || hasRole('procurement_officer');

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
        <div className="flex gap-2 flex-wrap">
          {canManage && transitions.map(t => (
            <Button key={t.next} size="sm" onClick={() => handleStatusChange(t.next)}>
              <t.icon className="w-4 h-4 mr-1" />{t.label}
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details">Details & Items</TabsTrigger>
          <TabsTrigger value="suppliers">Invited Suppliers ({invitedCount})</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
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
          </div>
        </TabsContent>

        <TabsContent value="suppliers">
          <RFQInviteSuppliers rfqId={id!} rfqStatus={rfq.status} onUpdate={fetchData} />
        </TabsContent>

        <TabsContent value="quotations">
          <RFQQuotations rfqId={id!} rfqItems={items} />
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
