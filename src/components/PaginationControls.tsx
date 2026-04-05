import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
}

export function PaginationControls({
  currentPage, totalPages, totalItems, hasNextPage, hasPrevPage, nextPage, prevPage, goToPage,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <p className="text-sm text-muted-foreground">
        {totalItems.toLocaleString()} items · Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={!hasPrevPage} onClick={prevPage}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        {getPageNumbers().map((page, i) =>
          page === '...' ? (
            <span key={`e${i}`} className="px-2 text-muted-foreground">…</span>
          ) : (
            <Button
              key={page}
              variant={page === currentPage ? 'default' : 'outline'}
              size="sm"
              className="min-w-[32px]"
              onClick={() => goToPage(page)}
            >
              {page}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" disabled={!hasNextPage} onClick={nextPage}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
