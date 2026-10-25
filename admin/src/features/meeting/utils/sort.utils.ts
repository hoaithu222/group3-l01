import type { TableSortDir } from '@/shared/ui';

/**
 * Sắp xếp phía SERVER cho hai bảng của phân hệ. BE nhận `sort` dạng `key` (tăng) / `-key` (giảm) và KHÔNG phải cột nào cũng có cả hai chiều
 * (vd `-attendeeCount` chỉ giảm) — `descOnly` khai các cột đó để bấm tiêu đề không bao giờ sinh ra giá trị BE từ chối (400 `VAL_001`).
 */
export interface SortSpec<K extends string> {
  keys: readonly K[];
  descOnly: readonly K[];
  defaultSort: { key: K; dir: TableSortDir };
}

export interface SortState<K extends string> {
  key: K;
  dir: TableSortDir;
}

/** `?sort=-attendeeCount` → khoá + chiều cho `Table`; thiếu/lạ → mặc định (URL do người dùng sửa được). */
export function parseSort<K extends string>(value: string, spec: SortSpec<K>): SortState<K> {
  const desc = value.startsWith('-');
  const key = (desc ? value.slice(1) : value) as K;
  if (!spec.keys.includes(key)) return { ...spec.defaultSort };
  if (!desc && spec.descOnly.includes(key)) return { ...spec.defaultSort };
  return { key, dir: desc ? 'desc' : 'asc' };
}

/** Giá trị `sort` gửi BE từ trạng thái sắp xếp đã kiểm (nơi gọi ép về kiểu `*SortValue` của bảng mình). */
export function toSortParam(state: SortState<string>): string {
  return state.dir === 'desc' ? `-${state.key}` : state.key;
}

/**
 * `Table.onSortChange` → giá trị `?sort=` kế tiếp (`null` = xoá khoá, về mặc định). Vòng của `Table` là asc → desc → bỏ:
 *  - cột chỉ có chiều giảm: lần bấm đầu (asc) đổi thành giảm dần, lần sau (desc) là "bỏ";
 *  - cột mặc định (đã hiện): "bỏ" trùng chính nó nên lật sang asc thay vì đứng yên — nếu không người dùng không tới được thứ tự cũ → mới.
 * Khoá lạ (cột không sắp được) → `null`.
 */
export function nextSortValue<K extends string>(
  current: SortState<K>,
  key: string | null,
  dir: TableSortDir | null,
  spec: SortSpec<K>,
): string | null {
  const atDefault = current.key === spec.defaultSort.key && current.dir === spec.defaultSort.dir;
  if (key === null || dir === null) {
    return atDefault ? String(spec.defaultSort.key) : null;
  }
  if (!spec.keys.includes(key as K)) return null;
  const effectiveDir: TableSortDir = spec.descOnly.includes(key as K) ? 'desc' : dir;
  if (key === spec.defaultSort.key && effectiveDir === spec.defaultSort.dir) return null;
  return effectiveDir === 'desc' ? `-${key}` : key;
}
