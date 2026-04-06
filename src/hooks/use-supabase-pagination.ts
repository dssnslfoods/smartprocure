import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseSupabasePaginationOptions {
  pageSize?: number;
  tableName: string;
  select?: string;
  orderColumn?: string;
  orderAscending?: boolean;
  filters?: (query: any) => any;
}

export function useSupabasePagination<T>(options: UseSupabasePaginationOptions) {
  const {
    pageSize = 20,
    tableName,
    select = '*',
    orderColumn = 'created_at',
    orderAscending = false,
    filters,
  } = options;

  const [items, setItems] = useState<T[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // Calculate range
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    // 1. Get total count with filters applied
    let countQuery = supabase
      .from(tableName as any)
      .select('*', { count: 'exact', head: true });
    
    if (filters) {
      countQuery = filters(countQuery);
    }
    
    const { count } = await countQuery;
    setTotalItems(count || 0);

    // 2. Get data for current page
    let dataQuery = supabase
      .from(tableName as any)
      .select(select)
      .order(orderColumn, { ascending: orderAscending })
      .range(from, to);

    if (filters) {
      dataQuery = filters(dataQuery);
    }

    const { data, error } = await dataQuery;
    
    if (error) {
      console.error(`Error fetching ${tableName}:`, error);
    } else {
      setItems((data as unknown as T[]) || []);
    }
    
    setLoading(false);
  }, [tableName, select, orderColumn, orderAscending, currentPage, pageSize, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return {
    items,
    paginatedItems: items, // for compatibility
    totalItems,
    totalPages,
    currentPage,
    loading,
    goToPage,
    nextPage: () => goToPage(currentPage + 1),
    prevPage: () => goToPage(currentPage - 1),
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    refresh: fetchData,
  };
}
