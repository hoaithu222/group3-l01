import { router } from 'expo-router';

import { StudyModeTile } from './visual/StudyModeTile';

/**
 * Lối vào p5-01 "Tổ chức thi trực tiếp" từ màn tổng quan bộ học — một Ô trong khối "Luyện tập" (không phải nút rời cùng độ nổi với
 * "Học thẻ"). Nơi gọi (`SetStudyActions`) chỉ dựng khi cờ `live-quiz` bật và bọc nó trong ô lưới. ⛔ Không import feature `live-quiz` — mở route của
 * nó, `setId` đi qua param.
 *
 * Tông + icon lấy từ chế độ `live` của `STUDY_MODE_META` (trước đây tự chọn tông `accent` — lệch màu với "Thi đấu trực tiếp" ở Trang chủ Học). Tên
 * "Tổ chức thi trực tiếp" khác tên chế độ ("Thi đấu trực tiếp") CÓ CHỦ Ý: đây là lối của CHỦ PHÒNG, còn tên chế độ là lối của người chơi.
 */
export function LiveQuizEntryRow({ setId }: { setId: string }) {
  return (
    <StudyModeTile
      description="Tạo phòng thi bằng mã PIN"
      mode="live"
      title="Tổ chức thi trực tiếp"
      onPress={() => router.push({ params: { setId }, pathname: '/study/live/host' })}
    />
  );
}
