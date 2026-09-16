import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/i18n';
import { useCriteria, useScores, useUpsertScores, useCalcScore } from '../../hooks/useReviews';
import type { ReviewScore, ReviewCriteria } from '../../types';

interface Props {
  reviewId: string;
  supplierCategory: string;
  locked: boolean;
}

const TAG_CONFIG: Record<string, { color: string; key: string }> = {
  safety:       { color: 'bg-red-100 text-red-700 border-red-300', key: 'tagSafety' },
  quality:      { color: 'bg-blue-100 text-blue-700 border-blue-300', key: 'tagQuality' },
  legality:     { color: 'bg-purple-100 text-purple-700 border-purple-300', key: 'tagLegality' },
  authenticity: { color: 'bg-amber-100 text-amber-700 border-amber-300', key: 'tagAuthenticity' },
  commercial:   { color: 'bg-green-100 text-green-700 border-green-300', key: 'tagCommercial' },
};

export function ScoringTab({ reviewId, supplierCategory, locked }: Props) {
  const { t, i18n } = useTranslation();
  const { data: criteria = [] } = useCriteria(supplierCategory);
  const { data: existingScores = [] } = useScores(reviewId);
  const upsertScores = useUpsertScores();
  const calcScore = useCalcScore();

  const [scores, setScores] = useState<Record<string, { final_score: number | null; override_comment: string }>>({});
  const [calcResult, setCalcResult] = useState<Record<string, unknown> | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const map: typeof scores = {};
    existingScores.forEach(s => {
      map[s.criterion_id] = { final_score: s.final_score, override_comment: s.override_comment ?? '' };
    });
    setScores(map);
    setDirty(false);
  }, [existingScores]);

  const setScore = (criterionId: string, field: string, value: unknown) => {
    setDirty(true);
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
    setLastSaved(new Date());
    setDirty(false);
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

  const weightInvalid = weightSummary.total !== 100 || weightSummary.safety < 60;

  const scoredCount = useMemo(() => {
    return criteria.filter(c => scores[c.id]?.final_score != null).length;
  }, [criteria, scores]);

  const bsaqCoverage = useMemo(() => {
    const allTags = new Set<string>();
    criteria.forEach(c => (c.bsaq_tags ?? []).forEach(tag => allTags.add(tag.toLowerCase())));
    const required = ['safety', 'quality', 'legality', 'authenticity'];
    return { covered: required.filter(r => allTags.has(r)), missing: required.filter(r => !allTags.has(r)) };
  }, [criteria]);

  const overrideErrors = useMemo(() => {
    const errors: string[] = [];
    criteria.forEach(c => {
      const existing = existingScores.find(s => s.criterion_id === c.id);
      const autoScore = existing?.auto_score;
      const finalScore = scores[c.id]?.final_score;
      const comment = scores[c.id]?.override_comment?.trim();
      if (autoScore != null && finalScore != null && finalScore !== autoScore && !comment) {
        errors.push(c.id);
      }
    });
    return errors;
  }, [criteria, existingScores, scores]);

  const renderTagChip = (tag: string) => {
    const cfg = TAG_CONFIG[tag.toLowerCase()];
    if (!cfg) return null;
    const label = t(`spr.scoring.${cfg.key}`);
    return (
      <TooltipProvider key={tag}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${cfg.color}`}>
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{tag}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const renderGroup = (groupKey: string, clauseRef: string, items: ReviewCriteria[]) => {
    const groupTotal = items.reduce((sum, c) => {
      const finalScore = scores[c.id]?.final_score;
      if (finalScore == null) return sum;
      return sum + (finalScore / c.scale_max) * c.weight;
    }, 0);

    return (
      <Card key={groupKey}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {t(`spr.scoring.${groupKey}`)}
            <span className="text-xs text-muted-foreground font-normal">{clauseRef}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table className="min-w-[800px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">{t('spr.scoring.criterion')}</TableHead>
                <TableHead className="w-[12%]">{t('spr.scoring.tags')}</TableHead>
                <TableHead className="w-[6%] text-right">{t('spr.scoring.weight')}</TableHead>
                <TableHead className="w-[10%] text-center">{t('spr.scoring.autoScore')}</TableHead>
                <TableHead className="w-[12%]">{t('spr.scoring.finalScore')}</TableHead>
                <TableHead className="w-[8%] text-right">{t('spr.scoring.weightedPoints')}</TableHead>
                <TableHead className="w-[27%]">{t('spr.scoring.comment')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(c => {
                const existingScore = existingScores.find(s => s.criterion_id === c.id);
                const autoScore = existingScore?.auto_score;
                const finalScore = scores[c.id]?.final_score;
                const scoreOptions = Array.from({ length: c.scale_max + 1 }, (_, i) => i);
                const needsComment = autoScore != null && finalScore != null && finalScore !== autoScore;
                const hasCommentError = needsComment && !scores[c.id]?.override_comment?.trim();
                const weighted = finalScore != null ? ((finalScore / c.scale_max) * c.weight).toFixed(1) : '—';

                return (
                  <TableRow key={c.id} className={hasCommentError ? 'bg-amber-50' : ''}>
                    <TableCell>
                      <div className="font-medium text-sm">{c[nameKey]}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.bsaq_tags ?? []).map(tag => renderTagChip(tag))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{c.weight}%</TableCell>
                    <TableCell className="text-center">
                      {autoScore != null ? (
                        <span className="text-sm">{autoScore}/{c.scale_max}</span>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground text-sm cursor-help">{t('spr.scoring.noData')}</span>
                            </TooltipTrigger>
                            <TooltipContent>{t('spr.scoring.noDataTooltip')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
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
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{weighted}</TableCell>
                    <TableCell>
                      <Textarea
                        rows={1}
                        className={`min-h-[2rem] text-sm ${hasCommentError ? 'border-amber-500' : ''}`}
                        placeholder={needsComment ? t('spr.scoring.commentPlaceholder') : ''}
                        value={scores[c.id]?.override_comment ?? ''}
                        onChange={e => setScore(c.id, 'override_comment', e.target.value)}
                        disabled={locked}
                      />
                      {hasCommentError && (
                        <p className="text-xs text-amber-600 mt-0.5">{t('spr.scoring.overrideRequired')}</p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/30 font-medium">
                <TableCell colSpan={5} className="text-right text-sm">{t(`spr.scoring.${groupKey}`)} {t('spr.scoring.weightedPoints')}</TableCell>
                <TableCell className="text-right font-mono text-sm">{groupTotal.toFixed(1)}%</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <Card className="border-slate-200 sticky top-0 z-10 bg-background">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('spr.scoring.groupSafety')}:</span>
              <span className={`font-bold ${weightSummary.safety >= 60 ? 'text-green-700' : 'text-red-600'}`}>
                {weightSummary.safety}%
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('spr.scoring.groupCommercial')}:</span>
              <span className="font-bold">{weightSummary.commercial}%</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('spr.scoring.total')}:</span>
              <span className={`font-bold ${weightSummary.total === 100 ? 'text-green-700' : 'text-red-600'}`}>
                {weightSummary.total}%
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('spr.scoring.scored')}:</span>
              <span className="font-bold">{scoredCount}/{criteria.length}</span>
            </div>
            {calcResult && (
              <>
                <div className="h-4 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('spr.scoring.totalScore')}:</span>
                  <span className="text-lg font-bold">{((calcResult as any)?.final_score ?? 0).toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('spr.scoring.provisionalGrade')}:</span>
                  <span className="text-lg font-bold">
                    {((calcResult as any)?.final_score ?? 0) >= 85 ? 'A'
                      : ((calcResult as any)?.final_score ?? 0) >= 70 ? 'B'
                      : ((calcResult as any)?.final_score ?? 0) >= 50 ? 'C' : 'D'}
                  </span>
                </div>
              </>
            )}
            {weightInvalid && (
              <Badge className="bg-red-100 text-red-700">{t('spr.scoring.weightError')}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* BSAQ legend + coverage */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground px-1">
        <span>{t('spr.scoring.legend')}</span>
        <div className="flex gap-1 ml-2">
          {Object.entries(TAG_CONFIG).filter(([k]) => k !== 'commercial').map(([tag]) => renderTagChip(tag))}
        </div>
        {bsaqCoverage.missing.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 ml-2">
            {bsaqCoverage.missing.map(m => t(`spr.scoring.tag${m.charAt(0).toUpperCase() + m.slice(1)}`)).join(', ')} — missing
          </Badge>
        )}
        {bsaqCoverage.missing.length === 0 && (
          <Badge className="bg-green-100 text-green-700 ml-2">✓ BSAQ</Badge>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={locked || upsertScores.isPending || weightInvalid || overrideErrors.length > 0}>
          {upsertScores.isPending ? t('spr.scoring.saving') : t('spr.scoring.save')}
        </Button>
        <Button variant="outline" onClick={handleCalc} disabled={locked || calcScore.isPending || weightInvalid}>
          {calcScore.isPending ? t('spr.scoring.calculating') : t('spr.scoring.calculate')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const updated = { ...scores };
            existingScores.forEach(s => {
              if (s.auto_score != null) {
                updated[s.criterion_id] = { ...updated[s.criterion_id], final_score: s.auto_score };
              }
            });
            setScores(updated);
            setDirty(true);
          }}
          disabled={locked || existingScores.every(s => s.auto_score == null)}
        >
          {t('spr.scoring.useAutoAll')}
        </Button>
        {lastSaved && (
          <span className="text-xs text-muted-foreground ml-2">
            {t('spr.scoring.lastSaved')}: {lastSaved.toLocaleTimeString()}
          </span>
        )}
        {dirty && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 ml-1">
            {t('spr.scoring.unsavedChanges')}
          </Badge>
        )}
      </div>

      {safetyGroup.length > 0 && renderGroup('groupSafety', 'BRCGS 3.5.1.2–3', safetyGroup)}
      {commercialGroup.length > 0 && renderGroup('groupCommercial', '', commercialGroup)}
    </div>
  );
}
