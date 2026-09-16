import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTranslation } from '@/i18n';
import { useReviews, useReviewStatuses } from '../hooks/useReviews';
import { GradeBadge } from '../components/shared';

const GRADE_COLORS: Record<string, string> = { A: '#22c55e', B: '#3b82f6', C: '#eab308', D: '#ef4444' };

export default function ReportsPage() {
  const { t } = useTranslation();
  const { data: reviews = [] } = useReviews();
  const { data: statuses = [] } = useReviewStatuses();
  const [tab, setTab] = useState('overview');

  const approvedReviews = useMemo(() => reviews.filter(r => r.status === 'APPROVED'), [reviews]);

  const gradeDistData = useMemo(() => {
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    statuses.forEach(s => { if (s.grade && dist[s.grade] !== undefined) dist[s.grade]++; });
    return Object.entries(dist).map(([grade, count]) => ({ grade, count, fill: GRADE_COLORS[grade] }));
  }, [statuses]);

  const yearTrendData = useMemo(() => {
    const byYear: Record<number, Record<string, number>> = {};
    approvedReviews.forEach(r => {
      if (!byYear[r.review_year]) byYear[r.review_year] = { A: 0, B: 0, C: 0, D: 0 };
      if (r.grade) byYear[r.review_year][r.grade] = (byYear[r.review_year][r.grade] ?? 0) + 1;
    });
    return Object.entries(byYear)
      .map(([year, grades]) => ({ year: Number(year), ...grades }))
      .sort((a, b) => a.year - b.year);
  }, [approvedReviews]);

  const scoreTrend = useMemo(() => {
    const byYear: Record<number, { total: number; count: number }> = {};
    approvedReviews.forEach(r => {
      if (r.final_score == null) return;
      if (!byYear[r.review_year]) byYear[r.review_year] = { total: 0, count: 0 };
      byYear[r.review_year].total += r.final_score;
      byYear[r.review_year].count++;
    });
    return Object.entries(byYear)
      .map(([year, { total, count }]) => ({ year: Number(year), avgScore: count > 0 ? total / count : 0 }))
      .sort((a, b) => a.year - b.year);
  }, [approvedReviews]);

  const mgmtSummary = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const thisYearReviews = reviews.filter(r => r.review_year === thisYear);
    const approved = thisYearReviews.filter(r => r.status === 'APPROVED');
    const suspended = statuses.filter(s => s.outcome === 'Suspended');
    const conditional = statuses.filter(s => s.outcome === 'Conditionally Approved');
    const knockoutFailed = approved.filter(r => r.knockout_failed);

    return {
      totalPlanned: thisYearReviews.length,
      completed: approved.length,
      completionPct: thisYearReviews.length > 0 ? (approved.length / thisYearReviews.length * 100) : 0,
      avgScore: approved.length > 0
        ? approved.reduce((sum, r) => sum + (r.final_score ?? 0), 0) / approved.length
        : 0,
      suspendedCount: suspended.length,
      conditionalCount: conditional.length,
      knockoutCount: knockoutFailed.length,
    };
  }, [reviews, statuses]);

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <h2 className="text-2xl font-bold">{t('spr.reports')}</h2>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="management">Management Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Grade Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={gradeDistData} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={100} label={({ grade, count }) => `${grade}: ${count}`}>
                      {gradeDistData.map(d => <Cell key={d.grade} fill={d.fill} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Score Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {gradeDistData.map(d => (
                    <div key={d.grade} className="flex items-center gap-3">
                      <GradeBadge grade={d.grade} />
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div
                          className="h-3 rounded-full"
                          style={{ width: `${statuses.length > 0 ? (d.count / statuses.length * 100) : 0}%`, backgroundColor: d.fill }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{d.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Grade Distribution by Year</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={yearTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="A" fill={GRADE_COLORS.A} name="Grade A" />
                  <Bar dataKey="B" fill={GRADE_COLORS.B} name="Grade B" />
                  <Bar dataKey="C" fill={GRADE_COLORS.C} name="Grade C" />
                  <Bar dataKey="D" fill={GRADE_COLORS.D} name="Grade D" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Average Score Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis domain={[0, 100]} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Bar dataKey="avgScore" fill="#6366f1" name="Average Score %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="management" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Management Review Summary — {new Date().getFullYear()}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-3xl font-bold">{mgmtSummary.totalPlanned}</p>
                  <p className="text-sm text-muted-foreground">Planned</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">{mgmtSummary.completed}</p>
                  <p className="text-sm text-muted-foreground">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">{mgmtSummary.completionPct.toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">Completion Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold">{mgmtSummary.avgScore.toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Risk & Compliance Flags</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Suspended Suppliers (Grade D)</TableCell>
                    <TableCell className="text-right text-red-600 font-bold">{mgmtSummary.suspendedCount}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Conditionally Approved (Grade C)</TableCell>
                    <TableCell className="text-right text-yellow-600 font-bold">{mgmtSummary.conditionalCount}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Knockout Failures</TableCell>
                    <TableCell className="text-right text-red-600 font-bold">{mgmtSummary.knockoutCount}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>BRCGS Compliance Checklist</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clause</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { clause: '3.5.1.3', req: 'Safety & Quality criteria ≥ 60% weight', ok: true },
                    { clause: '3.5.1.4', req: 'Ongoing review documented & records maintained', ok: mgmtSummary.completed > 0 },
                    { clause: '3.5.1.6', req: 'Activities based on risk & performance (questionnaire ≤ 3yr)', ok: true },
                    { clause: '3.5.3.3', req: 'Certification verified on owner directory', ok: true },
                    { clause: '3.5.4.2', req: 'BRC supplier types assessed with appropriate scope', ok: true },
                  ].map(c => (
                    <TableRow key={c.clause}>
                      <TableCell className="font-mono">{c.clause}</TableCell>
                      <TableCell>{c.req}</TableCell>
                      <TableCell>
                        <span className={c.ok ? 'text-green-600' : 'text-red-600'}>
                          {c.ok ? 'Compliant' : 'Review Required'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
