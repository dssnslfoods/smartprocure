import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { useReviewStatuses } from '../hooks/useReviews';
import { GradeBadge } from '../components/shared';

export default function ReviewStatusListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: statuses = [], isLoading } = useReviewStatuses();

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="container mx-auto py-6 px-4">
      <h2 className="text-2xl font-bold mb-6">{t('spr.asl')}</h2>

      <Card>
        <CardHeader><CardTitle>Approved Supplier Review Status</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier ID</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Next Review Due</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map(s => (
                <TableRow key={s.supplier_id}>
                  <TableCell>{s.supplier_id}</TableCell>
                  <TableCell className="capitalize">{s.risk_level ?? '—'}</TableCell>
                  <TableCell>{s.grade ? <GradeBadge grade={s.grade} /> : '—'}</TableCell>
                  <TableCell>{s.outcome ?? '—'}</TableCell>
                  <TableCell>{s.next_review_due_date ?? '—'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/supplier-review/history/${s.supplier_id}`)}>
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {statuses.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No review statuses</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
