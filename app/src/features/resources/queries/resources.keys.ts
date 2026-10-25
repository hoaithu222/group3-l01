import type {
  FolderRef,
  ResourceListParams,
  ResourceSort,
  ResourceType,
  ResourceUrlVariant,
  SortOrder,
} from '../api';

/**
 * Khoá query của feature `resources` (app.md p3-01 §4).
 *
 * ⚠️ Phần tử thứ 3 LUÔN là `wsId` (trừ `detail`/`url`/`text` theo `resourceId`)
 * — `useResourcesScope` dọn cache theo `queryKey[2] === wsId` khi mất quyền
 * workspace. Khoá KHÔNG theo khuôn `[domain, scopeType, scopeId]` của
 * `matchesScope()` nên xử lý chung của `core/permission` không dọn được chúng.
 */
export const resourceKeys = {
  all: ['resources'] as const,
  folder: (wsId: string, folderId: FolderRef) => ['resources', 'folder', wsId, folderId] as const,
  list: (wsId: string, params: ResourceListParams) => ['resources', 'list', wsId, params] as const,
  /** `sort`/`order` cũng ảnh hưởng kết quả tìm nên PHẢI nằm trong khoá (api-patterns: mọi tham số ảnh hưởng kết quả). */
  search: (
    wsId: string,
    q: string,
    type: ResourceType | undefined,
    sort: ResourceSort,
    order: SortOrder,
  ) => ['resources', 'search', wsId, q, type, sort, order] as const,
  detail: (resourceId: string) => ['resources', 'detail', resourceId] as const,
  trash: (wsId: string) => ['resources', 'trash', wsId] as const,
  storage: (wsId: string) => ['resources', 'storage', wsId] as const,
  url: (resourceId: string, variant: ResourceUrlVariant) =>
    ['resources', 'url', resourceId, variant] as const,
  text: (resourceId: string, version: number) =>
    ['resources', 'text', resourceId, version] as const,
};

/** Tiền tố các danh sách DUYỆT thư mục của một workspace. */
export function resourceListPrefix(wsId: string): readonly unknown[] {
  return ['resources', 'list', wsId];
}

/** Tiền tố các danh sách KẾT QUẢ TÌM của một workspace (cùng dạng `InfiniteData<ResourcePage>`). */
export function resourceSearchPrefix(wsId: string): readonly unknown[] {
  return ['resources', 'search', wsId];
}
