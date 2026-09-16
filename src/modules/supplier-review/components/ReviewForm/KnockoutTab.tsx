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
  const anyFailed = knockouts.some(k => !k.passed && !k.detail?.startsWith('N/A'));

  const getResultBadge = (result: { passed: boolean; detail: string | null } | undefined) => {
    if (!result) return <Badge variant="outline">{t('spr.knockout.pending')}</Badge>;

    const isNA = result.detail?.startsWith('N/A');
    if (isNA) {
      return <Badge className="bg-slate-100 text-slate-600">N/A</Badge>;
    }
    if (result.passed) {
      return <Badge className="bg-green-100 text-green-700">{t('spr.knockout.passed')}</Badge>;
    }
    return <Badge className="bg-red-100 text-red-700">{t('spr.knockout.failed')}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={handleEvaluate} disabled={locked || evaluateKnockouts.isPending}>
          {evaluateKnockouts.isPending ? t('spr.knockout.evaluating') : t('spr.knockout.evaluate')}
        </Button>
        {knockouts.length > 0 && (
          <Badge className={anyFailed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
            {anyFailed ? t('spr.knockout.triggered') : t('spr.knockout.allPassed')}
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
                <TableHead>{t('spr.knockout.rule')}</TableHead>
                <TableHead className="w-[100px]">{t('spr.knockout.result')}</TableHead>
                <TableHead>{t('spr.knockout.detail')}</TableHead>
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
                    <TableCell>{getResultBadge(result)}</TableCell>
                    <TableCell className="text-sm">{result?.detail ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t('spr.knockout.autoNote')}
      </p>
    </div>
  );
}
