import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface Supplier {
  id: string;
  company_name: string;
  total_spend: number | null;
  priority_score: number | null;
  num_items: number | null;
  abc_class: number | null;
  xyz_class: number | null;
  risk_label: string | null;
}

const fmtTHB = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${Math.round(n)}`;
};

export default function SupplierRiskBubble() {
  const [data, setData] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ s: Supplier; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('suppliers')
        .select('id, company_name, total_spend, priority_score, num_items, abc_class, xyz_class, risk_label')
        .not('total_spend', 'is', null)
        .order('total_spend', { ascending: false })
        .limit(120);
      if (!cancelled && !error) setData((data || []) as Supplier[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const update = () => { if (containerRef.current) setWidth(containerRef.current.clientWidth); };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const { points, maxSpend, height, padding } = useMemo(() => {
    const pad = { top: 30, right: 30, bottom: 50, left: 70 };
    const h = 420;
    const w = Math.max(width, 600);

    const max = data.reduce((m, s) => Math.max(m, Number(s.total_spend || 0)), 1);
    const maxItems = data.reduce((m, s) => Math.max(m, s.num_items || 0), 1);

    // X axis: priority score (1-9). Y axis: log(total_spend). Radius: num_items.
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;

    const xScale = (p: number) => pad.left + ((p - 0.5) / 9) * innerW;
    // log scale for spend
    const logMax = Math.log10(max + 1);
    const yScale = (v: number) => pad.top + innerH - (Math.log10((v || 0) + 1) / logMax) * innerH;
    const rScale = (n: number) => 4 + (Math.sqrt(n / Math.max(1, maxItems)) * 22);

    const pts = data.map((s) => {
      const p = s.priority_score ?? 1;
      const v = Number(s.total_spend || 0);
      const n = s.num_items || 0;
      // jitter on x axis to prevent overlap on integer priorities
      const jitter = ((s.id.charCodeAt(0) % 21) - 10) / 10 * 0.35;
      return {
        s,
        x: xScale(p + jitter),
        y: yScale(v),
        r: rScale(n),
        color:
          (s.priority_score ?? 0) >= 7 ? 'rgba(220, 38, 38, 0.55)' :
          (s.priority_score ?? 0) >= 4 ? 'rgba(245, 158, 11, 0.55)' :
          'rgba(16, 185, 129, 0.55)',
        stroke:
          (s.priority_score ?? 0) >= 7 ? '#b91c1c' :
          (s.priority_score ?? 0) >= 4 ? '#b45309' : '#065f46',
      };
    });

    return { points: pts, maxSpend: max, height: h, padding: pad };
  }, [data, width]);

  const w = Math.max(width, 600);
  const innerH = height - padding.top - padding.bottom;
  const innerW = w - padding.left - padding.right;

  // Y axis ticks (log scale)
  const yTicks = [1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000].filter(v => v <= maxSpend * 1.5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supplier Risk Bubble Chart</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          แกน X = Priority Score (1=ต่ำ, 9=สูง) · แกน Y = Total Spend (log) · ขนาด bubble = จำนวน items
        </p>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="relative w-full overflow-x-auto">
          {loading ? (
            <div className="h-[420px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <svg width={w} height={height} className="block">
              {/* Background grid */}
              {yTicks.map((tick) => {
                const ratio = Math.log10(tick + 1) / Math.log10(maxSpend + 1);
                const y = padding.top + innerH - ratio * innerH;
                return (
                  <g key={tick}>
                    <line x1={padding.left} x2={padding.left + innerW} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="2 3" />
                    <text x={padding.left - 8} y={y + 3} fontSize="10" textAnchor="end" fill="#6b7280">฿{fmtTHB(tick)}</text>
                  </g>
                );
              })}
              {/* Vertical grid + x-axis priority labels */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => {
                const x = padding.left + ((p - 0.5) / 9) * innerW;
                return (
                  <g key={p}>
                    <line x1={x} x2={x} y1={padding.top} y2={padding.top + innerH} stroke="#f3f4f6" />
                    <text x={x} y={height - padding.bottom + 18} fontSize="10" textAnchor="middle" fill="#6b7280">P{p}</text>
                  </g>
                );
              })}

              {/* Axis labels */}
              <text x={padding.left + innerW / 2} y={height - 6} fontSize="11" textAnchor="middle" fill="#374151" fontWeight="500">Priority Score →</text>
              <text x={18} y={padding.top + innerH / 2} fontSize="11" textAnchor="middle" fill="#374151" fontWeight="500" transform={`rotate(-90 18 ${padding.top + innerH / 2})`}>Total Spend (log)</text>

              {/* Risk zone backdrop */}
              <rect
                x={padding.left + ((6.5) / 9) * innerW}
                y={padding.top}
                width={((9 - 6.5) / 9) * innerW}
                height={innerH}
                fill="rgba(220, 38, 38, 0.05)"
              />

              {/* Bubbles */}
              {points.map((p) => (
                <circle
                  key={p.s.id}
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={p.color}
                  stroke={p.stroke}
                  strokeWidth={1}
                  className="cursor-pointer transition-all hover:stroke-2"
                  onMouseEnter={() => setHover({ s: p.s, x: p.x, y: p.y })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}

              {/* Critical-zone label */}
              <text
                x={padding.left + ((7.75) / 9) * innerW}
                y={padding.top + 14}
                fontSize="10"
                textAnchor="middle"
                fill="#b91c1c"
                fontWeight="600"
              >
                Critical Zone
              </text>
            </svg>
          )}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 bg-popover border shadow-md rounded-md p-2 text-xs"
              style={{ left: Math.min(hover.x + 12, w - 280), top: Math.max(hover.y - 60, 0) }}
            >
              <p className="font-semibold truncate max-w-[260px]">{hover.s.company_name}</p>
              <p className="text-muted-foreground">Priority: P{hover.s.priority_score} · {hover.s.risk_label}</p>
              <p className="text-muted-foreground">Spend: ฿{fmtTHB(Number(hover.s.total_spend || 0))} · {hover.s.num_items} items</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
