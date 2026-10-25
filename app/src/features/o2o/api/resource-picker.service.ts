import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import type { CursorMeta } from './o2o.types';

/**
 * Tra cứu tài liệu PDF của nhóm để CHỌN in ("Từ tài liệu nhóm", app.md §3). Đọc THẲNG endpoint của Resource Hub bằng service của feature này — luật "không
 * import chéo feature" (`feature-structure.md`) cấm dùng `features/resources`. Hai endpoint, đều chỉ ĐỌC, quyền do BE kiểm (`workspace.resource.read`):
 *  · `GET /workspaces?status=ACTIVE` — nhóm của tôi;
 *  · `GET /workspaces/:id/resources?type=PDF` — `q` (≥ 2 ký tự) tìm cả nhóm; không có `q` chỉ liệt kê thư mục GỐC (BE bỏ qua `folderId` khi có `q`).
 * Snapshot tệp lúc tạo đơn là việc của BE (`resolveSource`): đơn giữ asset HIỆN TẠI của tài liệu, đổi phiên bản sau đó không đổi đơn.
 */
export interface PickableWorkspace {
  id: string;
  name: string;
}

export interface PickableResource {
  id: string;
  name: string;
  size: number;
}

export interface PickablePage {
  items: PickableResource[];
  meta: CursorMeta;
}

export const PICKER_PAGE_SIZE = 30;
/** Ngưỡng tối thiểu của `q` — BE `listResourcesQuery.q.min(2)`; ngắn hơn là 400. */
export const PICKER_MIN_QUERY = 2;

export const resourcePickerService = {
  async workspaces(): Promise<PickableWorkspace[]> {
    const response = await apiClient.get('/workspaces', {
      params: { status: 'ACTIVE' },
      skipErrorToast: true,
    });
    return unwrapData<PickableWorkspace[]>(response).map(({ id, name }) => ({ id, name }));
  },

  /** Đọc THẲNG `response.data` để giữ `meta` cursor. */
  async pdfs(
    workspaceId: string,
    query: string,
    cursor: string | undefined,
  ): Promise<PickablePage> {
    const q = query.trim();
    const searching = q.length >= PICKER_MIN_QUERY;
    const response = await apiClient.get<{
      data: (PickableResource & Record<string, unknown>)[];
      meta: CursorMeta;
    }>(`/workspaces/${workspaceId}/resources`, {
      params: {
        type: 'PDF',
        ...(searching ? { q } : { folderId: 'root' }),
        sort: 'name',
        order: 'asc',
        cursor,
        limit: PICKER_PAGE_SIZE,
      },
      skipErrorToast: true,
    });
    return {
      items: response.data.data.map(({ id, name, size }) => ({ id, name, size })),
      meta: response.data.meta,
    };
  },
};
