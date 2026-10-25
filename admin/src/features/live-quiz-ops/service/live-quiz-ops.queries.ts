import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { isLiveQuizOpen, LIVE_QUIZ_REFETCH_MS } from '../constants/live-quiz-ops.constants';
import type { AdminLiveQuizListParams } from '../types/live-quiz-ops.types';
import { liveQuizOpsService } from './live-quiz-ops.service';

/** Query key theo admin.md p5-01 §3: `['live-quiz-ops', 'list', params]`, `['live-quiz-ops', 'detail', id]`. */
export const liveQuizOpsKeys = {
  all: ['live-quiz-ops'] as const,
  list: (params: AdminLiveQuizListParams) => ['live-quiz-ops', 'list', params] as const,
  detail: (id: string) => ['live-quiz-ops', 'detail', id] as const,
};

/**
 * `GET /admin/live-quiz/sessions` (phân trang server). Còn phiên đang mở trong trang ⇒ làm mới mỗi 15 giây; không còn phiên nào mở thì
 * dừng. Tab trình duyệt ẩn thì React Query không làm mới nền (`refetchIntervalInBackground` mặc định tắt).
 */
export const useLiveQuizSessions = (params: AdminLiveQuizListParams) =>
  useQuery({
    queryKey: liveQuizOpsKeys.list(params),
    queryFn: () => liveQuizOpsService.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.data.some((s) => isLiveQuizOpen(s.status)) ? LIVE_QUIZ_REFETCH_MS : false,
  });

/** `GET /admin/live-quiz/sessions/:id` — chỉ tải khi ngăn kéo mở; phiên còn mở thì làm mới cùng nhịp với danh sách. */
export const useLiveQuizSession = (id: string | undefined) =>
  useQuery({
    queryKey: liveQuizOpsKeys.detail(id ?? ''),
    queryFn: () => liveQuizOpsService.get(id ?? ''),
    select: (res) => res.data,
    enabled: !!id,
    // 404 không tự khỏi khi gọi lại — vẽ trạng thái ngay.
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      return status && isLiveQuizOpen(status) ? LIVE_QUIZ_REFETCH_MS : false;
    },
  });

/** `POST /admin/live-quiz/sessions/:id/end` — làm mới danh sách + chi tiết + nhật ký (audit `live-quiz.admin-end`). */
export const useEndLiveQuizSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: liveQuizOpsService.end,
    onSuccess: () => {
      showToast('success', 'Đã kết thúc phiên và ghi nhật ký');
      void qc.invalidateQueries({ queryKey: liveQuizOpsKeys.all });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
    // Lỗi (đặc biệt `QUIZ_007`: phiên vừa tự đóng) — trạng thái hiển thị có thể đã cũ, tải lại cho khớp BE.
    onError: () => {
      void qc.invalidateQueries({ queryKey: liveQuizOpsKeys.all });
    },
  });
};
