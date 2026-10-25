import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Section } from '@/shared/ui/section';

import type { StudySetSummaryDto } from '../../api/study.types';
import { srReviewHref } from '../../utils/study-routes';
import { EnterView } from '../visual/EnterView';
import { ModeShortcutTile } from './ModeShortcutTile';
import { StudyModeSetSheet, type SetPickMode } from './StudyModeSetSheet';

/**
 * Ô của lưới: `grow basis-[45%]` ⇒ hai ô một hàng (2 × 45% + khe 12 < 100% ở mọi bề rộng ≥ 320dp), ô lẻ cuối hàng giãn hết hàng.
 * ⚠️ Cố ý KHÔNG có bậc `tablet:` 4 cột: ở ngưỡng 600dp lưới chỉ còn 568dp (trừ lề `px-md`) nên 4 ô chỉ ~133dp — hẹp hơn cả ô ở
 * điện thoại 320dp (~138dp); chạm trần 720dp (`max-w-content`) của `Screen` (`constrained`) cũng mới ~163dp, ngang ô ở điện thoại
 * 360dp. Hai cột ở mọi cỡ, và là class chứ không phải hook nên kéo chia đôi màn hình không vẽ lại cả lưới.
 * ✅ Cao đều: hàng `flex-wrap` giãn mọi ô theo ô cao nhất hàng (`align-items: stretch` mặc định); `ModeShortcutTile` (`grow` +
 * `fill`) lấp hết chiều cao ô đó — tên xuống 2 dòng ở một ô không làm ô bên cạnh lùn hơn.
 */
const CELL = 'grow basis-[45%]';

export interface StudyModeGridProps {
  hasMore: boolean;
  /** Cờ phân hệ `live-quiz` — tắt thì KHÔNG vẽ ô "Thi đấu trực tiếp" (không bày lối chắc chắn lỗi). */
  liveQuiz: boolean;
  /** Bộ của tôi đã tải (nguồn cho tấm chọn bộ). */
  sets: readonly StudySetSummaryDto[];
  status: 'error' | 'loading' | 'ready';
}

/**
 * Lưới lối tắt chế độ học ở Trang chủ Học — năm ô lấy tên/màu/icon từ `STUDY_MODE_META` (ô tint theo tông + hoạ tiết góc):
 *  · "Học thẻ", "Quiz nhanh", "Thi thử" — cần một bộ ⇒ mở tấm chọn bộ (`StudyModeSetSheet`), chọn xong vào thẳng màn học;
 *  · "Ôn theo lịch" — mọi bộ đã đăng ký (`/study/sr`, cùng đích với nút "Ôn ngay" của thẻ Hôm nay);
 *  · "Thi đấu trực tiếp" — nhập mã PIN (`/study/live/join`), chỉ khi cờ `live-quiz` bật.
 *
 * Người dùng CHƯA có bộ nào (đã tải xong, rỗng) thì ẩn ba ô cần bộ — chúng chỉ dẫn tới tấm rỗng; nút "Tạo bộ học" nằm ở trạng
 * thái rỗng của danh sách bên dưới (⛔ không thêm lối tạo thứ hai ở đây). "Lịch sử thi thử" vẫn ở menu "⋯" của thanh tiêu đề.
 * ⛔ Không vòng lặp nào ở đây: vòng lặp nổi bật duy nhất của màn là `BorderBeam` của thẻ "Hôm nay".
 */
export function StudyModeGrid({ hasMore, liveQuiz, sets, status }: StudyModeGridProps) {
  const [picking, setPicking] = useState<SetPickMode | null>(null);
  const needsSets = !(status === 'ready' && sets.length === 0);
  // Chưa có bộ nào và không có thi trực tiếp thì chỉ còn mỗi "Ôn theo lịch" — một ô lẻ dẫn tới màn trống; thẻ "Hôm nay" đã lo ca có thẻ đến hạn.
  if (!needsSets && !liveQuiz) return null;

  return (
    <Section title="Chế độ học">
      <View className="flex-row flex-wrap gap-sm">
        {needsSets ? (
          <>
            <EnterView className={CELL} index={1}>
              <ModeShortcutTile mode="flashcards" onPress={() => setPicking('flashcards')} />
            </EnterView>
            <EnterView className={CELL} index={2}>
              <ModeShortcutTile mode="quick" onPress={() => setPicking('quick')} />
            </EnterView>
            <EnterView className={CELL} index={3}>
              <ModeShortcutTile mode="mock" onPress={() => setPicking('mock')} />
            </EnterView>
          </>
        ) : null}
        <EnterView className={CELL} index={4}>
          <ModeShortcutTile mode="sr" onPress={() => router.push(srReviewHref())} />
        </EnterView>
        {liveQuiz ? (
          <EnterView className={CELL} index={5}>
            <ModeShortcutTile mode="live" onPress={() => router.push('/study/live/join')} />
          </EnterView>
        ) : null}
      </View>
      <StudyModeSetSheet
        hasMore={hasMore}
        mode={picking}
        sets={sets}
        status={status}
        onClose={() => setPicking(null)}
      />
    </Section>
  );
}
