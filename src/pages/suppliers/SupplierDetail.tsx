import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, CheckCircle, XCircle, Send, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import SupplierContacts from './SupplierContacts';
import SupplierDocuments from './SupplierDocuments';
import SupplierESG from './SupplierESG';
import SupplierItems from './SupplierItems';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/10 text-blue-600',
  review: 'bg-amber-500/10 text-amber-600',
  approved: 'bg-emerald-500/10 text-emerald-600',
  rejected: 'bg-destructive/10 text-destructive',
  suspended: 'bg-muted text-muted-foreground',
};

const statusTransitions: Record<string, { next: string; label: string; icon: any }[]> = {
  draft: [{ next: 'submitted', label: 'Submit for Review', icon: Send }],
  submitted: [{ next: 'review', label: 'Start Review', icon: Eye }],
  review: [
    { next: 'approved', label: 'Approve', icon: CheckCircle },
    { next: 'rejected', label: 'Reject', icon: XCircle },
  ],
  rejected: [{ next: 'draft', label: 'Return to Draft', icon: ArrowLeft }],
};

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchSupplier = async () => {
    if (!id) return;
    const { data } = await supabase.from('suppliers').select('*').eq('id', id).single();
    if (data) setSupplier(data);
    setLoading(false);
  };

  useEffect(() => { fetchSupplier(); }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (!id) return;
    const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'approved') {
      updates.approved_by = user?.id;
      updates.approved_at = new Date().toISOString();
    }
    const { error } = await supabase.from('suppliers').update(updates).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Status Updated', description: `Supplier moved to ${newStatus}` });
      fetchSupplier();
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!supplier) return <div className="text-center py-16 text-muted-foreground">Supplier not found</div>;

  const transitions = statusTransitions[supplier.status] || [];
  const canChangeStatus = hasRole('admin') || hasRole('procurement_officer') || hasRole('approver');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/suppliers">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{supplier.company_name}</h1>
              <Badge variant="secondary" className={statusColors[supplier.status] || ''}>
                {supplier.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{supplier.email || 'No email'} · {supplier.city || ''}{supplier.country ? `, ${supplier.country}` : ''}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canChangeStatus && transitions.map((t) => (
            <Button key={t.next} variant={t.next === 'rejected' ? 'destructive' : 'default'} size="sm" onClick={() => handleStatusChange(t.next)}>
              <t.icon className="w-4 h-4 mr-1" />{t.label}
            </Button>
          ))}
          {(hasRole('admin') || hasRole('procurement_officer')) && (
            <Link to={`/suppliers/${id}/edit`}>
              <Button variant="outline" size="sm"><Edit className="w-4 h-4 mr-1" />Edit</Button>
            </Link>
          )}
        </div>
      </div>

      {/* ABC-XYZ Classification Card */}
      {(supplier.abc_class || supplier.priority_score) && (
        <Card className={cn(
          'border-2',
          (supplier.priority_score ?? 0) >= 7 ? 'border-red-200 bg-red-50/40' :
          (supplier.priority_score ?? 0) >= 4 ? 'border-amber-200 bg-amber-50/40' :
          'border-emerald-200 bg-emerald-50/40'
        )}>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">ABC-XYZ Class</p>
                <p className={cn('text-3xl font-bold font-mono',
                  (supplier.priority_score ?? 0) >= 7 ? 'text-red-700' :
                  (supplier.priority_score ?? 0) >= 4 ? 'text-amber-700' : 'text-emerald-700'
                )}>
                  {abcLetter(supplier.abc_class)}{xyzLetter(supplier.xyz_class)}
                </p>
              </div>
              <Divider />
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="text-2xl font-bold">P{supplier.priority_score ?? '—'}</p>
              </div>
              <Divider />
              <div>
                <p className="text-xs text-muted-foreground">Risk Level</p>
                <p className="text-base font-semibold">{supplier.risk_label || '—'}</p>
              </div>
              <Divider />
              <div>
                <p className="text-xs text-muted-foreground">Total Spend (2025)</p>
                <p className="text-xl font-bold">฿{(supplier.total_spend ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}</p>
              </div>
              <Divider />
              <div>
                <p className="text-xs text-muted-foreground">Items</p>
                <p className="text-xl font-bold">{supplier.num_items ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Information</TabsTrigger>
          <TabsTrigger value="items">Items / Price List</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="esg">ESG Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Company Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Company Name" value={supplier.company_name} />
                <Row label="Tax ID" value={supplier.tax_id} />
                <Row label="Email" value={supplier.email} />
                <Row label="Phone" value={supplier.phone} />
                <Row label="Website" value={supplier.website} />
                <Row label="Tier" value={supplier.tier?.replace(/_/g, ' ')} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Address & Notes</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Address" value={supplier.address} />
                <Row label="City" value={supplier.city} />
                <Row label="Country" value={supplier.country} />
                <Row label="Preferred" value={supplier.is_preferred ? 'Yes' : 'No'} />
                <Row label="Blacklisted" value={supplier.is_blacklisted ? 'Yes' : 'No'} />
                <Row label="Notes" value={supplier.notes} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="items">
          <SupplierItems supplierId={id!} />
        </TabsContent>

        <TabsContent value="contacts">
          <SupplierContacts supplierId={id!} />
        </TabsContent>

        <TabsContent value="documents">
          <SupplierDocuments supplierId={id!} />
        </TabsContent>

        <TabsContent value="esg">
          <SupplierESG supplierId={id!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function Divider() {
  return <span className="hidden sm:block w-px h-10 bg-border" />;
}

function abcLetter(n: number | null | undefined) {
  return n === 3 ? 'A' : n === 2 ? 'B' : n === 1 ? 'C' : '?';
}
function xyzLetter(n: number | null | undefined) {
  return n === 1 ? 'X' : n === 2 ? 'Y' : n === 3 ? 'Z' : '?';
}
