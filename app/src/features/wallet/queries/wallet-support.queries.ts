import { useQuery } from '@tanstack/react-query';

import { walletSupportService } from '../api';
import { walletKeys } from './wallet.keys';

/**
 * Vai trò của tôi trong nhóm — quyết định GUEST bị ẩn ví.
 *
 * ⚠️ Khoá cache CỐ Ý trùng `['workspaces','detail',wsId]` — CHÍNH khoá mà
 * `workspaces/queries/workspaces.keys.ts#detail()` dùng — để hai bên chia sẻ MỘT
 * response THẬT (`GET /workspaces/:id`), cùng kỹ thuật `useWorkspaceBoardAccess`
 * và `useCanCreateChannel`. Ghi tay thay vì import vì luật "không import chéo feature".
 */
export function useWalletAccess(wsId: string | undefined) {
  return useQuery({
    queryKey: ['workspaces', 'detail', wsId ?? ''],
    queryFn: () => walletSupportService.workspaceAccess(wsId as string),
    enabled: Boolean(wsId),
    staleTime: 30_000,
  });
}

export function useWalletMembers(wsId: string | undefined) {
  return useQuery({
    queryKey: walletKeys.members(wsId ?? ''),
    queryFn: () => walletSupportService.members(wsId as string),
    enabled: Boolean(wsId),
    staleTime: 60_000,
  });
}

/** Chỉ tải khi màn Cài đặt cần (OWNER/ADMIN) — hai danh sách phụ, không đáng tải ở mọi màn ví. */
export function useReminderTargets(wsId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: walletKeys.reminderTargets(wsId ?? ''),
    queryFn: () => walletSupportService.reminderTargets(wsId as string),
    enabled: enabled && Boolean(wsId),
    staleTime: 60_000,
  });
}
