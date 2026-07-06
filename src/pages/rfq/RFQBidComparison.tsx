import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Trophy, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import RiskBadge from '@/components/RiskBadge';
import { scoreQuotations } from '@/lib/scoring';
import type { ScoredQuotation } from '@/lib/scoring';
import { computeRfqBidRisk, type BidRiskResult } from '@/lib/bidRisk';
import { DIMENSION_LABEL } from '@/lib/riskCriteria';
import { ScoreInfo } from '@/components/ScoreFormulaTooltip';
import { loadScoringWeights, DEFAULT_SCORING_WEIGHTS } from '@/lib/scoringWeights';
import type { RiskLevel, ScoringWeights } from '@/types/procurement';

export default function RFQBidComparison() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [rfq, setRfq] = useState<any>(null);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, any>>({});
  const [scored, setScored] = useState<ScoredQuotation[]>([]);
  const [bidRisk, setBidRisk] = useState<BidRiskResult | null>(null);
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_SCORING_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [awardInfo, setAwardInfo] = useState<{ selection_reason: string | null; is_override_selection: boolean } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      const [rfqRes, qRes] = await Promise.all([
        supabase.from('rfqs').select('*').eq('id', id).single(),
        supabase.from('quotations')
          .select('*, suppliers(id, company_name, risk_level)')
          .eq('rfq_id', id)
          .order('created_at'),
      ]);
      if (rfqRes.data) setRfq(rfqRes.data);
      if (qRes.data) {
        setQuotations(qRes.data);
        const sm: Record<string, any> = {};
        qRes.data.forEach((q: any) => { if (q.suppliers) sm[q.supplier_id] = q.suppliers; });
        setSuppliers(sm);
        // BRC criteria-based risk for this RFQ's catalog categories.
        const [risk, w] = await Promise.all([
          computeRfqBidRisk(id, qRes.data.map((q: any) => q.supplier_id)),
          loadScoringWeights(),
        ]);
        setBidRisk(risk);
        setWeights(w);
        const override = risk.hasCriteria
          ? Object.fromEntries(Object.entries(risk.bySupplier).map(([sid, r]) => [sid, r.riskScore]))
          : undefined;
        const result = scoreQuotations(qRes.data, sm, w, override);
        // Preserve is_recommended_winner from DB (user's choice), not scoring default
        const dbWinnerMap = new Map(qRes.data.map((q: any) => [q.id, q.is_recommended_winner]));
        result.forEach(s => { s.is_recommended_winner = dbWinnerMap.get(s.quotation_id) ?? false; });
        setScored(result);
      }
      // Load award info for selection reason
      const { data: award } = await supabase.from('awards').select('selection_reason, is_override_selection')
        .eq('rfq_id', id).limit(1).maybeSingle();
      if (award) setAwardInfo(award as any);
      setLoading(false);
    };
    fetch();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!rfq) return <div className="text-center py-16 text-muted-foreground">RFQ not found</div>;

  const isAwarded = rfq?.status === 'awarded';
  const winner = scored.find(s => s.is_recommended_winner);
  const winnerSupplier = winner ? suppliers[winner.supplier_id] : null;
  const globalWarnings = scored.flatMap(s => s.warnings.filter(w => w.includes('Lowest price')));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/rfq/${id}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Bid Comparison</h1>
          <p className="text-sm text-muted-foreground">{rfq.rfq_number} · {rfq.title}</p>
        </div>
      </div>

      {globalWarnings.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-orange-200 bg-orange-50">
          <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-800">Best Value Warning</p>
            {globalWarnings.map((w, i) => (
              <p key={i} className="text-sm text-orange-700 mt-0.5">{w}</p>
            ))}
          </div>
        </div>
      )}

      {winner && winnerSupplier && (() => {
        const isOverride = winner.rank != null && winner.rank > 1;
        return (
          <Card className={`${isOverride ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg ${isOverride ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                <Trophy className={`w-6 h-6 ${isOverride ? 'text-amber-600' : 'text-emerald-600'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-xs font-medium uppercase tracking-wide ${isOverride ? 'text-amber-600' : 'text-emerald-600'}`}>
                    ผู้ชนะการคัดเลือก
                  </p>
                  {isOverride && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 gap-0.5">
                      <AlertCircle className="w-3 h-3" />คัดเลือกนอกเกณฑ์คะแนน
                    </Badge>
                  )}
                </div>
                <p className={`text-lg font-bold ${isOverride ? 'text-amber-800' : 'text-emerald-800'}`}>{winnerSupplier.company_name}</p>
                <p className={`text-sm ${isOverride ? 'text-amber-700' : 'text-emerald-700'}`}>
                  Final Score: <span className="font-bold">{winner.final_score}</span> · Rank #{winner.rank ?? 1}
                  {isOverride && <span className="ml-2 text-amber-600">(คะแนนสูงสุดคือ {scored[0]?.final_score ?? '—'})</span>}
                  {winner.warnings.length > 0 && <span className="ml-2 text-orange-600">⚠ Has warnings</span>}
                </p>
                {awardInfo?.selection_reason && (
                  <div className={`mt-2 pt-2 border-t text-sm ${isOverride ? 'border-amber-200/60 text-amber-800' : 'border-emerald-200/60 text-emerald-800'}`}>
                    <span className="font-medium">เหตุผลการคัดเลือก:</span> {awardInfo.selection_reason}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle className="w-3.5 h-3.5" />
        Scoring formula: Commercial {weights.commercial}% + Technical {weights.technical}% + Risk {weights.risk}%
      </div>

      {quotations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            No quotations submitted yet for this RFQ.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground min-w-[160px]">Supplier</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Price</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Discount</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Net Price</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Lead Time</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Payment</th>
                <th className="text-center p-3 font-medium text-muted-foreground">Risk</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Spec %</th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-blue-50 whitespace-nowrap">Commercial<ScoreInfo k="commercial" weights={weights} /></th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-purple-50 whitespace-nowrap">Technical<ScoreInfo k="technical" weights={weights} /></th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-orange-50 whitespace-nowrap">Risk Score<ScoreInfo k="risk" weights={weights} /></th>
                <th className="text-right p-3 font-medium text-muted-foreground bg-emerald-50 whitespace-nowrap">Final Score<ScoreInfo k="final" weights={weights} /></th>
                <th className="text-center p-3 font-medium text-muted-foreground">Rank</th>
              </tr>
            </thead>
            <tbody>
              {scored.map(s => {
                const q = quotations.find(q => q.id === s.quotation_id);
                if (!q) return null;
                const sup = suppliers[s.supplier_id];
                const isWinner = s.is_recommended_winner;
                const hasWarn = s.warnings.length > 0;

                return (
                  <tr
                    key={s.quotation_id}
                    className={`border-b transition-colors ${
                      isWinner && !hasWarn
                        ? 'bg-emerald-50/60 hover:bg-emerald-50'
                        : isWinner && hasWarn
                        ? 'bg-orange-50/60 hover:bg-orange-50'
                        : s.rank === 1 && !isWinner
                        ? 'bg-blue-50/50 ring-1 ring-blue-200'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    <td className="p-3">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isWinner && <Trophy className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          <span className="font-medium">{sup?.company_name || '—'}</span>
                          {s.rank === 1 && !isWinner && (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0 gap-0.5">
                              <Trophy className="w-3 h-3" />แนะนำ
                            </Badge>
                          )}
                          {isWinner && (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0">ผู้ชนะ</Badge>
                          )}
                          {isWinner && s.rank != null && s.rank > 1 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 gap-0.5" title="คัดเลือกนอกเหนือผลคะแนนปกติ">
                              <AlertCircle className="w-3 h-3" />นอกเกณฑ์คะแนน
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{q.quotation_no || q.id.slice(0, 8)}</p>
                        {hasWarn && (
                          <div className="mt-1 space-y-0.5">
                            {s.warnings.map((w, i) => (
                              <p key={i} className="text-xs text-orange-600 flex items-start gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{w}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {q.price != null ? (q.price as number).toLocaleString() : (q.total_amount as number)?.toLocaleString() || '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {q.discount ? (q.discount as number).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {s.effective_price > 0 ? s.effective_price.toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {q.lead_time_days ? `${q.lead_time_days}d` : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs max-w-[100px] truncate">
                      {q.payment_term || q.payment_terms || '—'}
                    </td>
                    <td className="p-3 text-center">
                      {(() => {
                        const r = bidRisk?.bySupplier[s.supplier_id];
                        if (bidRisk?.hasCriteria && r?.brc) {
                          const weak = Object.values(r.dims)
                            .filter(d => d.score != null && (d.score as number) >= 6)
                            .map(d => `${DIMENSION_LABEL[d.dimension] || d.dimension}: ${d.metWeight}/${d.totalWeight}`);
                          const gradeColor: Record<string, string> = {
                            A: 'bg-green-600', B: 'bg-blue-600', C: 'bg-orange-500', D: 'bg-red-600',
                          };
                          return (
                            <div className="flex flex-col items-center gap-0.5"
                              title={weak.length ? `จุดที่ขาดคะแนน — ${weak.join(' · ')}` : 'ผ่านเกณฑ์ BRCGS ครบ'}>
                              {r.brc.grade ? (
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold ${gradeColor[r.brc.grade] || 'bg-muted'}`}>
                                  {r.brc.grade}
                                </span>
                              ) : <RiskBadge level={r.level} />}
                              <span className="text-[10px] text-muted-foreground">BRCGS {r.brc.totalScore}/{r.brc.assessedMax}</span>
                            </div>
                          );
                        }
                        return <RiskBadge level={sup?.risk_level as RiskLevel} />;
                      })()}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {q.spec_compliance_score != null ? `${q.spec_compliance_score}%` : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium bg-blue-50/50">
                      <ScoreCell value={s.commercial_score} />
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium bg-purple-50/50">
                      <ScoreCell value={s.technical_score} />
                    </td>
                    <td className="p-3 text-right tabular-nums font-medium bg-orange-50/50">
                      <ScoreCell value={s.risk_score} />
                    </td>
                    <td className="p-3 text-right tabular-nums font-bold text-base bg-emerald-50/50">
                      <ScoreCell value={s.final_score} highlight />
                    </td>
                    <td className="p-3 text-center">
                      <RankBadge rank={s.rank} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Scoring Methodology</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p><strong>Commercial ({weights.commercial}%)</strong> = Price 60% + Lead Time 30% + Payment Term 10%</p>
          <p><strong>Technical ({weights.technical}%)</strong> = Specification Compliance Score</p>
          {bidRisk?.hasCriteria ? (
            <p><strong>Risk ({weights.risk}%)</strong> = คะแนน BRCGS ของ supplier (ใบรับรอง/เอกสาร/การประเมิน + Pricing·Delivery·Credit จากใบเสนอราคาอัตโนมัติ) — เกรด A=Preferred, B=Approved, C=Restricted, D=Unsuitable</p>
          ) : (
            <p><strong>Risk ({weights.risk}%)</strong> = Low 100 · Medium 75 · High 50 · Critical 0 <span className="text-xs">(ยังไม่มีเกณฑ์ความเสี่ยงในหมวดนี้ — ใช้ระดับความเสี่ยงรวมของ supplier)</span></p>
          )}
          <p><strong>Final Score</strong> = Commercial × {(weights.commercial / 100).toFixed(2)} + Technical × {(weights.technical / 100).toFixed(2)} + Risk × {(weights.risk / 100).toFixed(2)}</p>
          <p className="text-xs mt-2">Lower price → higher price score (min price ÷ candidate price × 100)</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreCell({ value, highlight = false }: { value: number; highlight?: boolean }) {
  const color =
    value >= 80 ? 'text-emerald-700' :
    value >= 60 ? 'text-blue-700'    :
    value >= 40 ? 'text-yellow-700'  :
                  'text-red-700';
  return <span className={`${color} ${highlight ? 'text-lg' : ''}`}>{value}</span>;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-bold">#1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-400 text-white text-xs font-bold">#2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400 text-white text-xs font-bold">#3</span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-bold">#{rank}</span>;
}
