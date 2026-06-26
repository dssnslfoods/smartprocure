import { Badge } from '@/components/ui/badge';
import { Check, X, Trophy, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import type { AwardSnapshot } from '@/lib/awardSnapshot';

/**
 * Read-only display of an award's frozen selection criteria/scores
 * (awards.selection_snapshot). Shown for historical lookup — the values
 * reflect master data as it was at award time, not the current config.
 */
export default function AwardSelectionSummary({ snap, isOverride, selectionReason }: { snap: AwardSnapshot; isOverride?: boolean; selectionReason?: string | null }) {
  const w = snap.weights;
  const winnerRank = snap.ranking.find(r => r.is_winner)?.rank;
  const topScore = snap.ranking.length > 0 ? snap.ranking[0].final : null;
  return (
    <div className="space-y-4 text-sm">
      {isOverride && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold">คัดเลือกนอกเกณฑ์คะแนน</p>
            <p className="text-xs mt-0.5">ผู้ชนะรายนี้ไม่ได้มีคะแนนสูงสุด{winnerRank ? ` (อันดับ #${winnerRank})` : ''}{topScore != null ? ` — คะแนนสูงสุดคือ ${topScore}` : ''} ผู้มีอำนาจตัดสินใจเลือกนอกเหนือผลคะแนนปกติ</p>
            {selectionReason && (
              <p className="text-xs mt-1.5 pt-1.5 border-t border-amber-200/60"><span className="font-medium">เหตุผล:</span> {selectionReason}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>เกณฑ์และคะแนนนี้ถูกบันทึก ณ วันที่ตัดสิน ({snap.awarded_at ? new Date(snap.awarded_at).toLocaleString() : '—'}) — สะท้อนค่าที่ใช้จริงตอนนั้น แม้ master data จะถูกแก้ภายหลัง</span>
      </div>

      {/* Winner */}
      <section>
        <h4 className="font-semibold mb-2 flex items-center gap-1.5">
          <Trophy className={`w-4 h-4 ${isOverride ? 'text-amber-600' : 'text-emerald-600'}`} />
          ผู้ชนะ
          {isOverride && <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 gap-0.5"><AlertCircle className="w-3 h-3" />นอกเกณฑ์คะแนน</Badge>}
        </h4>
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{snap.winner.company_name}</span>
            <span className="font-bold tabular-nums">{snap.winner.net_price > 0 ? snap.winner.net_price.toLocaleString() : '—'} <span className="text-[10px] text-muted-foreground">ก่อน VAT</span></span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <ScoreBox label={`Commercial ${w.commercial}%`} value={snap.winner.scores.commercial} />
            <ScoreBox label={`Technical ${w.technical}%`} value={snap.winner.scores.technical} />
            <ScoreBox label={`Risk ${w.risk}%`} value={snap.winner.scores.risk} />
            <ScoreBox label="Final" value={snap.winner.scores.final} highlight />
          </div>
          <p className="text-xs text-muted-foreground">
            สูตร: Final = Commercial×{w.commercial}% + Technical×{w.technical}% + Risk×{w.risk}%
          </p>
        </div>
      </section>

      {/* Ranking */}
      {snap.ranking.length > 0 && (
        <section>
          <h4 className="font-semibold mb-2">อันดับผู้เสนอราคา</h4>
          <div className="rounded-lg border divide-y">
            {snap.ranking.map((r, i) => (
              <div key={i} className={`flex items-center justify-between p-2 text-sm ${r.is_winner ? 'bg-emerald-50/60' : ''}`}>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground w-7">#{r.rank}</span>
                  {r.is_winner && <Trophy className="w-3.5 h-3.5 text-emerald-600" />}
                  <span className={r.is_winner ? 'font-medium' : ''}>{r.company_name}</span>
                </span>
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground text-xs">{r.net_price > 0 ? r.net_price.toLocaleString() : '—'}</span>
                  <span className="font-semibold w-10 text-right">{r.final}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Risk criteria */}
      <section>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          เกณฑ์ความเสี่ยง (BRC)
          {snap.risk.score10 != null && <Badge variant="outline" className="text-[10px]">รวม {snap.risk.score10.toFixed(1)}/10 · {snap.risk.level}</Badge>}
        </h4>
        {!snap.risk.has_criteria ? (
          <p className="text-xs text-muted-foreground">ไม่ได้ใช้เกณฑ์ความเสี่ยงในการจัดซื้อนี้ (ไม่มีเกณฑ์ในหมวด catalog)</p>
        ) : (
          <div className="space-y-2">
            {snap.risk.categories.length > 0 && <p className="text-[11px] text-muted-foreground">หมวด catalog: {snap.risk.categories.join(', ')}</p>}
            {snap.risk.dimensions.map((d, i) => (
              <div key={i} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{d.label}</span>
                  <div className="flex items-center gap-1.5">
                    {d.mandatory_unmet && <Badge className="bg-red-500/10 text-red-600 text-[10px] gap-1"><AlertTriangle className="w-3 h-3" />ขาดเกณฑ์บังคับ</Badge>}
                    {d.score != null && <Badge variant="secondary" className="text-[10px]">{d.score}/10</Badge>}
                  </div>
                </div>
                <ul className="space-y-0.5">
                  {d.criteria.map((c, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs">
                      {c.met ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <X className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      <span className={c.met ? '' : 'text-muted-foreground'}>{c.name}</span>
                      {c.mandatory && <Badge variant="outline" className="text-[9px] px-1">บังคับ</Badge>}
                      <span className="text-muted-foreground ml-auto">น้ำหนัก {c.weight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Technical checklist */}
      <section>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          เกณฑ์เทคนิค (Technical checklist)
          {snap.technical.total_score != null && <Badge variant="outline" className="text-[10px]">{snap.technical.total_score}%</Badge>}
        </h4>
        {!snap.technical.has_checklist ? (
          <p className="text-xs text-muted-foreground">ไม่ได้ตั้ง checklist เทคนิคสำหรับการจัดซื้อนี้</p>
        ) : (
          <div className="rounded-lg border divide-y">
            {snap.technical.items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 p-2 text-xs">
                {it.met ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <X className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className={it.met ? '' : 'text-muted-foreground'}>{it.label}</span>
                  {it.value && <span className="text-muted-foreground"> — {it.value}</span>}
                </div>
                <span className="text-muted-foreground shrink-0">น้ำหนัก {it.weight}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ScoreBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-1.5 ${highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/30'}`}>
      <div className={`font-bold tabular-nums ${highlight ? 'text-emerald-700 text-base' : ''}`}>{value}</div>
      <div className="text-[9px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}
