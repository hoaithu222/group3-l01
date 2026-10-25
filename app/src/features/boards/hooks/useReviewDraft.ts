import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { ReviewDecision } from '../api/reviews.types';
import { reviewKeys } from '../queries/reviews.keys';
import { EMPTY_SCORE_DRAFT, type ScoreDraft } from '../utils/review-score';

/** Nháp chấm CHƯA gửi của MỘT lượt: quyết định, điểm từng tiêu chí (hoặc điểm tự do) và nhận xét. */
export interface ReviewDraft {
  decision: ReviewDecision | null;
  feedback: string;
  score: ScoreDraft;
}

export const EMPTY_REVIEW_DRAFT: ReviewDraft = { decision: null, feedback: '', score: EMPTY_SCORE_DRAFT };

/**
 * Nháp chấm giữ theo `reviewId` để lỡ đóng màn (nhận thông báo, vuốt back) mở lại vẫn còn (app.md §5).
 *
 * ── Vì sao nằm trong cache React Query, không phải store zustand ────────────────────────────────────────────────────────
 * Nội dung đánh giá nhạy cảm: KHÔNG lưu đĩa và KHÔNG được sót lại cho người kế tiếp trên cùng máy. `wipeUserData()` (mọi đường rời
 * phiên) gọi `queryClient.clear()` nên nháp đi theo — không cần thêm một store vào sổ `user-scoped-stores` rồi nhớ dọn. Khoá còn mang
 * `userId` để đổi tài khoản không bao giờ đọc nhầm nháp của người trước.
 *
 * ⚠️ Observer `enabled: false` + `gcTime: Infinity`: không có nó thì cache tự dọn nháp sau vài phút không ai xem, đúng lúc người chấm
 * vừa ra ngoài đọc chi tiết thẻ rồi quay lại. Nháp chỉ mất khi gửi xong (`clear`) hoặc rời phiên. `update` đọc bản MỚI NHẤT từ cache
 * (không từ closure) để hai lần gọi liền nhau trong một sự kiện không ghi đè nhau.
 */
export function useReviewDraft(reviewId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const key = reviewKeys.draft(userId, reviewId);
  const { data } = useQuery<ReviewDraft | null>({
    enabled: false,
    gcTime: Infinity,
    queryFn: () => null,
    queryKey: key,
    staleTime: Infinity,
  });

  const update = useCallback(
    (patch: Partial<ReviewDraft>) => {
      const current = queryClient.getQueryData<ReviewDraft>(key) ?? EMPTY_REVIEW_DRAFT;
      queryClient.setQueryData(key, { ...current, ...patch });
    },
    [key, queryClient],
  );

  const clear = useCallback(() => queryClient.removeQueries({ queryKey: key }), [key, queryClient]);

  return { clear, draft: data ?? EMPTY_REVIEW_DRAFT, update };
}
