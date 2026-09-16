import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { useCriteria, useScores, useUpsertScores, useCalcScore } from '../../hooks/useReviews';
import type { ReviewScore, ReviewCriteria } from '../../types';

interface Props {
  reviewId: string;
  supplierCategory: string;
  locked: boolean;
}

export function ScoringTab({ reviewId, supplierCategory, locked }: Props) {
  const { t, i18n } = useTranslation();
  const { data: criteria = [] } = useCriteria(supplierCategory);
  const { data: existingScores = [] } = useScores(reviewId);
  const upsertScores = useUpsertScores();
  const calcScore = useCalcScore();

  const [scores, setScores] = useState<Record<string, { final_score: number | null; override_comment: string }>>({});
  const [calcResult, setCalcResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const map: typeof scores = {};
    existingScores.forEach(s => {
      map[s.criterion_id] = { final_score: s.final_score, override_comment: s.override_comment ?? '' };
    });
    setScores(map);
  }, [existingScores]);

  const setScore = (criterionId: string, field: string, value: unknown) => {
    setScores(prev => ({
      ...prev,
      [criterionId]: { ...prev[criterionId], [field]: value },
    }));
  };

  const handleSave = async () => {
    const toUpsert: Partial<ReviewScore>[] = criteria.map(c => ({
      review_id: reviewId,
      criterion_id: c.id,
      final_score: scores[c.id]?.final_score ?? null,
      override_comment: scores[c.id]?.override_comment || null,
      weight_snapshot: c.weight,
    }));
    await upsertScores.mutateAsync(toUpsert);
  };

  const handleCalc = async () => {
    const result = await calcScore.mutateAsync(reviewId);
    setCalcResult(result);
  };

  const nameKey = i18n.language === 'th' ? 'name_th' : 'name_en';

  const safetyGroup = criteria.filter(c => c.criterion_group === 'SAFETY_QUALITY');
  const commercialGroup = criteria.filter(c => c.criterion_group === 'COMMERCIAL');

  const renderGroup = (label: string, items: ReviewCriteria[]) => (
    <Card key={label}>
      <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Criterion</TableHead>
              <TableHead className="w-[15%]">Weight</TableHead>
              <TableHead className="w-[15%]">Score (0-{items[0]?.scale_max ?? 5})</TableHead>
              <TableHead>Comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-medium">{c[nameKey]}</div>
                  {c.score_descriptors && c.score_descriptors.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.score_descriptors.map(d => `${d.score}: ${d.label}`).join(' | ')}
                    </div>
                  )}
                </TableCell>
                <TableCell>{(c.weight * 100).toFixed(0)}%</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={c.scale_max}
                    step={1}
                    className="w-20"
                    value={scores[c.id]?.final_score ?? ''}
                    onChange={e => setScore(c.id, 'final_score', e.target.value === '' ? null : Number(e.target.value))}
                    disabled={locked}
                  />
                </TableCell>
                <TableCell>
                  <Textarea
                    rows={1}
                    className="min-h-[2rem]"
                    value={scores[c.id]?.override_comment ?? ''}
                    onChange={e => setScore(c.id, 'override_comment', e.target.value)}
                    disabled={locked}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={locked || upsertScores.isPending}>
          {upsertScores.isPending ? 'Saving...' : t('common.save')}
        </Button>
        <Button variant="outline" onClick={handleCalc} disabled={locked || calcScore.isPending}>
          {calcScore.isPending ? 'Calculating...' : 'Calculate Score'}
        </Button>
      </div>

      {calcResult && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Label className="text-muted-foreground">Total Score</Label>
                <p className="text-2xl font-bold">{((calcResult as any)?.total_score ?? 0).toFixed(1)}%</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Safety/Quality</Label>
                <p className="text-lg">{((calcResult as any)?.safety_score ?? 0).toFixed(1)}%</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Commercial</Label>
                <p className="text-lg">{((calcResult as any)?.commercial_score ?? 0).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {safetyGroup.length > 0 && renderGroup('Safety & Quality (≥60% weight — BRCGS 3.5.1.3)', safetyGroup)}
      {commercialGroup.length > 0 && renderGroup('Commercial', commercialGroup)}
    </div>
  );
}
