import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/i18n';
import { useCriteria, useScores, useUpsertScores, useCalcScore, useKpiSnapshot } from '../../hooks/useReviews';
import type { ReviewScore, ReviewCriteria, KpiData } from '../../types';

interface Props {
  reviewId: string;
  supplierCategory: string;
  locked: boolean;
}

const TAG_COLORS: Record<string, string> = {
  safety:       'bg-red-100 text-red-700 border-red-300',
  quality:      'bg-blue-100 text-blue-700 border-blue-300',
  legality:     'bg-purple-100 text-purple-700 border-purple-300',
  authenticity: 'bg-amber-100 text-amber-700 border-amber-300',
  commercial:   'bg-gray-100 text-gray-600 border-gray-300',
};

const TAG_TOOLTIPS: Record<string, string> = {
  safety:       'Product safety — BRCGS 3.5.1.3',
  quality:      'Quality of material supplied',
  legality:     'Legal / regulatory compliance (e.g. อย.)',
  authenticity: 'Authenticity / food fraud',
  commercial:   'Commercial performance',
};

const TAG_KEYS: Record<string, string> = {
  safety: 'tagSafety', quality: 'tagQuality', legality: 'tagLegality',
  authenticity: 'tagAuthenticity', commercial: 'tagCommercial',
};

const AUTO_RULE_FIELDS: Record<string, { kpiField: keyof KpiData; labelKey: string; suffix: string }> = {
  reject_rate:      { kpiField: 'reject_rate', labelKey: 'autoSourceReject', suffix: '%' },
  complaints_count: { kpiField: 'complaints_count', labelKey: 'autoSourceComplaints', suffix: '' },
  on_time_delivery: { kpiField: 'on_time_delivery_pct', labelKey: 'autoSourceOtd', suffix: '%' },
  doc_accuracy:     { kpiField: 'document_accuracy_pct', labelKey: 'autoSourceDocAcc', suffix: '%' },
};

