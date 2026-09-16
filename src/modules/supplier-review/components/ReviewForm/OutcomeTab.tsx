import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { GradeBadge } from '../shared';
import { useActions, useCreateAction, useUpdateAction, useFrequencyConfig } from '../../hooks/useReviews';
import type { SupplierReview, ActionType, ActionStatus, ReviewAction } from '../../types';

interface Props {
  review: SupplierReview;
  locked: boolean;
  onRiskAdjust: (adjusted: boolean, reason: string, newLevel: string) => void;
}

const ACTION_TYPES: { value: ActionType; labelKey: string }[] = [
  { value: 'CAPA', labelKey: 'spr.action.capa' },
  { value: 'IMPROVEMENT', labelKey: 'spr.action.improvement' },
  { value: 'REISSUE_QUESTIONNAIRE', labelKey: 'spr.action.reissueQuestionnaire' },
  { value: 'TRACEABILITY_VERIFY', labelKey: 'spr.action.traceabilityVerify' },
  { value: 'OTHER', labelKey: 'spr.action.other' },
];

export function OutcomeTab({ review, locked, onRiskAdjust }: Props) {
  const { t } = useTranslation();
  const { data: actions = [] } = useActions(review.id);
  const { data: freqConfig = [] } = useFrequencyConfig();
  const createAction = useCreateAction();
  const updateAction = useUpdateAction();

  const [newAction, setNewAction] = useState<Partial<ReviewAction>>({
    action_type: 'IMPROVEMENT',
    description: '',
    due_date: null,
    owner_id: null,
  });
  const [capaRef, setCapaRef] = useState('');

  const [riskAdjusted, setRiskAdjusted] = useState(review.risk_adjusted);
  const [riskReason, setRiskReason] = useState(review.risk_adjustment_reason ?? '');
  const [newRiskLevel, setNewRiskLevel] = useState(review.new_risk_level ?? '');

  const handleAddAction = async () => {
    if (!newAction.description) return;
    const desc = capaRef ? `${newAction.description} [CAPA: ${capaRef}]` : newAction.description;
    await createAction.mutateAsync({
      ...newAction,
      description: desc,
      review_id: review.id,
    });
    setNewAction({ action_type: 'IMPROVEMENT', description: '', due_date: null, owner_id: null });
    setCapaRef('');
  };

  const handleStatusChange = async (actionId: string, status: ActionStatus) => {
    await updateAction.mutateAsync({
      id: actionId,
      reviewId: review.id,
      status,
      closed_at: status === 'CLOSED' ? new Date().toISOString() : null,
    });
  };

  const handleRiskToggle = (checked: boolean) => {
    setRiskAdjusted(checked);
    onRiskAdjust(checked, riskReason, newRiskLevel);
  };

  const newFreq = freqConfig.find(f => f.risk_level === newRiskLevel);

  return (
    <div className="space-y-4">
      {/* P1-2: Total score, sub-scores, knockout summary, grade, outcome, next review */}
      <Card>
        <CardHeader><CardTitle>{t('spr.outcome.title')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label>{t('spr.outcome.grade')}</Label>
              <div className="mt-1">
                {review.grade ? <GradeBadge grade={review.grade} score={review.final_score} /> : <span className="text-muted-foreground">Pending</span>}
              </div>
            </div>
            <div>
              <Label>{t('spr.outcome.totalScore')}</Label>
              <p className="font-medium mt-1">{review.final_score != null ? `${review.final_score}%` : 'Pending'}</p>
            </div>
            <div>
              <Label>{t('spr.outcome.outcomeLabel')}</Label>
              <p className="font-medium mt-1">{review.outcome ?? 'Pending'}</p>
            </div>
            <div>
              <Label>{t('spr.outcome.knockout')}</Label>
              <p className="mt-1">
                {review.knockout_failed
                  ? <Badge className="bg-red-100 text-red-700">{t('spr.outcome.knockoutFailed')}</Badge>
                  : <Badge className="bg-green-100 text-green-700">{t('spr.outcome.knockoutPassed')}</Badge>
                }
              </p>
            </div>
          </div>
          {review.knockout_failed && (
            <p className="text-red-600 font-medium text-sm">{t('spr.outcome.knockoutCapped')}</p>
          )}
        </CardContent>
      </Card>

      {/* P1-2: Risk adjustment with frequency preview */}
      <Card>
        <CardHeader><CardTitle>{t('spr.outcome.riskAdjustment')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={riskAdjusted} onCheckedChange={handleRiskToggle} disabled={locked} />
            <Label>{t('spr.outcome.adjustRisk')}</Label>
          </div>
          {riskAdjusted && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('spr.outcome.newRiskLevel')}</Label>
                <Select value={newRiskLevel} onValueChange={v => { setNewRiskLevel(v); onRiskAdjust(true, riskReason, v); }} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['critical', 'high', 'medium', 'low'].map(l => (
                      <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newFreq && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('spr.outcome.frequencyPreview')}: {newFreq.months} {t('spr.info.months')}
                  </p>
                )}
              </div>
              <div>
                <Label>{t('spr.outcome.reason')}</Label>
                <Textarea
                  value={riskReason}
                  onChange={e => { setRiskReason(e.target.value); onRiskAdjust(true, e.target.value, newRiskLevel); }}
                  disabled={locked}
                  placeholder={t('spr.outcome.reasonRequired')}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* P1-2: Enhanced action items */}
      <Card>
        <CardHeader><CardTitle>{t('spr.outcome.actionItems')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!locked && (
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
              <div>
                <Label>{t('spr.outcome.type')}</Label>
                <Select value={newAction.action_type} onValueChange={v => setNewAction(p => ({ ...p, action_type: v as ActionType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map(at => (
                      <SelectItem key={at.value} value={at.value}>{t(at.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t('spr.outcome.description')}</Label>
                <Input value={newAction.description ?? ''} onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <Label>{t('spr.outcome.dueDate')}</Label>
                <Input type="date" value={newAction.due_date ?? ''} onChange={e => setNewAction(p => ({ ...p, due_date: e.target.value || null }))} />
              </div>
              <div>
                <Label>{t('spr.outcome.capaRef')}</Label>
                <Input placeholder="CAPA-xxx" value={capaRef} onChange={e => setCapaRef(e.target.value)} />
              </div>
              <Button onClick={handleAddAction} disabled={createAction.isPending}>{t('spr.outcome.add')}</Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('spr.outcome.type')}</TableHead>
                <TableHead>{t('spr.outcome.description')}</TableHead>
                <TableHead>{t('spr.outcome.dueDate')}</TableHead>
                <TableHead>{t('spr.outcome.statusCol')}</TableHead>
                <TableHead>{t('spr.outcome.actionsCol')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{t(`spr.action.${a.action_type.toLowerCase()}`)}</TableCell>
                  <TableCell>{a.description}</TableCell>
                  <TableCell>{a.due_date ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{a.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {!locked && a.status !== 'CLOSED' && a.status !== 'CANCELLED' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(a.id, 'IN_PROGRESS')}>{t('spr.outcome.start')}</Button>
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(a.id, 'CLOSED')}>{t('spr.outcome.close')}</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {actions.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t('spr.outcome.noActions')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
