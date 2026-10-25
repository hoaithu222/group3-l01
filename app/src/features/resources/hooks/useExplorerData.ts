import { isAxiosError } from 'axios';
import { useMemo } from 'react';

import {
  MIN_SEARCH_LENGTH,
  ROOT_FOLDER,
  type FolderDto,
  type FolderRef,
  type ResourceType,
} from '../api';
import { useFolderQuery } from '../queries/folder.queries';
import { useResourcesInfinite } from '../queries/resources.queries';
import { buildBreadcrumb, type BreadcrumbSegment } from '../utils/breadcrumb';
import { buildExplorerItems, flattenPages, type ExplorerItem } from '../utils/explorer-items';
import type { ExplorerPrefs } from '../utils/explorer-prefs';

export interface ExplorerData {
  breadcrumb: BreadcrumbSegment[];
  currentFolder: FolderDto | undefined;
  error: unknown;
  fetchNextPage: () => void;
  /** 404 — thư mục không tồn tại / không còn quyền (BE trả trung tính). */
  forbidden: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  isRefetching: boolean;
  items: ExplorerItem[];
  refetch: () => void;
  /** Đang xem kết quả tìm toàn workspace (không có thư mục con, có đường dẫn). */
  searching: boolean;
}

/**
 * Gộp dữ liệu FileExplorer: khung thư mục (breadcrumb + thư mục con) + tệp phân
 * trang → MỘT danh sách hỗn hợp **thư mục trước, tệp sau** (app.md p3-01 §3).
 *
 * Tìm (`q` ≥ 2 ký tự) trải TOÀN workspace và chỉ trả tệp (BE `GET /resources?q`),
 * nên khi đó bỏ thư mục con và không chờ khung thư mục. Lỗi 404 của MỘT trong
 * hai truy vấn ⇒ `forbidden` (không phân biệt "không có" với "không được xem").
 */
export function useExplorerData(input: {
  folderId: FolderRef;
  prefs: Pick<ExplorerPrefs, 'order' | 'sort'>;
  query: string;
  typeFilter: ResourceType | 'ALL';
  wsId: string;
}): ExplorerData {
  const { folderId, prefs, query, typeFilter, wsId } = input;
  const searching = query.trim().length >= MIN_SEARCH_LENGTH;

  const folderQuery = useFolderQuery(wsId, folderId);
  const listQuery = useResourcesInfinite(wsId, {
    folderId,
    order: prefs.order,
    q: query,
    sort: prefs.sort,
    type: typeFilter === 'ALL' ? undefined : typeFilter,
  });

  const resources = useMemo(() => flattenPages(listQuery.data?.pages ?? []), [listQuery.data]);
  const folders = folderQuery.data?.children;
  const items = useMemo(
    () =>
      buildExplorerItems({
        folders: searching ? [] : (folders ?? []),
        order: prefs.order,
        resources,
        sort: prefs.sort,
      }),
    [folders, prefs.order, prefs.sort, resources, searching],
  );

  const error = (searching ? undefined : folderQuery.error) ?? listQuery.error;
  const forbidden = isAxiosError(error) && error.response?.status === 404;

  return {
    breadcrumb: buildBreadcrumb(folderId === ROOT_FOLDER ? undefined : folderQuery.data),
    currentFolder: folderQuery.data?.folder,
    error,
    fetchNextPage: () => void listQuery.fetchNextPage(),
    forbidden,
    hasNextPage: listQuery.hasNextPage,
    isFetchingNextPage: listQuery.isFetchingNextPage,
    isLoading: (!searching && folderQuery.isLoading) || listQuery.isLoading,
    isRefetching: folderQuery.isRefetching || listQuery.isRefetching,
    items,
    refetch: () => {
      if (!searching) void folderQuery.refetch();
      void listQuery.refetch();
    },
    searching,
  };
}
