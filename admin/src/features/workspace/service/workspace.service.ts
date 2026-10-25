import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import { WORKSPACE_OPTIONS_PAGE_SIZE } from '../constants/workspace.constants';
import type {
  AdminWorkspaceDetail,
  AdminWorkspaceRow,
  OwnerOption,
  OwnerOptionsPage,
  ReasonPayload,
  RemoveWorkspaceImagePayload,
  RemoveWorkspaceImageResult,
  WorkspaceListParams,
  WorkspaceOptionsPage,
  WorkspaceStatDay,
  WorkspaceStatsRange,
} from '../types/workspace.types';
import { workspaceApi } from './workspace.api';

/** Service THUẦN (async, không React) — hook React Query gọi qua đây. */
export const workspaceService = {
  list: async (params: WorkspaceListParams): Promise<ApiResponse<AdminWorkspaceRow[]>> =>
    (await apiClient.get<ApiResponse<AdminWorkspaceRow[]>>(workspaceApi.list, { params })).data,

  /**
   * Gợi ý cho ô chọn workspace: tìm theo tên (BE `?q=`, sắp theo tên) từng trang `WORKSPACE_OPTIONS_PAGE_SIZE` — KHÔNG
   * tải hết một lượt rồi lọc tại chỗ (danh bạ có thể vượt trang đầu). Tắt toast lỗi tự động: thiếu `workspace:view`
   * (403) chỉ làm danh sách gợi ý báo lỗi tại chỗ, không đáng làm phiền cả trang đang xem.
   */
  searchOptions: async (q: string, page: number): Promise<WorkspaceOptionsPage> => {
    const res = await apiClient.get<ApiResponse<AdminWorkspaceRow[]>>(workspaceApi.list, {
      params: { q: q || undefined, page, limit: WORKSPACE_OPTIONS_PAGE_SIZE, sort: 'name' },
      skipErrorToast: true,
    } as RequestConfig);
    return {
      items: res.data.data.map(({ id, name }) => ({ id, name })),
      page,
      hasNext: res.data.meta?.hasNext ?? false,
    };
  },

  /**
   * Gợi ý cho ô lọc chủ sở hữu: tìm người dùng theo `q` (BE khớp tên/email, `q` rỗng thì KHÔNG gửi — BE đòi ≥ 1 ký tự)
   * từng trang `WORKSPACE_OPTIONS_PAGE_SIZE`. Tắt toast lỗi tự động: thiếu `user:view` (403) chỉ làm hộp gợi ý báo lỗi tại chỗ.
   */
  searchOwnerOptions: async (q: string, page: number): Promise<OwnerOptionsPage> => {
    const res = await apiClient.get<ApiResponse<OwnerOption[]>>(workspaceApi.owners, {
      params: { q: q || undefined, page, limit: WORKSPACE_OPTIONS_PAGE_SIZE },
      skipErrorToast: true,
    } as RequestConfig);
    return {
      items: res.data.data.map(({ id, name, email }) => ({ id, name, email })),
      page,
      hasNext: res.data.meta?.hasNext ?? false,
    };
  },

  detail: async (id: string): Promise<ApiResponse<AdminWorkspaceDetail>> =>
    (await apiClient.get<ApiResponse<AdminWorkspaceDetail>>(workspaceApi.detail(id))).data,

  stats: async (id: string, range: WorkspaceStatsRange): Promise<ApiResponse<WorkspaceStatDay[]>> =>
    (
      await apiClient.get<ApiResponse<WorkspaceStatDay[]>>(workspaceApi.stats(id), {
        params: { range },
      })
    ).data,

  // BE trả `Workspace` thô (không phải `AdminWorkspaceRow`) cho 2 endpoint này —
  // nơi gọi chỉ cần biết THÀNH CÔNG rồi tự invalidate `detail`/`list`, không
  // dùng trực tiếp `data` trả về (giống `useLockUser`/`useUnlockUser` bên `user`).
  archive: async ({ id, reason }: { id: string } & ReasonPayload): Promise<ApiResponse<unknown>> =>
    (await apiClient.post<ApiResponse<unknown>>(workspaceApi.archive(id), { reason })).data,

  restore: async ({ id, reason }: { id: string } & ReasonPayload): Promise<ApiResponse<unknown>> =>
    (await apiClient.post<ApiResponse<unknown>>(workspaceApi.restore(id), { reason })).data,

  /** Gỡ ảnh vi phạm — BE trả `AdminWorkspaceRow` mới (URL ảnh đã bỏ) kèm `removed`. */
  removeImage: async ({
    id,
    kind,
    reason,
  }: { id: string } & RemoveWorkspaceImagePayload): Promise<ApiResponse<RemoveWorkspaceImageResult>> =>
    (
      await apiClient.post<ApiResponse<RemoveWorkspaceImageResult>>(workspaceApi.removeImage(id), {
        kind,
        reason,
      })
    ).data,
};
