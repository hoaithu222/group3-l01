import type { InfiniteData } from '@tanstack/react-query';

import type { ResourceDto, ResourceListParams, ResourcePage } from '../api';

/**
 * Biến đổi THUẦN trên `InfiniteData<ResourcePage>` — để `setQueryData` không
 * phải viết tay ở từng mutation (và test được không cần `QueryClient`).
 */
type Pages = InfiniteData<ResourcePage, string | undefined> | undefined;

export function prependResource(data: Pages, resource: ResourceDto): Pages {
  if (!data) return data;
  if (data.pages.some((page) => page.items.some((item) => item.id === resource.id))) return data;
  const [first, ...rest] = data.pages;
  if (!first) return data;
  return { ...data, pages: [{ ...first, items: [resource, ...first.items] }, ...rest] };
}

export function removeResourceFromPages(data: Pages, resourceId: string): Pages {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== resourceId),
    })),
  };
}

export function replaceResourceInPages(data: Pages, resource: ResourceDto): Pages {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === resource.id ? resource : item)),
    })),
  };
}

/**
 * Tệp MỚI tải lên có nên chèn thẳng vào đầu danh sách này không.
 *
 * Chỉ khi thứ tự đúng là "mới nhất trước" (`createdAt desc`) và danh sách không
 * phải kết quả tìm — sắp theo tên/kích thước thì vị trí đúng phụ thuộc cả trang
 * (và các trang chưa tải), nên để refetch quyết định thay vì đoán sai chỗ.
 */
export function listAcceptsNewResource(params: ResourceListParams, resource: ResourceDto): boolean {
  if (params.q) return false;
  if (params.sort !== 'createdAt' || params.order !== 'desc') return false;
  if (params.type && params.type !== resource.type) return false;
  return (params.folderId ?? 'root') === (resource.folderId ?? 'root');
}
