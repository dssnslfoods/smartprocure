import { Badge } from '@/components/ui/badge';

const gradeColors: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-300',
  B: 'bg-blue-100 text-blue-800 border-blue-300',
  C: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  D: 'bg-red-100 text-red-800 border-red-300',
};

export function GradeBadge({ grade, score }: { grade: string; score?: number | null }) {
  return (
    <Badge className={`${gradeColors[grade] ?? 'bg-gray-100 text-gray-700'} border text-sm font-semibold`}>
      {grade}{score != null ? ` (${score.toFixed(1)}%)` : ''}
    </Badge>
  );
}
