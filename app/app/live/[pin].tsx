import { Redirect, useLocalSearchParams } from 'expo-router';

import { cleanPin } from '@/features/live-quiz/utils/live-quiz-links';
import { joinHref } from '@/features/live-quiz/utils/live-quiz-routes';

/**
 * p5-01 app.md §1 — deep link `superapp://live/{pin}` (và `https://<miền>/live/{pin}` khi `app.config.ts` thêm
 * `pathPrefix: '/live/'`) mở màn tham gia với PIN điền sẵn. Chỉ chuyển tiếp, ngoài nhóm `(app)` (cùng mẫu `app/s/[setId].tsx`,
 * `app/m/[id].tsx`): hàng rào đăng nhập của `(app)/_layout.tsx` áp dụng ở route đích, cờ `live-quiz` do `LiveQuizGate`.
 * Mã không đủ 6 số vẫn vào màn tham gia (điền phần có sẵn) chứ không rơi vào 404.
 */
export default function LiveQuizLinkRoute() {
  const { pin } = useLocalSearchParams<{ pin: string }>();
  return <Redirect href={joinHref(cleanPin(pin))} />;
}
