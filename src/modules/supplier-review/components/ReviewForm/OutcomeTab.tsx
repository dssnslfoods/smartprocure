import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { GradeBadge } from '../shared';
import { useActions, useCreateAction, useUpdateAction } from '../../hooks/useReviews';
import type { SupplierReview, ActionType, ActionStatus, ReviewAction } from '../../types';

interface Props {
  review: SupplierReview;
  locked: boolean;
  onRiskAdjust: (adjusted: boolean, reason: string, newLevel: string) => void;
}

const actionTypes: ActionType[] = ['CAPA', 'IMPROVEMENT', 'REISSUE_QUESTIONNAIRE', 'TRACEABILITY_VERIFY', 'OTHER'];

export function OutcomeTab({ review, locked, onRiskAdjust }: Props) {
  const { t } = useTranslation();
  const { data: actions = [] } = useActions(review.id);
  const createAction = useCreateAction();
  const updateAction = useUpdateAction();

  const [newAction, setNewAction] = useState<Partial<ReviewAction>>({
    action_type: 'IMPROVEMENT',
    description: '',
    due_date: null,
  });

  const [riskAdjusted, setRiskAdjusted] = useState(review.risk_adjusted);
  const [riskReason, setRiskReason] = useState(review.risk_adjustment_reason ?? '');
  const [newRiskLevel, setNewRiskLevel] = useState(review.new_risk_level ?? '');

  const handleAddAction = async () => {
    if (!newAction.description) return;
    await createAction.mutateAsync({ ...newAction, review_id: review.id });
    setNewAction({ action_type: 'IMPROVEMENT', description: '', due_date: null });
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Review Outcome</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <Label>Grade</Label>
              <div className="mt-1">
                {review.grade ? <GradeBadge grade={review.grade} score={review.final_score} /> : <span className="text-muted-foreground">Pending</span>}
              </div>
            </div>
            <div>
              <Label>Outcome</Label>
              <p className="font-medium mt-1">{review.outcome ?? 'Pending'}</p>
            </div>
            {review.knockout_failed && (
              <div className="text-red-600 font-medium">Knockout Failed — Grade Capped at D</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Risk Adjustment</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch checked={riskAdjusted} onCheckedChange={handleRiskToggle} disabled={locked} />
            <Label>Adjust risk level based on this review</Label>
          </div>
          {riskAdjusted && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>New Risk Level</Label>
                <Select value={newRiskLevel} onValueChange={v => { setNewRiskLevel(v); onRiskAdjust(true, riskReason, v); }} disabled={locked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['critical', 'high', 'medium', 'low'].map(l => (
                      <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={riskReason}
                  onChange={e => { setRiskReason(e.target.value); onRiskAdjust(true, e.target.value, newRiskLevel); }}
                  disabled={locked}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Action Items</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!locked && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <Label>Type</Label>
                <Select value={newAction.action_type} onValueChange={v => setNewAction(p => ({ ...p, action_type: v as ActionType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {actionTypes.map(at => (
                      <SelectItem key={at} value={at}>{t(`spr.action.${at.toLowerCase()}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Input value={newAction.description ?? ''} onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))} />
              </div>
              <Button onClick={handleAddAction} disabled={createAction.isPending}>Add</Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{t(`spr.action.${a.action_type.toLowerCase()}`)}</TableCell>
                  <TableCell>{a.description}</TableCell>
                  <TableCell>{a.due_date ?? '—'}</TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>
                    {!locked && a.status !== 'CLOSED' && a.status !== 'CANCELLED' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(a.id, 'IN_PROGRESS')}>Start</Button>
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(a.id, 'CLOSED')}>Close</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {actions.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No action items</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
