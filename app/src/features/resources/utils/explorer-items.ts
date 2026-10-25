import { normalizeSearch } from '@/shared/utils/format/string.utils';

import type { FolderDto, ResourceDto, ResourceSort, SortOrder } from '../api';

/** Một ô trong danh sách hỗn hợp của FileExplorer — **thư mục trước, tệp sau**. */
export type ExplorerItem =
  | { key: string; kind: 'folder'; folder: FolderDto }
  | { key: string; kind: 'resource'; resource: ResourceDto };

/** Cờ `canModify` server tính của mục — nguồn DUY NHẤT cho Đổi tên/Di chuyển/Xoá (client không suy từ vai trò). */
export function canModifyItem(item: ExplorerItem): boolean {
  return item.kind === 'folder' ? item.folder.canModify : item.resource.canModify;
}

function compare<T extends number | string>(a: T, b: T): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Sắp thư mục theo cùng tiêu chí với tệp (BE chỉ sắp `children` theo tên).
 * Thư mục không có kích thước ⇒ `size` rơi về tên. So khớp tên BỎ DẤU (`normalizeSearch`)
 * chứ không `localeCompare` — Hermes cắt ICU nên thứ tự chữ có dấu khác nhau giữa hai máy.
 */
export function sortFolders(
  folders: readonly FolderDto[],
  sort: ResourceSort,
  order: SortOrder,
): FolderDto[] {
  const direction = order === 'asc' ? 1 : -1;
  const byName = (a: FolderDto, b: FolderDto) =>
    compare(normalizeSearch(a.name), normalizeSearch(b.name));
  const sorted = [...folders];
  if (sort === 'createdAt') {
    return sorted.sort((a, b) => direction * compare(a.createdAt, b.createdAt) || byName(a, b));
  }
  return sorted.sort((a, b) => (sort === 'name' ? direction : 1) * byName(a, b));
}

/** Gộp các trang cursor, bỏ trùng `id` (tệp mới chèn đầu trang + refetch có thể chồng lên nhau). */
export function flattenPages<T extends { id: string }>(pages: readonly { items: T[] }[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  pages.forEach((page) =>
    page.items.forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      result.push(item);
    }),
  );
  return result;
}

export function buildExplorerItems(input: {
  folders: readonly FolderDto[];
  order: SortOrder;
  resources: readonly ResourceDto[];
  sort: ResourceSort;
}): ExplorerItem[] {
  const folders = sortFolders(input.folders, input.sort, input.order).map<ExplorerItem>(
    (folder) => ({ key: `f:${folder.id}`, kind: 'folder', folder }),
  );
  const resources = input.resources.map<ExplorerItem>((resource) => ({
    key: `r:${resource.id}`,
    kind: 'resource',
    resource,
  }));
  return [...folders, ...resources];
}
