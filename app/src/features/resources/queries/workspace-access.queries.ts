import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/shell/store/slices/auth';

import { resourcesService } from '../api';
import {
  resolveExplorerCapabilities,
  type ExplorerCapabilities,
} from '../utils/resource-permissions';
import { resourceKeys } from './resources.keys';

/**
 * Trạng thái workspace của tôi (`status`; `myRole` chỉ để `ResourcesHubCard` ẩn thẻ với GUEST).
 *
 * ⚠️ Khoá CỐ Ý trùng `['workspaces', 'detail', wsId]` — đúng khoá
 * `workspaces/queries/workspaces.keys.ts#detail()` — cùng kỹ thuật
 * `channels/useCanCreateChannel`: hai bên gọi CÙNG endpoint `GET /workspaces/:id`
 * nên dùng chung một bản cache THẬT (ghi tay thay vì import, `feature-structure.md`
 * cấm import chéo feature).
 */
export function useWorkspaceAccess(wsId: string) {
  return useQuery({
    queryKey: ['workspaces', 'detail', wsId],
    queryFn: () => resourcesService.workspaceAccess(wsId),
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

export interface ExplorerAccess {
  capabilities: ExplorerCapabilities;
  isLoading: boolean;
  userId: string | undefined;
}

/**
 * Quyền cấp KHO (chỉ theo `status` workspace). Quyền theo MỤC đọc thẳng cờ BE trả
 * (`canModify`, `canRestore`, `canPurge`) — không còn suy từ `myRole` + chủ sở hữu.
 */
export function useExplorerAccess(wsId: string): ExplorerAccess {
  const { data, isLoading } = useWorkspaceAccess(wsId);
  const userId = useAuthStore((state) => state.user?.id);

  return {
    capabilities: resolveExplorerCapabilities(data?.status),
    isLoading,
    userId,
  };
}

/**
 * Dung lượng kho — BE chỉ cho `resource.delete` (OWNER/ADMIN): MEMBER nhận 403. BE không
 * có cờ "được xem dung lượng", nên đây là THĂM DÒ dựa vào chính phản hồi của BE thay vì
 * đoán theo vai trò: 200 ⇒ hiện banner, 403/404 ⇒ im lặng (không toast — `skipErrorToast`).
 *
 * Để MEMBER không phải nhận 403 lặp lại: `retry`/`retryOnMount`/`refetchOnWindowFocus`
 * tắt — lỗi được nhớ tới khi cache bị làm cũ (upload/xoá/khôi phục đều `invalidate` khoá này).
 */
export function useStorageUsage(wsId: string, enabled: boolean) {
  return useQuery({
    queryKey: resourceKeys.storage(wsId),
    queryFn: () => resourcesService.storage(wsId),
    enabled: enabled && Boolean(wsId),
    refetchOnWindowFocus: false,
    retry: false,
    retryOnMount: false,
    staleTime: 30_000,
  });
}
