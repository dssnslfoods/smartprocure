import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n';
import { useReviews, useReviewStatuses } from '../../hooks/useReviews';
import { StatusBadge, GradeBadge } from '../shared';
import type { DashboardStats } from '../../types';

interface Props {
  onOpenReview: (id: string) => void;
  onNewReview: () => void;
}

export function ReviewDashboard({ onOpenReview, onNewReview }: Props) {
  const { t } = useTranslation();
  const { data: reviews = [], isLoading } = useReviews();
  const { data: statuses = [] } = useReviewStatuses();

  const stats = useMemo<DashboardStats>(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const yearReviews = reviews.filter(r => r.review_year === thisYear);

    const dueIn = (days: number) => reviews.filter(r => {
      if (!r.due_date || r.status === 'APPROVED') return false;
      const diff = (new Date(r.due_date).getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= days;
    }).length;

    const overdue = reviews.filter(r => {
      if (!r.due_date || r.status === 'APPROVED') return false;
      return new Date(r.due_date) < now;
    }).length;

    const completed = yearReviews.filter(r => r.status === 'APPROVED').length;
    const planned = yearReviews.length;
    const compliance = planned > 0 ? (completed / planned) * 100 : 0;

    const gradeDist: Record<string, number> = {};
    statuses.forEach(s => { if (s.grade) gradeDist[s.grade] = (gradeDist[s.grade] ?? 0) + 1; });

    return {
      due_60_days: dueIn(60),
      due_30_days: dueIn(30),
      due_7_days: dueIn(7),
      overdue,
      completed_this_year: completed,
      planned_this_year: planned,
      compliance_pct: compliance,
      grade_distribution: gradeDist,
      suspended_count: statuses.filter(s => s.outcome === 'Suspended').length,
      conditional_count: statuses.filter(s => s.outcome === 'Conditionally Approved').length,
    };
  }, [reviews, statuses]);

  const summaryCards = [
    { label: t('spr.dashboard_cards.overdue'), value: stats.overdue, color: 'text-red-600' },
    { label: t('spr.dashboard_cards.due7'), value: stats.due_7_days, color: 'text-orange-600' },
    { label: t('spr.dashboard_cards.due30'), value: stats.due_30_days, color: 'text-yellow-600' },
    { label: t('spr.dashboard_cards.due60'), value: stats.due_60_days, color: 'text-blue-600' },
    { label: t('spr.dashboard_cards.completed'), value: stats.completed_this_year, color: 'text-green-600' },
    { label: t('spr.dashboard_cards.compliance'), value: `${stats.compliance_pct.toFixed(0)}%`, color: 'text-green-700' },
    { label: t('spr.dashboard_cards.suspended'), value: stats.suspended_count, color: 'text-red-700' },
    { label: t('spr.dashboard_cards.conditional'), value: stats.conditional_count, color: 'text-yellow-700' },
  ];

  const recent = reviews.slice(0, 20);

  if (isLoading) return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-4 text-center"><Skeleton className="h-10 w-16 mx-auto" /><Skeleton className="h-4 w-24 mx-auto mt-2" /></CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="pt-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t('spr.dashboard')}</h2>
        <Button onClick={onNewReview}>{t('spr.newReview')}</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryCards.map(c => (
          <Card key={c.label}>
            <CardContent className="pt-4 text-center">
              <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['A', 'B', 'C', 'D'].map(g => (
          <Card key={g}>
            <CardContent className="pt-4 text-center">
              <GradeBadge grade={g} />
              <p className="text-2xl font-bold mt-2">{stats.grade_distribution[g] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Reviews</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.supplier_id}</TableCell>
                  <TableCell>{r.review_year}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{r.grade ? <GradeBadge grade={r.grade} score={r.final_score} /> : '—'}</TableCell>
                  <TableCell>{r.due_date ?? '—'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => onOpenReview(r.id)}>Open</Button>
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
