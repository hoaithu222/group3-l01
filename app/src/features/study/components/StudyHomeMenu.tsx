import { router } from 'expo-router';

import { ActionMenu } from '@/shared/ui/action-menu';

import { STUDY_MODE_META } from '../constants/study-modes.constants';
import { mockHistoryHref } from '../utils/study-routes';

/**
 * Menu "⋯" của màn "Học": gom LỐI PHỤ (thi đấu trực tiếp bằng mã PIN, lịch sử thi thử) để thanh tiêu đề chỉ còn một nút "+" và một menu. ⛔ Dùng `ActionMenu`
 * chung, không tự viết menu overflow. "Thi đấu trực tiếp" mở route của feature `live-quiz` (không import chéo feature) và chỉ hiện khi cờ `live-quiz` bật;
 * tên + icon lấy từ `STUDY_MODE_META` (cùng chế độ với ô ở lưới lối tắt). Đây là lối LUÔN có mặt — lưới lối tắt ở thân màn chỉ hiện ở tab "Của tôi" và tắt
 * khi đang tìm/lọc, còn "Lịch sử thi thử" chỉ có ở menu này.
 */
export function StudyHomeMenu({ liveQuiz }: { liveQuiz: boolean }) {
  return (
    <ActionMenu
      accessibilityLabel="Thêm tuỳ chọn cho màn Học"
      items={[
        {
          description: 'Nhập mã PIN để vào phòng thi',
          hidden: !liveQuiz,
          icon: STUDY_MODE_META.live.icon,
          key: 'live-join',
          label: STUDY_MODE_META.live.label,
          onPress: () => router.push('/study/live/join'),
        },
        {
          icon: 'history',
          key: 'mock-history',
          label: 'Lịch sử thi thử',
          onPress: () => router.push(mockHistoryHref()),
        },
      ]}
      title="Học"
    />
  );
}
