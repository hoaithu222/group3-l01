import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Lộ trình học (p4-07 bước 12, P1): nhắc học hằng ngày (`roadmap.lesson-due-reminder`) → thẳng màn buổi học đến
 * hạn. Tách khỏi `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `study-route.ts`).
 *
 * ⛔ KHÔNG import `@/features/roadmap` để tái dùng `roadmapLessonHref`: không file SẢN PHẨM nào khác trong
 * `core/notifications` import feature — `contribution-route.ts` cũng tự dựng Href thay vì kéo `features/contribution`
 * vào. Dựng tại chỗ để giữ đúng khuôn đó, và để `core/` (nằm trong cây module GỐC qua `PushTapRouter` ở
 * `app/_layout.tsx`) không kéo cả một feature vào lúc nạp gốc.
 *
 * ⚠️ Đổi 29/09 trong lúc truy lỗi "kẹt màn hình chờ" với giả thuyết import này là thủ phạm — giả thuyết đó SAI (gốc
 * thật: `react-native-callkeep`, xem `package.json` → `expo.autolinking.exclude`). Giữ lại vì lý do quy ước ở trên,
 * không phải vì lý do sự cố.
 *
 * ⚠️ Cần CẢ `lessonId` lẫn `subjectId` để dựng route `[subjectId]/lessons/[lessonId]` — thiếu một trong hai thì
 * `null` (nơi gọi tự về hộp thư Hoạt động), cùng quy ước "thiếu id → null" của các hàm route khác ở đây.
 */
export function isRoadmapType(type: string): boolean {
  return type === 'roadmap.lesson-due-reminder';
}

export function roadmapHref({ lessonId, subjectId }: NotificationTarget): Href | null {
  // ⛔ `if` chứ không toán tử ba ngôi/`??`: `Href` quá nhiều mục, ba ngôi làm tsc nổ TS2590.
  if (!lessonId || !subjectId) return null;
  return { params: { lessonId, subjectId }, pathname: '/study/roadmap/[subjectId]/lessons/[lessonId]' };
}
