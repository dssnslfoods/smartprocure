import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  const weightSummary = useMemo(() => {
    const safety = criteria.filter(c => c.criterion_group === 'SAFETY_QUALITY').reduce((s, c) => s + c.weight, 0);
    const commercial = criteria.filter(c => c.criterion_group === 'COMMERCIAL').reduce((s, c) => s + c.weight, 0);
    return { safety, commercial, total: safety + commercial };
  }, [criteria]);

  const renderGroup = (label: string, items: ReviewCriteria[]) => (
    <Card key={label}>
      <CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">{t('spr.scoring.criterion')}</TableHead>
              <TableHead className="w-[10%]">{t('spr.scoring.tags')}</TableHead>
              <TableHead className="w-[8%]">{t('spr.scoring.weight')}</TableHead>
              <TableHead className="w-[12%]">{t('spr.scoring.autoScore')}</TableHead>
              <TableHead className="w-[15%]">{t('spr.scoring.finalScore')}</TableHead>
              <TableHead>{t('spr.scoring.comment')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(c => {
              const existingScore = existingScores.find(s => s.criterion_id === c.id);
              const autoScore = existingScore?.auto_score;
              const finalScore = scores[c.id]?.final_score;
              const scoreOptions = Array.from({ length: c.scale_max + 1 }, (_, i) => i);
              const descriptor = c.score_descriptors?.find(d => d.score === finalScore);

              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c[nameKey]}</div>
                    {c.score_descriptors && c.score_descriptors.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {c.score_descriptors.map(d => `${d.score}: ${d.label}`).join(' | ')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.bsaq_tags ?? []).map(tag => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0 uppercase">
                          {tag.charAt(0).toUpperCase()}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{c.weight}%</TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {autoScore != null ? `${autoScore}/${c.scale_max}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={finalScore != null ? String(finalScore) : ''}
                      onValueChange={v => setScore(c.id, 'final_score', v === '' ? null : Number(v))}
                      disabled={locked}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {scoreOptions.map(s => {
                          const desc = c.score_descriptors?.find(d => d.score === s);
                          return (
                            <SelectItem key={s} value={String(s)}>
                              {s} {desc ? `— ${desc.label}` : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {descriptor && (
                      <div className="text-xs text-muted-foreground mt-1">{descriptor.label}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Textarea
                      rows={1}
                      className="min-h-[2rem]"
                      placeholder={autoScore != null && finalScore != null && finalScore !== autoScore ? t('spr.scoring.commentRequired') : ''}
                      value={scores[c.id]?.override_comment ?? ''}
                      onChange={e => setScore(c.id, 'override_comment', e.target.value)}
                      disabled={locked}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Weight summary bar — P0-2 */}
      <Card className="border-slate-200">
        <CardContent className="pt-4">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Safety & Quality:</span>
              <span className={`font-bold ${weightSummary.safety >= 60 ? 'text-green-700' : 'text-red-600'}`}>
                {weightSummary.safety}%
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Commercial:</span>
              <span className="font-bold">{weightSummary.commercial}%</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('spr.scoring.total')}:</span>
              <span className={`font-bold ${weightSummary.total === 100 ? 'text-green-700' : 'text-red-600'}`}>
                {weightSummary.total}%
              </span>
            </div>
            {weightSummary.total !== 100 && (
              <Badge className="bg-red-100 text-red-700">{t('spr.scoring.weightError')}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={locked || upsertScores.isPending}>
          {upsertScores.isPending ? t('spr.scoring.saving') : t('spr.scoring.save')}
        </Button>
        <Button variant="outline" onClick={handleCalc} disabled={locked || calcScore.isPending}>
          {calcScore.isPending ? t('spr.scoring.calculating') : t('spr.scoring.calculate')}
        </Button>
      </div>

      {/* Sticky result panel — P1-1 */}
      {calcResult && (
        <Card className="border-blue-200 bg-blue-50 sticky top-0 z-10">
          <CardContent className="pt-4">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <Label className="text-muted-foreground">{t('spr.scoring.totalScore')}</Label>
                <p className="text-2xl font-bold">{((calcResult as any)?.final_score ?? 0).toFixed(1)}%</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Safety/Quality</Label>
                <p className="text-lg">{((calcResult as any)?.safety_score ?? 0).toFixed(1)}%</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Commercial</Label>
                <p className="text-lg">{((calcResult as any)?.commercial_score ?? 0).toFixed(1)}%</p>
              </div>
              <div>
                <Label className="text-muted-foreground">{t('spr.scoring.provisionalGrade')}</Label>
                <p className="text-lg font-bold">
                  {((calcResult as any)?.final_score ?? 0) >= 85 ? 'A'
                    : ((calcResult as any)?.final_score ?? 0) >= 70 ? 'B'
                    : ((calcResult as any)?.final_score ?? 0) >= 50 ? 'C' : 'D'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {safetyGroup.length > 0 && renderGroup('Safety & Quality (≥60% — BRCGS 3.5.1.3)', safetyGroup)}
      {commercialGroup.length > 0 && renderGroup('Commercial', commercialGroup)}
    </div>
  );
}
