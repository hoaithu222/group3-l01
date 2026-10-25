import { router } from 'expo-router';
import { useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';

import { useSrEnroll, useSrUnenroll } from '../queries/sr.queries';
import { srReviewHref } from '../utils/study-routes';

/**
 * Hai việc "ôn theo lịch" của một bộ ở màn tổng quan (p4-02 app.md §3 SetOverview):
 *  · `startSr` — "Ôn theo lịch": đăng ký SR cả bộ (`POST /sr/enrollments`, idempotent phía BE; `SR_002` = bộ không có mục) rồi mở `/study/sr?setId=`.
 *  · `stop*` — "Ngừng ôn bộ này" ở menu ⋯: hộp thoại xác nhận + `DELETE /sr/enrollments/:setId`. BE idempotent (bộ chưa từng đăng ký vẫn 204) và CHỈ
 *    ngừng đưa thẻ MỚI — thẻ đã học vẫn đến hạn theo lịch — nên gọi lúc không chắc đã đăng ký cũng an toàn (BE chưa có trường "đã đăng ký" để ẩn/hiện mục menu).
 * Lỗi mạng/5xx của "Ngừng ôn" đã toast ở interceptor chung — chỉ xử lý nhánh thành công.
 */
export function useSetSrActions(setId: string) {
  const enroll = useSrEnroll();
  const unenroll = useSrUnenroll();
  const [stopping, setStopping] = useState(false);

  return {
    closeStop: () => setStopping(false),
    confirmStop: () =>
      unenroll.mutate(setId, {
        onSuccess: () => {
          setStopping(false);
          showToast('success', 'Đã ngừng ôn bộ này.');
        },
      }),
    enrolling: enroll.isPending,
    isStopPending: unenroll.isPending,
    openStop: () => setStopping(true),
    startSr: () =>
      enroll.mutate(setId, {
        onError: (error) => showToast('error', toErrorMessage(error)),
        onSuccess: () => router.push(srReviewHref(setId)),
      }),
    stopping,
  };
}
