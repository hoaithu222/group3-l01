/**
 * @file table-header-groups.ts
 * @description Gom cột thành các ô của TẦNG HEADER TRÊN cho `Table`. Để riêng
 *  file `.ts` (không JSX) vì Fast Refresh chỉ chạy khi file `.tsx` thuần export
 *  component — xem `clean-code-standards.md §5`.
 */

import type { TableColumn } from './table-parts';

/** 1 ô của tầng trên: nhóm nhiều cột (`colSpan`) hoặc cột lẻ trải 2 tầng (`rowSpan`). */
export interface HeaderGroupSpan {
  key: string;
  label?: React.ReactNode;
  /** Vị trí cột đầu của nhóm trong mảng `columns`. */
  start: number;
  span: number;
  /** `false` = cột lẻ không thuộc nhóm nào → trải dọc 2 tầng. */
  grouped: boolean;
}

/**
 * Trả `null` khi KHÔNG cột nào khai `group` — dấu hiệu để `Table` giữ nguyên
 * header 1 dòng, nhờ vậy mọi bảng đang chạy không đổi gì.
 */
export function buildHeaderGroups<TData>(columns: TableColumn<TData>[]): HeaderGroupSpan[] | null {
  if (!columns.some((col) => col.group)) return null;

  const spans: HeaderGroupSpan[] = [];
  columns.forEach((col, index) => {
    const last = spans[spans.length - 1];
    // Chỉ nối vào nhóm liền kề — `spans` dựng theo thứ tự cột nên tính liên tiếp
    // được bảo đảm sẵn.
    if (col.group && last?.grouped && last.key === col.group.key) {
      last.span += 1;
      return;
    }
    spans.push(
      col.group
        ? { key: col.group.key, label: col.group.label, start: index, span: 1, grouped: true }
        : { key: `solo:${col.key}`, start: index, span: 1, grouped: false },
    );
  });

  return spans;
}
