import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { useReviews, useReviewStatuses, useSuppliers, useCreateReview } from '../hooks/useReviews';
import { StatusBadge, GradeBadge } from '../components/shared';

export default function CampaignPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: reviews = [] } = useReviews();
  const { data: statuses = [] } = useReviewStatuses();
  const { data: suppliers = [] } = useSuppliers();
  const createReview = useCreateReview();

  const [campaignYear, setCampaignYear] = useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const yearReviews = useMemo(() => reviews.filter(r => r.review_year === campaignYear), [reviews, campaignYear]);

  const suppliersWithStatus = useMemo(() => {
    const statusMap = new Map(statuses.map(s => [s.supplier_id, s]));
    const reviewMap = new Map<string, typeof yearReviews>();
    yearReviews.forEach(r => {
      const list = reviewMap.get(r.supplier_id) ?? [];
      list.push(r);
      reviewMap.set(r.supplier_id, list);
    });

    return suppliers.map(s => ({
      ...s,
      reviewStatus: statusMap.get(s.id),
      yearReviews: reviewMap.get(s.id) ?? [],
      latestReview: (reviewMap.get(s.id) ?? []).sort((a, b) => b.revision_no - a.revision_no)[0] ?? null,
    }));
  }, [suppliers, statuses, yearReviews]);

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return suppliersWithStatus;
    if (filterStatus === 'no_review') return suppliersWithStatus.filter(s => s.yearReviews.length === 0);
    return suppliersWithStatus.filter(s => s.latestReview?.status === filterStatus);
  }, [suppliersWithStatus, filterStatus]);

  const totalSuppliers = suppliersWithStatus.length;
  const reviewed = suppliersWithStatus.filter(s => s.latestReview?.status === 'APPROVED').length;
  const inProgress = suppliersWithStatus.filter(s => s.latestReview && s.latestReview.status !== 'APPROVED').length;
  const notStarted = suppliersWithStatus.filter(s => s.yearReviews.length === 0).length;
  const progressPct = totalSuppliers > 0 ? (reviewed / totalSuppliers) * 100 : 0;

  const handleBulkCreate = async () => {
    const toCreate = suppliersWithStatus.filter(s => s.yearReviews.length === 0);
    for (const s of toCreate) {
      await createReview.mutateAsync({
        supplier_id: s.id,
        review_year: campaignYear,
        period_start: `${campaignYear - 1}-01-01`,
        period_end: `${campaignYear - 1}-12-31`,
        risk_level_at_review: s.risk_level,
        supplier_category: s.category ?? 'rm_primary_pk',
        status: 'DRAFT',
        revision_no: 1,
        locked: false,
        knockout_failed: false,
        risk_adjusted: false,
        created_by: user?.id ?? null,
      });
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t('spr.campaign')}</h2>
        <div className="flex items-center gap-3">
          <Label>Year</Label>
          <Input type="number" className="w-24" value={campaignYear} onChange={e => setCampaignYear(Number(e.target.value))} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold">{totalSuppliers}</p>
            <p className="text-sm text-muted-foreground">Total Suppliers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-green-600">{reviewed}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{inProgress}</p>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-gray-500">{notStarted}</p>
            <p className="text-sm text-muted-foreground">Not Started</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Campaign Progress</span>
            <Progress value={progressPct} className="flex-1" />
            <span className="text-sm font-medium">{progressPct.toFixed(0)}%</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="no_review">Not Started</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="RETURNED">Returned</SelectItem>
          </SelectContent>
        </Select>

        {notStarted > 0 && (
          <Button variant="outline" onClick={handleBulkCreate} disabled={createReview.isPending}>
            {createReview.isPending ? 'Creating...' : `Create ${notStarted} Draft Reviews`}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Supplier Review Status — {campaignYear}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Last Grade</TableHead>
                <TableHead>Review Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.company_name}</div>
                    <div className="text-xs text-muted-foreground">{s.supplier_code}</div>
                  </TableCell>
                  <TableCell className="capitalize">{s.risk_level}</TableCell>
                  <TableCell>
                    {s.reviewStatus?.grade ? <GradeBadge grade={s.reviewStatus.grade} /> : '—'}
                  </TableCell>
                  <TableCell>
                    {s.latestReview ? <StatusBadge status={s.latestReview.status} /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{s.latestReview?.due_date ?? s.reviewStatus?.next_review_due_date ?? '—'}</TableCell>
                  <TableCell>
                    {s.latestReview ? (
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/supplier-review/review/${s.latestReview!.id}`)}>Open</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => navigate(`/supplier-review/new?supplier=${s.id}`)}>Create</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
