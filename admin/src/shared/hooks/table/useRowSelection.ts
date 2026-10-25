/**
 * @file useRowSelection.ts
 * @description State tick chọn nhiều dòng cho kit2 `<Table>` (cột checkbox +
 * checkbox "chọn tất cả" trên header). Tick chỉ tính trên các dòng ĐANG hiển
 * thị nên dòng bị lọc/xóa không lọt vào thao tác hàng loạt.
 */

import { useCallback, useMemo, useState } from 'react';

export function useRowSelection<T>(rows: T[], getId: (row: T) => number) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(getId(row))),
    [rows, selectedIds, getId],
  );

  const headerChecked = useMemo<boolean | 'indeterminate'>(() => {
    if (!selectedRows.length) return false;
    return selectedRows.length === rows.length ? true : 'indeterminate';
  }, [selectedRows.length, rows.length]);

  const toggleRow = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (checked: boolean) => setSelectedIds(checked ? new Set(rows.map(getId)) : new Set()),
    [rows, getId],
  );

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return { selectedIds, selectedRows, headerChecked, toggleRow, toggleAll, clear };
}
