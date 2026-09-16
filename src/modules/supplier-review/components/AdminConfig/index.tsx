import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n';
import {
  useFrequencyConfig, useUpdateFrequencyConfig,
  useCriteria, useSaveCriterion,
  useKnockoutRules,
  useGradeThresholds, useUpdateGradeThreshold,
} from '../../hooks/useReviews';
import * as api from '../../api/client';

export function AdminConfig() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState('frequency');
  const [weightCheck, setWeightCheck] = useState<{
    valid: boolean; total: number; safety_quality: number; commercial: number; safety_pct: number; errors?: string[];
  } | null>(null);

  const { data: freqConfig = [] } = useFrequencyConfig();
  const updateFreq = useUpdateFrequencyConfig();

  const { data: criteria = [] } = useCriteria();
  const saveCriterion = useSaveCriterion();

  const { data: knockoutRules = [] } = useKnockoutRules();

  const { data: gradeThresholds = [] } = useGradeThresholds();
  const updateGrade = useUpdateGradeThreshold();

  const checkWeights = async () => {
    const result = await api.validateCriteriaWeights('rm_primary_pk');
    setWeightCheck(result);
  };

  const nameKey = i18n.language === 'th' ? 'name_th' : 'name_en';

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">{t('spr.config')}</h2>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="frequency">{t('spr.config_section.frequency')}</TabsTrigger>
          <TabsTrigger value="criteria">{t('spr.config_section.criteria')}</TabsTrigger>
          <TabsTrigger value="knockouts">{t('spr.config_section.knockoutRules')}</TabsTrigger>
          <TabsTrigger value="grades">{t('spr.config_section.gradeThresholds')}</TabsTrigger>
        </TabsList>

        <TabsContent value="frequency">
          <Card>
            <CardHeader><CardTitle>{t('spr.config_section.frequency')}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Months</TableHead>
                    <TableHead>Max Months</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freqConfig.map(fc => (
                    <FrequencyRow key={fc.id} config={fc} onSave={(months, max) => updateFreq.mutate({ id: fc.id, months, max_months: max })} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="criteria">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{t('spr.config_section.criteria')}</CardTitle>
                <Button variant="outline" size="sm" onClick={checkWeights}>Check Weights & BSAQ</Button>
              </div>
              {weightCheck && (
                <div className="space-y-1">
                  <Badge className={weightCheck.valid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    Safety/Quality: {weightCheck.safety_quality}% | Commercial: {weightCheck.commercial}% | Total: {weightCheck.total}%
                    {weightCheck.valid ? ' ✓' : ''}
                  </Badge>
                  {weightCheck.errors?.map((err, i) => (
                    <p key={i} className="text-red-600 text-sm">{err}</p>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>BSAQ Tags</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criteria.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.code}</TableCell>
                      <TableCell>{c[nameKey]}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.criterion_group === 'SAFETY_QUALITY' ? 'Safety' : 'Commercial'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(c.bsaq_tags ?? []).map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0 uppercase">{tag.charAt(0).toUpperCase()}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{c.weight}%</TableCell>
                      <TableCell>{c.supplier_category}</TableCell>
                      <TableCell>{c.active ? '✓' : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knockouts">
          <Card>
            <CardHeader><CardTitle>{t('spr.config_section.knockoutRules')}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {knockoutRules.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.code}</TableCell>
                      <TableCell>{i18n.language === 'th' ? r.description_th : r.description_en}</TableCell>
                      <TableCell>{r.applies_to_categories.join(', ')}</TableCell>
                      <TableCell>{r.active ? '✓' : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grades">
          <Card>
            <CardHeader><CardTitle>{t('spr.config_section.gradeThresholds')}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grade</TableHead>
                    <TableHead>Min Score (%)</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Next Review (months)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gradeThresholds.map(gt => (
                    <TableRow key={gt.id}>
                      <TableCell className="font-bold text-lg">{gt.grade}</TableCell>
                      <TableCell>{gt.min_score}</TableCell>
                      <TableCell>{gt.outcome}</TableCell>
                      <TableCell>{gt.next_review_months ?? '—'}</TableCell>
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

function FrequencyRow({ config, onSave }: { config: { id: string; risk_level: string; months: number; max_months: number }; onSave: (m: number, max: number) => void }) {
  const [months, setMonths] = useState(config.months);
  const [maxMonths, setMaxMonths] = useState(config.max_months);

  return (
    <TableRow>
      <TableCell className="font-medium capitalize">{config.risk_level}</TableCell>
      <TableCell>
        <Input type="number" min={1} max={36} className="w-20" value={months} onChange={e => setMonths(Number(e.target.value))} />
      </TableCell>
      <TableCell>
        <Input type="number" min={1} max={36} className="w-20" value={maxMonths} onChange={e => setMaxMonths(Number(e.target.value))} />
      </TableCell>
      <TableCell>
        <Button size="sm" variant="outline" onClick={() => onSave(months, maxMonths)}>Save</Button>
      </TableCell>
    </TableRow>
  );
}
