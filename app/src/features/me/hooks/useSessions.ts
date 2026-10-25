import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authService } from '@/core/api/auth';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * `useSessions()` / `useRevokeSession()` — màn "Phiên đăng nhập" (p0-01 mục
 * 10, mở từ `me/settings`): liệt kê phiên đăng nhập đang hoạt động và thu hồi
 * từng phiên.
 */

export const SESSIONS_QUERY_KEY = ['auth', 'sessions'] as const;

/**
 * Danh sách phiên đang hoạt động.
 *
 * ⚠️ Khác `useCapabilities()` (cache 5 phút): dữ liệu ở đây phải MỚI ngay sau
 * khi người dùng thu hồi một phiên (từ chính máy này, hoặc từ máy khác trong
 * cùng phiên làm việc) — `staleTime: 0` để mỗi lần màn hình được mount/focus
 * lại đều coi dữ liệu cũ là ĐÃ CŨ và tự refetch, thay vì im lặng hiện lại
 * danh sách trước khi thu hồi.
 */
export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: () => authService.listSessions(),
    staleTime: 0,
  });
}

/**
 * Thu hồi MỘT phiên theo `id`.
 *
 * ⛔ KHÔNG tự toast lỗi ở đây — `session.service.ts` cố ý KHÔNG set
 * `skipErrorToast`, nên lỗi (mạng, hay ca hiếm 400 "đang là phiên hiện tại")
 * đã được interceptor của `apiClient` hiện toast đúng MỘT LẦN. Toast thêm ở
 * đây là toast đôi.
 */
export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => authService.revokeSession(sessionId),
    onSuccess: () => {
      showToast('success', 'Đã thu hồi phiên đăng nhập.');
      // Làm mới danh sách để phiên vừa thu hồi biến mất ngay, không đợi người
      // dùng tự kéo-để-làm-mới.
      void queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
  });
}
