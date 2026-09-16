import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { useReviews, useStatusHistory } from '../hooks/useReviews';
import { StatusBadge, GradeBadge } from '../components/shared';

export default function SupplierHistoryPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: reviews = [] } = useReviews({ supplier_id: supplierId });
  const { data: history = [] } = useStatusHistory(supplierId ?? '');

  if (!supplierId) return <div className="p-8">Missing supplier ID</div>;

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={() => navigate('/supplier-review')}>← Back</Button>
        <h1 className="text-2xl font-bold">{t('spr.history')}</h1>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Review History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead>Rev</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.review_year}</TableCell>
                    <TableCell>{r.revision_no}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>{r.grade ? <GradeBadge grade={r.grade} score={r.final_score} /> : '—'}</TableCell>
                    <TableCell>{r.final_score?.toFixed(1) ?? '—'}</TableCell>
                    <TableCell>{r.approved_at ? new Date(r.approved_at).toLocaleDateString() : '—'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/supplier-review/review/${r.id}`)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Status Changes</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Old Status</TableHead>
                  <TableHead>New Status</TableHead>
                  <TableHead>Old Grade</TableHead>
                  <TableHead>New Grade</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(h => (
                  <TableRow key={h.id}>
                    <TableCell>{new Date(h.changed_at).toLocaleDateString()}</TableCell>
                    <TableCell>{h.old_status ?? '—'}</TableCell>
                    <TableCell>{h.new_status}</TableCell>
                    <TableCell>{h.old_grade ?? '—'}</TableCell>
                    <TableCell>{h.new_grade ?? '—'}</TableCell>
                    <TableCell>{h.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
