/**
 * @file useTableSort.ts
 * @description State + so sánh cho tính năng sắp xếp theo cột của kit2 `<Table>`.
 * Table chỉ render mũi tên trên header; hook này giữ trạng thái và trả về mảng
 * đã sort. Bảng cây dùng chung state của hook nhưng tự sort trong từng cấp.
 */

import { useCallback, useMemo, useState } from 'react';
import type { TableSortDir } from '@/shared/ui/data-display/table-parts';

/** Giá trị dùng để so sánh 1 ô. `null`/`undefined`/`''` luôn bị đẩy xuống cuối. */
export type TableSortValue = string | number | null | undefined;

/**
 * So sánh 2 giá trị ô theo chiều `dir`. Chuỗi so sánh theo locale vi (có dấu),
 * số so sánh theo trị số; ô rỗng luôn xuống cuối bất kể chiều sắp xếp.
 */
export function compareTableSortValues(
  a: TableSortValue,
  b: TableSortValue,
  dir: TableSortDir,
): number {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;

  const result =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'vi', { numeric: true, sensitivity: 'base' });

  return dir === 'asc' ? result : -result;
}

interface UseTableSortResult<TData> {
  sortKey: string | null;
  sortDir: TableSortDir | null;
  onSortChange: (key: string | null, dir: TableSortDir | null) => void;
  /** Mảng đã sắp xếp — giữ nguyên `rows` khi chưa chọn cột nào. */
  sorted: TData[];
  /** So sánh 2 dòng theo cột đang sort — cho bảng cây tự sort trong từng cấp. */
  comparator: ((a: TData, b: TData) => number) | null;
}

/**
 * @param rows Dữ liệu cần sắp xếp.
 * @param getValue Lấy giá trị so sánh của 1 dòng theo `key` của cột.
 */
export function useTableSort<TData>(
  rows: TData[],
  getValue: (row: TData, key: string) => TableSortValue,
): UseTableSortResult<TData> {
  const [sort, setSort] = useState<{ key: string; dir: TableSortDir } | null>(null);

  const onSortChange = useCallback((key: string | null, dir: TableSortDir | null) => {
    setSort(key && dir ? { key, dir } : null);
  }, []);

  const comparator = useMemo(() => {
    if (!sort) return null;
    return (a: TData, b: TData) =>
      compareTableSortValues(getValue(a, sort.key), getValue(b, sort.key), sort.dir);
  }, [sort, getValue]);

  // Không sort → trả nguyên mảng gốc (giữ thứ tự thủ công/kéo-thả).
  const sorted = useMemo(
    () => (comparator ? [...rows].sort(comparator) : rows),
    [rows, comparator],
  );

  return {
    sortKey: sort?.key ?? null,
    sortDir: sort?.dir ?? null,
    onSortChange,
    sorted,
    comparator,
  };
}