export function ScoringTab({ reviewId, supplierCategory, locked }: Props) {
  const { t, i18n } = useTranslation();
  const { data: criteria = [] } = useCriteria(supplierCategory);
  const { data: existingScores = [] } = useScores(reviewId);
  const { data: kpiSnapshot } = useKpiSnapshot(reviewId);
  const upsertScores = useUpsertScores();
  const calcScore = useCalcScore();

  const kpiData = (kpiSnapshot?.data ?? null) as KpiData | null;

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

  const handleUseAllAuto = () => {
    const updated = { ...scores };
    existingScores.forEach(s => {
      if (s.auto_score != null) {
        updated[s.criterion_id] = { ...updated[s.criterion_id], final_score: s.auto_score };
      }
    });
    setScores(updated);
    setDirty(true);
  };

  const nameKey = i18n.language === 'th' ? 'name_th' : 'name_en';

  const safetyGroup = criteria.filter(c => c.criterion_group === 'SAFETY_QUALITY');
  const commercialGroup = criteria.filter(c => c.criterion_group === 'COMMERCIAL');

  const weightSummary = useMemo(() => {
    const safety = safetyGroup.reduce((s, c) => s + c.weight, 0);
    const commercial = commercialGroup.reduce((s, c) => s + c.weight, 0);
    return { safety, commercial, total: safety + commercial };
  }, [safetyGroup, commercialGroup]);

  const weightInvalid = weightSummary.total !== 100 || weightSummary.safety < 60;

  const scoredCount = useMemo(() => {
    return criteria.filter(c => scores[c.id]?.final_score != null).length;
  }, [criteria, scores]);

  const bsaqCoverage = useMemo(() => {
    const allTags = new Set<string>();
    criteria.forEach(c => (c.bsaq_tags ?? []).forEach(tag => allTags.add(tag.toLowerCase())));
    const required = ['safety', 'quality', 'legality', 'authenticity'] as const;
    return required.map(dim => ({ dim, covered: allTags.has(dim) }));
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

  const liveScores = useMemo(() => {
    let sqWeighted = 0, sqWeight = 0, cmWeighted = 0, cmWeight = 0;
    criteria.forEach(c => {
      const fs = scores[c.id]?.final_score;
      if (fs == null) return;
      const pts = (fs / c.scale_max) * c.weight;
      if (c.criterion_group === 'SAFETY_QUALITY') { sqWeighted += pts; sqWeight += c.weight; }
      else { cmWeighted += pts; cmWeight += c.weight; }
    });
    const totalWeighted = sqWeighted + cmWeighted;
    const totalWeight = sqWeight + cmWeight;
    const finalPct = totalWeight > 0 ? (totalWeighted / totalWeight) * 100 : 0;
    return {
      sqScore: sqWeighted.toFixed(1),
      sqMax: weightSummary.safety,
      cmScore: cmWeighted.toFixed(1),
      cmMax: weightSummary.commercial,
      totalPct: finalPct.toFixed(1),
      grade: finalPct >= 85 ? 'A' : finalPct >= 70 ? 'B' : finalPct >= 50 ? 'C' : 'D',
    };
  }, [criteria, scores, weightSummary]);

  const getAutoSourceLabel = (c: ReviewCriteria, autoScore: number): string | null => {
    if (!c.auto_rule || !kpiData) return null;
    const rule = c.auto_rule as { field?: string };
    if (!rule.field) return null;
    const mapping = AUTO_RULE_FIELDS[rule.field];
    if (!mapping) return null;
    const val = kpiData[mapping.kpiField];
    if (val == null) return null;
    return t(`spr.scoring.${mapping.labelKey}`, { val: String(val) });
  };

  const renderTagChip = (tag: string) => {
    const lower = tag.toLowerCase();
    const color = TAG_COLORS[lower] ?? 'bg-gray-100 text-gray-600 border-gray-300';
    const tooltip = TAG_TOOLTIPS[lower] ?? tag;
    const key = TAG_KEYS[lower];
    const label = key ? t(`spr.scoring.${key}`) : tag;
    return (
      <TooltipProvider key={tag}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${color} cursor-default`}>
              {label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={handleSave} disabled={locked || upsertScores.isPending || weightInvalid || overrideErrors.length > 0}>
        {upsertScores.isPending ? t('spr.scoring.saving') : t('spr.scoring.save')}
      </Button>
      <Button variant="outline" onClick={handleCalc} disabled={locked || calcScore.isPending || weightInvalid}>
        {calcScore.isPending ? t('spr.scoring.calculating') : t('spr.scoring.calculate')}
      </Button>
      <Button variant="ghost" size="sm" onClick={handleUseAllAuto}
        disabled={locked || existingScores.every(s => s.auto_score == null)}>
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
  );

  const renderGroup = (groupKey: string, items: ReviewCriteria[]) => {
    const groupWeightTotal = items.reduce((s, c) => s + c.weight, 0);
    const groupScoreTotal = items.reduce((sum, c) => {
      const fs = scores[c.id]?.final_score;
      if (fs == null) return sum;
      return sum + (fs / c.scale_max) * c.weight;
    }, 0);

    const subtotalKey = groupKey === 'groupSafety' ? 'sqSubtotal' : 'cmSubtotal';

    return (
      <Card key={groupKey}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {t(`spr.scoring.${groupKey}`)}
            <span className="text-xs text-muted-foreground font-normal ml-2">
              — {t(`spr.scoring.${subtotalKey}`, { pct: String(groupWeightTotal) })}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">{t('spr.scoring.criterion')}</TableHead>
                  <TableHead className="w-[12%]">{t('spr.scoring.tags')}</TableHead>
                  <TableHead className="w-[6%] text-right">{t('spr.scoring.weight')}</TableHead>
                  <TableHead className="w-[12%] text-center">{t('spr.scoring.autoScore')}</TableHead>
                  <TableHead className="w-[13%]">{t('spr.scoring.finalScore')}</TableHead>
                  <TableHead className="w-[7%] text-right">{t('spr.scoring.weightedPoints')}</TableHead>
                  <TableHead style={{ minWidth: 280 }}>{t('spr.scoring.comment')}</TableHead>
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
                  const selectedDesc = c.score_descriptors?.find(d => d.score === finalScore);
                  const autoSourceLabel = autoScore != null ? getAutoSourceLabel(c, autoScore) : null;
                  const tags = c.bsaq_tags ?? [];

                  return (
                    <TableRow key={c.id} className={hasCommentError ? 'bg-amber-50' : undefined}>
                      <TableCell>
                        <div className="font-medium text-sm">{c[nameKey]}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1" style={{ maxWidth: 160 }}>
                          {tags.length > 0 ? tags.map(tag => renderTagChip(tag)) : renderTagChip('commercial')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{c.weight}%</TableCell>
                      <TableCell className="text-center">
                        {autoScore != null ? (
                          <div className="text-sm">
                            <span className="font-medium">{autoScore}/{c.scale_max}</span>
                            {autoSourceLabel && (
                              <div className="text-[10px] text-muted-foreground">{autoSourceLabel}</div>
                            )}
                          </div>
                        ) : (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground text-xs cursor-help">
                                  {t('spr.scoring.noData')}
                                </span>
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
                          <SelectTrigger className="w-full min-w-[100px]">
                            <SelectValue placeholder="—">
                              {finalScore != null && selectedDesc
                                ? `${finalScore} — ${selectedDesc.label}`
                                : finalScore != null ? String(finalScore) : '—'}
                            </SelectValue>
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
                          className={`min-h-[2rem] text-sm resize-y ${hasCommentError ? 'border-red-500 focus:border-red-500' : ''}`}
                          placeholder={t('spr.scoring.commentPlaceholder')}
                          value={scores[c.id]?.override_comment ?? ''}
                          onChange={e => setScore(c.id, 'override_comment', e.target.value)}
                          disabled={locked}
                        />
                        {hasCommentError && (
                          <p className="text-xs text-red-600 mt-0.5">{t('spr.scoring.overrideRequired')}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/30 font-medium border-t-2">
                  <TableCell colSpan={5} className="text-right text-sm">
                    {t(`spr.scoring.${groupKey}`)} {t('spr.scoring.weightedPoints')}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{groupScoreTotal.toFixed(1)}%</TableCell>
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
      {/* Sticky summary bar — 3 rows */}
      <Card className="border-slate-200 sticky top-0 z-10 bg-background shadow-sm">
        <CardContent className="pt-4 pb-3 space-y-2">
          {/* Row 1: Weights */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t('spr.scoring.groupSafety')}</span>
            <span className={`font-bold ${weightSummary.safety >= 60 ? 'text-green-700' : 'text-red-600'}`}>
              {weightSummary.safety}%
            </span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{t('spr.scoring.groupCommercial')}</span>
            <span className="font-bold">{weightSummary.commercial}%</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">{t('spr.scoring.total')}</span>
            <span className={`font-bold ${weightSummary.total === 100 ? 'text-green-700' : 'text-red-600'}`}>
              {weightSummary.total}%
              {weightSummary.total === 100 && ' ✓'}
            </span>
          </div>

          {/* Row 2: BSAQ coverage */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t('spr.scoring.tags')}:</span>
            {bsaqCoverage.map(({ dim, covered }) => (
              <span key={dim} className={covered ? 'text-green-700' : 'text-red-600'}>
                {covered ? '✓' : '✗'} {t(`spr.scoring.tag${dim.charAt(0).toUpperCase() + dim.slice(1)}`)}
              </span>
            ))}
          </div>

          {/* Row 3: Live scores + grade + scored count */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t('spr.scoring.sqScore')}:</span>
            <span className="font-bold">{liveScores.sqScore} / {liveScores.sqMax}</span>
            <span className="text-muted-foreground">{t('spr.scoring.cmScore')}:</span>
            <span className="font-bold">{liveScores.cmScore} / {liveScores.cmMax}</span>
            <span className="text-muted-foreground">{t('spr.scoring.totalScore')}:</span>
            <span className="text-lg font-bold">{liveScores.totalPct}%</span>
            <span className="text-muted-foreground">{t('spr.scoring.provisionalGrade')}:</span>
            <span className="text-lg font-bold">{liveScores.grade}</span>
            <span className="text-muted-foreground ml-2">{t('spr.scoring.scored')}</span>
            <span className="font-bold">{scoredCount}/{criteria.length}</span>
          </div>

          {/* Weight error */}
          {weightInvalid && (
            <div className="text-sm text-red-600 font-medium">
              {t('spr.scoring.weightError')}
              {' — '}
              <span className="text-red-500 underline cursor-pointer text-xs">
                {t('spr.scoring.goToConfig')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend line */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground px-1">
        <span>{t('spr.scoring.legend')}</span>
        <div className="flex gap-1 ml-1">
          {['safety', 'quality', 'legality', 'authenticity'].map(tag => renderTagChip(tag))}
        </div>
      </div>

      {/* Top action buttons */}
      {actionButtons}

      {/* Criterion tables */}
      {safetyGroup.length > 0 && renderGroup('groupSafety', safetyGroup)}
      {commercialGroup.length > 0 && renderGroup('groupCommercial', commercialGroup)}

      {/* Bottom action buttons */}
      {actionButtons}
    </div>
  );
}
