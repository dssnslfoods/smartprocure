import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n';
import { useReviews, useReviewStatuses, useSuppliers } from '../../hooks/useReviews';
import { StatusBadge, GradeBadge } from '../shared';
import type { DashboardStats, SupplierReview } from '../../types';

interface Props {
  onOpenReview: (id: string) => void;
  onNewReview: () => void;
}

type FilterKey = 'overdue' | 'due7' | 'due30' | 'due60' | 'dueThisMonth' | null;

export function ReviewDashboard({ onOpenReview, onNewReview }: Props) {
  const { t } = useTranslation();
  const { data: reviews = [], isLoading } = useReviews();
  const { data: statuses = [] } = useReviewStatuses();
  const { data: suppliers = [] } = useSuppliers();
  const [filter, setFilter] = useState<FilterKey>(null);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach(s => m.set(s.id, s.company_name ?? s.supplier_code ?? s.id.slice(0, 8)));
    return m;
  }, [suppliers]);

  const stats = useMemo<DashboardStats>(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    // P0-12: Include ALL reviews (including DRAFT) for dashboard stats
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
    // P0-12: Show '—' when planned = 0 (handle in display, not here)
    const compliance = planned > 0 ? (completed / planned) * 100 : -1;

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

  const filterSets = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const filterFn = (key: FilterKey): SupplierReview[] => {
      return reviews.filter(r => {
        if (!r.due_date || r.status === 'APPROVED') return false;
        const due = new Date(r.due_date);
        const diff = (due.getTime() - now.getTime()) / 86400000;
        switch (key) {
          case 'overdue': return due < now;
          case 'due7': return diff >= 0 && diff <= 7;
          case 'due30': return diff >= 0 && diff <= 30;
          case 'due60': return diff >= 0 && diff <= 60;
          case 'dueThisMonth': return due.getMonth() === thisMonth && due.getFullYear() === thisYear;
          default: return false;
        }
      });
    };
    return { overdue: filterFn('overdue'), due7: filterFn('due7'), due30: filterFn('due30'), due60: filterFn('due60'), dueThisMonth: filterFn('dueThisMonth') };
  }, [reviews]);

  const summaryCards: { label: string; value: string | number; color: string; filterKey?: FilterKey }[] = [
    { label: t('spr.dashboard_cards.overdue'), value: stats.overdue, color: 'text-red-600', filterKey: 'overdue' },
    { label: t('spr.dashboard_cards.due7'), value: stats.due_7_days, color: 'text-orange-600', filterKey: 'due7' },
    { label: t('spr.dashboard_cards.due30'), value: stats.due_30_days, color: 'text-yellow-600', filterKey: 'due30' },
    { label: t('spr.dashboard_cards.due60'), value: stats.due_60_days, color: 'text-blue-600', filterKey: 'due60' },
    { label: t('spr.dashboard_cards.completed'), value: stats.completed_this_year, color: 'text-green-600' },
    { label: t('spr.dashboard_cards.compliance'), value: stats.compliance_pct < 0 ? '—' : `${stats.compliance_pct.toFixed(0)}%`, color: 'text-green-700' },
    { label: t('spr.dashboard_cards.suspended'), value: stats.suspended_count, color: 'text-red-700' },
    { label: t('spr.dashboard_cards.conditional'), value: stats.conditional_count, color: 'text-yellow-700' },
  ];

  const filteredReviews = filter && filterSets[filter] ? filterSets[filter] : null;
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
          <Card
            key={c.label}
            className={`${c.filterKey ? 'cursor-pointer hover:ring-2 hover:ring-primary/50 transition-shadow' : ''} ${filter === c.filterKey ? 'ring-2 ring-primary' : ''}`}
            onClick={() => c.filterKey && setFilter(prev => prev === c.filterKey ? null : c.filterKey!)}
          >
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

      {/* Filtered list when a card is clicked */}
      {filteredReviews && (
        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">
                {summaryCards.find(c => c.filterKey === filter)?.label} ({filteredReviews.length})
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setFilter(null)}>Clear</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('spr.dashboard_cards.supplier')}</TableHead>
                  <TableHead>{t('spr.dashboard_cards.statusCol')}</TableHead>
                  <TableHead>{t('spr.dashboard_cards.dueDate')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReviews.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{supplierMap.get(r.supplier_id) ?? r.supplier_id.slice(0, 8)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>{r.due_date ?? '—'}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => onOpenReview(r.id)}>{t('spr.dashboard_cards.open')}</Button></TableCell>
                  </TableRow>
                ))}
                {filteredReviews.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t('spr.dashboard_cards.noReviews')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Due this month */}
      {!filter && filterSets.dueThisMonth.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Due This Month <Badge variant="outline">{filterSets.dueThisMonth.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filterSets.dueThisMonth.map(r => (
                <div key={r.id} className="flex items-center justify-between border rounded px-3 py-2">
                  <div>
                    <span className="font-medium">{supplierMap.get(r.supplier_id) ?? r.supplier_id.slice(0, 8)}</span>
                    <span className="text-sm text-muted-foreground ml-2">{r.due_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <Button size="sm" variant="ghost" onClick={() => onOpenReview(r.id)}>{t('spr.dashboard_cards.open')}</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t('spr.dashboard_cards.recentReviews')}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('spr.dashboard_cards.supplier')}</TableHead>
                <TableHead>{t('spr.dashboard_cards.year')}</TableHead>
                <TableHead>{t('spr.dashboard_cards.statusCol')}</TableHead>
                <TableHead>{t('spr.dashboard_cards.grade')}</TableHead>
                <TableHead>{t('spr.dashboard_cards.dueDate')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map(r => (
                <TableRow key={r.id}>
                  {/* P0-12: Show supplier name, not UUID */}
                  <TableCell>{supplierMap.get(r.supplier_id) ?? r.supplier_id.slice(0, 8)}</TableCell>
                  <TableCell>{r.review_year}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{r.grade ? <GradeBadge grade={r.grade} score={r.final_score} /> : '—'}</TableCell>
                  <TableCell>{r.due_date ?? '—'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => onOpenReview(r.id)}>{t('spr.dashboard_cards.open')}</Button>
                  </TableCell>
                </TableRow>
              ))}
              {recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t('spr.dashboard_cards.noReviews')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
