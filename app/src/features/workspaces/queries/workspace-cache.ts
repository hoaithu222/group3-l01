import type { QueryClient } from '@tanstack/react-query';

import { notificationKeys } from '@/core/notifications';

import { workspaceKeys } from './workspaces.keys';

/**
 * Làm mới cache PHỤ sau các thay đổi của một nhóm — tách khỏi `workspaces.queries.ts` (trần 150 dòng).
 * Mỗi hàm ghi rõ bản chép nào của dữ liệu nằm NGOÀI khoá của chính mutation, vì đó là chỗ "chuyển màn vẫn thấy dữ liệu cũ".
 */

/** Đổi tên/mô tả: danh sách MỌI trạng thái + Tổng quan (`overview.workspace` là bản chép riêng; màn đó nằm dưới Cài đặt, vẫn mounted). */
export function refreshAfterWorkspaceEdit(queryClient: QueryClient, workspaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.overview(workspaceId) });
}

/** Chế độ thông báo của nhóm là nguồn "kế thừa" của kênh/hội thoại và đổi cách đếm chưa đọc (tắt tiếng). */
export function refreshAfterNotifyModeChange(queryClient: QueryClient, workspaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.workspacePrefs(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
}

/**
 * Chuyển quyền chủ nhóm: vai trò hai người đổi ⇒ huy hiệu vai trò/nút quản trị ở màn Thành viên và số người theo vai trò của
 * kênh (khoá của `members` — `members.keys.ts`, và `channels` — `channels.keys.ts`; ghi tay vì không import chéo feature).
 */
export function refreshAfterOwnerTransfer(queryClient: QueryClient, workspaceId: string): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
  void queryClient.invalidateQueries({ queryKey: ['members', workspaceId] });
  void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
}

/** Rời nhóm: bỏ chi tiết/tổng quan, làm mới MỌI danh sách + huy hiệu chưa đọc (nhóm vừa rời không còn được tính). */
export function forgetWorkspace(queryClient: QueryClient, workspaceId: string): void {
  queryClient.removeQueries({ queryKey: workspaceKeys.detail(workspaceId) });
  queryClient.removeQueries({ queryKey: workspaceKeys.overview(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
  void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
}
