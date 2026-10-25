import { useQuery } from '@tanstack/react-query';

import { appConfig } from '@/core/config/env.config';
import { notificationKeys, readStateService } from '@/core/notifications';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

/** Chỉ hỏi khi đã đăng nhập và phân hệ `communication` không bị tắt (route `read-state` gắn cờ → 404 nếu tắt). */
function useUnreadEnabled(): boolean {
  const status = useAuthStore((state) => state.status);
  const communication = useFeature('communication');
  const signedIn = !appConfig.authEnabled || status === 'authenticated';
  // `undefined` (chưa biết cờ) vẫn cho chạy — cùng nguyên tắc fail-open của `useAccessibleModules`.
  return signedIn && communication !== false;
}

/**
 * Tóm tắt chưa đọc — nguồn DUY NHẤT của huy hiệu tab (Tin nhắn · Nhóm · Hoạt động) và icon app (p1-07 `app.md` §4.1).
 * `staleTime` 15 s; làm mới khi app active lại, khi socket nối lại và theo sự kiện (`useReadStateSync`).
 */
export function useUnreadSummary() {
  const enabled = useUnreadEnabled();
  return useQuery({
    enabled,
    queryFn: () => readStateService.getSummary(),
    queryKey: notificationKeys.unreadSummary,
    staleTime: 15_000,
  });
}

/** Chấm/số chưa đọc theo KÊNH và luồng đang theo dõi của MỘT workspace (`GET /me/unread?workspaceId=`). */
export function useWorkspaceUnread(workspaceId: string | undefined) {
  const enabled = useUnreadEnabled();
  return useQuery({
    enabled: enabled && Boolean(workspaceId),
    queryFn: () => readStateService.getWorkspaceUnread(workspaceId ?? ''),
    queryKey: notificationKeys.workspaceUnread(workspaceId ?? ''),
    staleTime: 15_000,
  });
}
