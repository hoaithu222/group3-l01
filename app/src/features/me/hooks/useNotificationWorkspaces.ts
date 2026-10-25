import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

export interface NotificationWorkspace {
  id: string;
  name: string;
}

/**
 * Nhóm làm việc của tôi cho khối "Theo nhóm làm việc" của màn Thông báo (p1-07 `app.md` §3: `NotifyModeSheet` dùng chung
 * cho nhóm làm việc). Gọi THẲNG `GET /workspaces` — `me` không được import feature `workspaces` (`feature-structure.md`),
 * cùng mẫu `discoveryService.listWorkspaces`. Lỗi không toast: khối này phụ, màn vẫn dùng được.
 */
export function useNotificationWorkspaces() {
  return useQuery({
    queryFn: async () => {
      const response = await apiClient.get<NotificationWorkspace[]>('/workspaces', {
        params: { status: 'ACTIVE' },
        skipErrorToast: true,
      });
      return unwrapData<NotificationWorkspace[]>(response).map(({ id, name }) => ({ id, name }));
    },
    queryKey: ['notifications', 'workspaces'],
    // 0: nhóm của tôi đổi ở feature KHÁC (tham gia/rời/đổi tên) mà không ai làm mới khoá riêng này — mở màn là tải lại nền.
    staleTime: 0,
  });
}
