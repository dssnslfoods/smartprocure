import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types/procurement';

const config: Record<RiskLevel, { label: string; className: string }> = {
  low:      { label: 'Low Risk',      className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  medium:   { label: 'Medium Risk',   className: 'bg-yellow-500/10 text-yellow-700 border-yellow-200' },
  high:     { label: 'High Risk',     className: 'bg-orange-500/10 text-orange-700 border-orange-200' },
  critical: { label: 'Critical Risk', className: 'bg-red-500/10 text-red-700 border-red-200' },
};

interface Props {
  level: RiskLevel | null | undefined;
  score?: number | null;
  size?: 'sm' | 'md';
}

export default function RiskBadge({ level, score, size = 'sm' }: Props) {
  const l = level ?? 'low';
  const { label, className } = config[l];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        className
      )}
    >
      <span className={cn(
        'rounded-full shrink-0',
        size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
        l === 'low'      && 'bg-emerald-500',
        l === 'medium'   && 'bg-yellow-500',
        l === 'high'     && 'bg-orange-500',
        l === 'critical' && 'bg-red-500',
      )} />
      {label}
      {score != null && <span className="opacity-70">({score.toFixed(0)})</span>}
    </span>
  );
}

export function SupplierTypeBadge({ type }: { type: string | null | undefined }) {
  const map: Record<string, string> = {
    approved:  'bg-emerald-500/10 text-emerald-700',
    new:       'bg-blue-500/10 text-blue-700',
    nominated: 'bg-purple-500/10 text-purple-700',
    critical:  'bg-orange-500/10 text-orange-700',
    blocked:   'bg-red-500/10 text-red-700',
  };
  const t = type ?? 'new';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-transparent', map[t] ?? map.new)}>
      {t.charAt(0).toUpperCase() + t.slice(1)}
    </span>
  );
}

export function EligibilityBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; className: string }> = {
    eligible:             { label: 'Eligible',            className: 'bg-emerald-500/10 text-emerald-700' },
    warning:              { label: 'Warning',              className: 'bg-yellow-500/10 text-yellow-700' },
    blocked:              { label: 'Blocked',              className: 'bg-red-500/10 text-red-700' },
    requires_qa:          { label: 'Needs QA',             className: 'bg-orange-500/10 text-orange-700' },
    requires_nomination:  { label: 'Needs Nomination',     className: 'bg-purple-500/10 text-purple-700' },
  };
  const s = status ?? 'eligible';
  const cfg = map[s] ?? map.eligible;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cfg.className)}>
      {cfg.label}
    </span>
  );
}
