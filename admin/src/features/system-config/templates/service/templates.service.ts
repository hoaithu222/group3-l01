import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type { UpdateTemplatePayload, WorkspaceTemplate } from '../types/templates.types';
import { templatesApi } from './templates.api';

/**
 * Service THUẦN. `update` tắt toast lỗi tự động: 409 `RES_003` (banner "Dữ liệu đã thay đổi") và 400
 * `VAL_001` (lỗi gắn đúng ô) có giao diện riêng — hook (`templates.queries.ts`) tự toast các lỗi còn lại.
 */
export const templatesService = {
  list: async (): Promise<ApiResponse<WorkspaceTemplate[]>> =>
    (await apiClient.get<ApiResponse<WorkspaceTemplate[]>>(templatesApi.list)).data,

  update: async (
    code: string,
    payload: UpdateTemplatePayload,
  ): Promise<ApiResponse<WorkspaceTemplate>> =>
    (
      await apiClient.put<ApiResponse<WorkspaceTemplate>>(templatesApi.detail(code), payload, {
        skipErrorToast: true,
      } as RequestConfig)
    ).data,
};
