import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  resourcePath,
  resourceRestorePath,
  resourceUrlPath,
  workspacePath,
  workspaceResourcesPath,
  workspaceStoragePath,
  workspaceTrashItemPath,
  workspaceTrashPath,
} from './resources.api';
import type {
  CreateResourcePayload,
  CursorMeta,
  ResourceDetailDto,
  ResourceDto,
  ResourceListParams,
  ResourcePage,
  ResourceUrlDto,
  ResourceUrlVariant,
  StorageUsageDto,
  TrashPage,
  UpdateResourcePayload,
  WorkspaceAccess,
} from './resources.types';

/** Ngưỡng tối thiểu của `q` — BE `listResourcesQuery.q.min(2)`. */
export const MIN_SEARCH_LENGTH = 2;

export const resourcesService = {
  /**
   * Đọc THẲNG `response.data` (không qua `unwrapData`) để giữ `meta` cursor.
   * ⚠️ `q` có → BE tìm toàn workspace và BỎ QUA `folderId`, nên không gửi cả hai.
   */
  async list(
    workspaceId: string,
    params: ResourceListParams,
    cursor: string | undefined,
    limit: number,
  ): Promise<ResourcePage> {
    const q = params.q?.trim();
    const searching = Boolean(q && q.length >= MIN_SEARCH_LENGTH);
    const response = await apiClient.get<{ data: ResourceDto[]; meta: CursorMeta }>(
      workspaceResourcesPath(workspaceId),
      {
        params: {
          ...(searching ? { q } : { folderId: params.folderId ?? 'root' }),
          type: params.type,
          sort: params.sort,
          order: params.order,
          cursor,
          limit,
        },
      },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /** `Idempotency-Key` sinh 1 lần/tệp (be.md §4 `idempotencyKey("resource-create")`). */
  async create(
    workspaceId: string,
    payload: CreateResourcePayload,
    idempotencyKey: string,
  ): Promise<ResourceDto> {
    const response = await apiClient.post<ResourceDto>(
      workspaceResourcesPath(workspaceId),
      payload,
      { headers: { 'Idempotency-Key': idempotencyKey }, skipErrorToast: true },
    );
    return unwrapData<ResourceDto>(response);
  },

  async get(resourceId: string): Promise<ResourceDetailDto> {
    const response = await apiClient.get<ResourceDetailDto>(resourcePath(resourceId));
    return unwrapData<ResourceDetailDto>(response);
  },

  async update(resourceId: string, payload: UpdateResourcePayload): Promise<ResourceDto> {
    const response = await apiClient.patch<ResourceDto>(resourcePath(resourceId), payload, {
      skipErrorToast: true,
    });
    return unwrapData<ResourceDto>(response);
  },

  async remove(resourceId: string): Promise<void> {
    await apiClient.delete(resourcePath(resourceId));
  },

  async restore(resourceId: string): Promise<ResourceDto> {
    const response = await apiClient.post<ResourceDto>(resourceRestorePath(resourceId), undefined, {
      skipErrorToast: true,
    });
    return unwrapData<ResourceDto>(response);
  },

  /** URL ký ≤ 60 s — KHÔNG cache lâu, xem `useResourceUrl`. */
  async url(resourceId: string, variant: ResourceUrlVariant = 'original'): Promise<ResourceUrlDto> {
    const response = await apiClient.get<ResourceUrlDto>(resourceUrlPath(resourceId), {
      params: { variant },
      skipErrorToast: true,
    });
    return unwrapData<ResourceUrlDto>(response);
  },

  /**
   * `data: { folders, resources }` + `meta` cursor cùng cấp `data` (BE luôn trả cả hai).
   * Đọc thẳng `response.data` vì cần cả `meta`.
   */
  async trash(workspaceId: string, cursor: string | undefined): Promise<TrashPage> {
    const response = await apiClient.get<{
      data: Pick<TrashPage, 'folders' | 'resources'>;
      meta: CursorMeta;
    }>(workspaceTrashPath(workspaceId), { params: { cursor } });
    return { ...response.data.data, meta: response.data.meta };
  },

  /** Xoá vĩnh viễn ngay — chỉ OWNER/ADMIN (be.md §4), có audit. */
  async purge(workspaceId: string, resourceId: string): Promise<void> {
    await apiClient.delete(workspaceTrashItemPath(workspaceId, resourceId));
  },

  /** Chỉ OWNER/ADMIN — MEMBER gọi sẽ 403, nên nơi gọi PHẢI `enabled` theo vai trò. */
  async storage(workspaceId: string): Promise<StorageUsageDto> {
    const response = await apiClient.get<StorageUsageDto>(workspaceStoragePath(workspaceId), {
      skipErrorToast: true,
    });
    return unwrapData<StorageUsageDto>(response);
  },

  async workspaceAccess(workspaceId: string): Promise<WorkspaceAccess> {
    const response = await apiClient.get<WorkspaceAccess>(workspacePath(workspaceId), {
      skipErrorToast: true,
    });
    return unwrapData<WorkspaceAccess>(response);
  },
};
