import { View } from 'react-native';

import type { StudySetSummaryDto } from '../../api/study.types';
import { SrDueCard } from '../sr/SrDueCard';
import { StudyModeGrid } from './StudyModeGrid';

export interface StudyHomeHeaderProps {
  hasMore: boolean;
  liveQuiz: boolean;
  sets: readonly StudySetSummaryDto[];
  status: 'error' | 'loading' | 'ready';
}

/**
 * Khối đầu của "Của tôi" (cuộn CÙNG danh sách bộ): thẻ "Hôm nay" — điểm nhấn chính, có một nút "Ôn ngay" — rồi lưới lối tắt chế độ
 * học. Trang chủ ẩn cả khối khi đang tìm/lọc để kết quả lên ngay đầu màn (cùng quy tắc cũ với banner "Khám phá").
 *
 * Khe 24 (`gap-xl`) giữa hai khối theo `screen-layout.md`; lề ngang 16 nằm ở ĐÂY vì danh sách cha là `padded={false}` (mỗi thẻ bộ
 * tự có `px-md`) — không thêm lề ở nơi khác kẻo thụt 32dp.
 */
export function StudyHomeHeader({ hasMore, liveQuiz, sets, status }: StudyHomeHeaderProps) {
  return (
    <View className="gap-xl px-md pb-md pt-xs">
      <SrDueCard />
      <StudyModeGrid hasMore={hasMore} liveQuiz={liveQuiz} sets={sets} status={status} />
    </View>
  );
}
