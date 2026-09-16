import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSuppliers, useCreateReview, useReviews } from '../hooks/useReviews';

export default function NewReviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: suppliers = [] } = useSuppliers();
  const createReview = useCreateReview();

  const currentYear = new Date().getFullYear();
  const [supplierId, setSupplierId] = useState(searchParams.get('supplier') ?? '');
  const [reviewYear, setReviewYear] = useState(currentYear);
  const [periodStart, setPeriodStart] = useState(`${currentYear}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');

  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  const { data: supplierReviews = [] } = useReviews(
    supplierId ? { supplier_id: supplierId, limit: 10 } : undefined
  );

  useEffect(() => {
    if (!supplierId || supplierReviews.length === 0) return;
    const lastApproved = supplierReviews
      .filter(r => r.status === 'APPROVED' && r.period_end)
      .sort((a, b) => (b.period_end ?? '').localeCompare(a.period_end ?? ''))[0];
    if (lastApproved?.period_end) {
      const nextDay = new Date(lastApproved.period_end);
      nextDay.setDate(nextDay.getDate() + 1);
      setPeriodStart(nextDay.toISOString().split('T')[0]);
    }
  }, [supplierId, supplierReviews]);

  const handleCreate = async () => {
    setError('');
    if (!supplierId) {
      setError('กรุณาเลือกผู้จัดจำหน่าย');
      return;
    }
    if (!periodStart || !periodEnd) {
      setError('กรุณาระบุช่วงเวลาที่ทบทวน');
      return;
    }
    try {
      const review = await createReview.mutateAsync({
        supplier_id: supplierId,
        review_year: reviewYear,
        period_start: periodStart,
        period_end: periodEnd,
        risk_level_at_review: selectedSupplier?.risk_level ?? null,
        supplier_category: selectedSupplier?.category ?? 'rm_primary_pk',
        status: 'DRAFT',
        revision_no: 1,
        locked: false,
        knockout_failed: false,
        risk_adjusted: false,
        created_by: user?.id ?? null,
      });
      toast({ title: 'สร้างการทบทวนสำเร็จ', description: `สถานะ: DRAFT` });
      navigate(`/supplier-review/review/${review.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถสร้างการทบทวนได้';
      setError(msg);
      toast({ title: 'เกิดข้อผิดพลาด', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => navigate('/supplier-review')}>← Back</Button>
        <h1 className="text-2xl font-bold">{t('spr.newReview')}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Create Supplier Review</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setError(''); }}>
              <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.company_name} {s.supplier_code ? `(${s.supplier_code})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSupplier && (
            <div className="grid grid-cols-2 gap-3 text-sm p-3 bg-muted rounded">
              <div><span className="text-muted-foreground">Risk: </span>{selectedSupplier.risk_level}</div>
              <div><span className="text-muted-foreground">BRC Grade: </span>{selectedSupplier.brc_grade ?? '—'}</div>
              <div><span className="text-muted-foreground">Category: </span>{selectedSupplier.category ?? '—'}</div>
              <div><span className="text-muted-foreground">Status: </span>{selectedSupplier.status}</div>
            </div>
          )}

          <div>
            <Label>Review Year</Label>
            <Input type="number" value={reviewYear} onChange={e => {
              const y = Number(e.target.value);
              setReviewYear(y);
              setPeriodStart(`${y}-01-01`);
              setPeriodEnd(`${y}-12-31`);
            }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Period Start</Label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>Period End</Label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          <Button
            onClick={handleCreate}
            disabled={createReview.isPending}
            className="w-full"
          >
            {createReview.isPending ? 'Creating...' : 'Create Review'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
