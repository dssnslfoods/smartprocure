import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import { useKnockoutRules, useReviewKnockouts, useEvaluateKnockouts } from '../../hooks/useReviews';

interface Props {
  reviewId: string;
  locked: boolean;
}

export function KnockoutTab({ reviewId, locked }: Props) {
  const { t, i18n } = useTranslation();
  const { data: rules = [] } = useKnockoutRules();
  const { data: knockouts = [] } = useReviewKnockouts(reviewId);
  const evaluateKnockouts = useEvaluateKnockouts();

  const handleEvaluate = () => evaluateKnockouts.mutate(reviewId);

  const knockoutMap = new Map(knockouts.map(k => [k.rule_id, k]));
  const anyFailed = knockouts.some(k => !k.passed);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={handleEvaluate} disabled={locked || evaluateKnockouts.isPending}>
          {evaluateKnockouts.isPending ? 'Evaluating...' : 'Evaluate Knockouts'}
        </Button>
        {knockouts.length > 0 && (
          <Badge className={anyFailed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
            {anyFailed ? 'KNOCKOUT TRIGGERED' : 'ALL PASSED'}
          </Badge>
        )}
      </div>

      {anyFailed && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="text-red-700 font-medium">{t('spr.messages.knockoutOverride')}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{t('spr.knockout.title')}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead className="w-[100px]">Result</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map(rule => {
                const result = knockoutMap.get(rule.id);
                const desc = i18n.language === 'th' ? rule.description_th : rule.description_en;
                return (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="font-medium">{desc}</div>
                      <div className="text-xs text-muted-foreground">{rule.code}</div>
                    </TableCell>
                    <TableCell>
                      {result ? (
                        <Badge className={result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                          {result.passed ? t('spr.knockout.passed') : t('spr.knockout.failed')}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{result?.detail ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
