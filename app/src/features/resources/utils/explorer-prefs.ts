import type { ResourceSort, SortOrder } from '../api';

export type ViewMode = 'grid' | 'list';

export interface ExplorerPrefs {
  order: SortOrder;
  sort: ResourceSort;
  view: ViewMode;
}

export const DEFAULT_PREFS: ExplorerPrefs = { order: 'desc', sort: 'createdAt', view: 'grid' };

/** Khoá `AsyncStorage` theo NGƯỜI DÙNG (app.md §5) — máy dùng chung không lẫn tuỳ chọn. */
export function prefsStorageKey(userId: string): string {
  return `resources:view:${userId}`;
}

export interface SortOption {
  key: string;
  label: string;
  order: SortOrder;
  sort: ResourceSort;
}

export const SORT_OPTIONS: readonly SortOption[] = [
  { key: 'createdAt:desc', label: 'Mới nhất', order: 'desc', sort: 'createdAt' },
  { key: 'createdAt:asc', label: 'Cũ nhất', order: 'asc', sort: 'createdAt' },
  { key: 'name:asc', label: 'Tên A → Z', order: 'asc', sort: 'name' },
  { key: 'name:desc', label: 'Tên Z → A', order: 'desc', sort: 'name' },
  { key: 'size:desc', label: 'Lớn nhất', order: 'desc', sort: 'size' },
  { key: 'size:asc', label: 'Nhỏ nhất', order: 'asc', sort: 'size' },
];

export function sortKeyOf(prefs: Pick<ExplorerPrefs, 'order' | 'sort'>): string {
  return `${prefs.sort}:${prefs.order}`;
}

export function sortLabelOf(prefs: Pick<ExplorerPrefs, 'order' | 'sort'>): string {
  return SORT_OPTIONS.find((option) => option.key === sortKeyOf(prefs))?.label ?? 'Mới nhất';
}

/**
 * Đọc tuỳ chọn đã lưu, VALIDATE từng trường: dữ liệu `AsyncStorage` có thể do
 * bản app cũ ghi hoặc bị cắt dở — trường sai rơi về mặc định thay vì để
 * `sort: 'x'` lọt vào query (BE trả 400 và danh sách trống không rõ lý do).
 */
export function parsePrefs(raw: unknown): ExplorerPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
  const value = raw as Record<string, unknown>;
  const option = SORT_OPTIONS.find((o) => o.sort === value.sort && o.order === value.order);
  return {
    order: option?.order ?? DEFAULT_PREFS.order,
    sort: option?.sort ?? DEFAULT_PREFS.sort,
    view: value.view === 'list' || value.view === 'grid' ? value.view : DEFAULT_PREFS.view,
  };
}
