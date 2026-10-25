import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { ResourceDto, ResourceListParams, ResourcePage } from '../api';
import {
  listAcceptsNewResource,
  prependResource,
  removeResourceFromPages,
  replaceResourceInPages,
} from '../utils/resource-pages';
import { resourceKeys, resourceListPrefix, resourceSearchPrefix } from './resources.keys';

type ListData = InfiniteData<ResourcePage, string | undefined>;

/** Mọi danh sách tệp của workspace: duyệt thư mục (`list`) lẫn kết quả tìm (`search`). */
function listEntries(queryClient: QueryClient, wsId: string) {
  return [
    ...queryClient.getQueriesData<ListData>({ queryKey: resourceListPrefix(wsId) }),
    ...queryClient.getQueriesData<ListData>({ queryKey: resourceSearchPrefix(wsId) }),
  ];
}

/** Chỉ khoá `list` mang `ResourceListParams` ở vị trí 3; khoá `search` (q, type, sort, order) thì không. */
function paramsOf(key: QueryKey): ResourceListParams | undefined {
  return key[1] === 'list' ? (key[3] as ResourceListParams | undefined) : undefined;
}

/**
 * Tệp VỪA tạo (upload xong) → chèn đầu các danh sách đang mở đúng thư mục,
 * danh sách khác (đang sắp theo tên/kích thước, lọc loại khác, kết quả tìm) chỉ
 * đánh dấu cũ để refetch. Hạn mức dùng cũng đổi ⇒ làm cũ `storage`.
 */
export function insertCreatedResource(
  queryClient: QueryClient,
  wsId: string,
  resource: ResourceDto,
): void {
  listEntries(queryClient, wsId).forEach(([key, data]) => {
    const params = paramsOf(key);
    if (params && listAcceptsNewResource(params, resource)) {
      queryClient.setQueryData<ListData>(key, prependResource(data, resource));
    } else {
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
    }
  });
  queryClient.setQueryData(resourceKeys.detail(resource.id), resource);
  void queryClient.invalidateQueries({ queryKey: resourceKeys.storage(wsId) });
}

/** Gỡ một tệp khỏi MỌI danh sách của workspace (xoá mềm / chuyển thư mục) — trả bản trước để hoàn tác. */
export function removeResourceFromLists(
  queryClient: QueryClient,
  wsId: string,
  resourceId: string,
): [QueryKey, ListData | undefined][] {
  const snapshot = listEntries(queryClient, wsId);
  snapshot.forEach(([key, data]) =>
    queryClient.setQueryData<ListData>(key, removeResourceFromPages(data, resourceId)),
  );
  return snapshot;
}

export function restoreListSnapshot(
  queryClient: QueryClient,
  snapshot: readonly [QueryKey, ListData | undefined][],
): void {
  snapshot.forEach(([key, data]) => queryClient.setQueryData<ListData>(key, data));
}

/** Cập nhật một tệp tại chỗ (đổi tên…) ở MỌI danh sách + chi tiết. */
export function replaceResourceInLists(
  queryClient: QueryClient,
  wsId: string,
  resource: ResourceDto,
): void {
  listEntries(queryClient, wsId).forEach(([key, data]) =>
    queryClient.setQueryData<ListData>(key, replaceResourceInPages(data, resource)),
  );
  queryClient.setQueryData(resourceKeys.detail(resource.id), resource);
}

/** Làm cũ mọi danh sách + cây thư mục + thùng rác + hạn mức của workspace (sau khôi phục, di chuyển…). */
export function invalidateWorkspaceResources(queryClient: QueryClient, wsId: string): void {
  void queryClient.invalidateQueries({
    queryKey: resourceKeys.all,
    predicate: (query) => query.queryKey[2] === wsId,
  });
}
