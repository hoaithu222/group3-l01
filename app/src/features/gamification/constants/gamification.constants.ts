import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { BadgeRarity, XpSourceType } from '../api/gamification.types';

/**
 * Mã lỗi gamification (p4-03, đồng bộ `be/src/core/utils/error.codes.ts` GAME_*) → câu tiếng Việt.
 *
 * ⚠️ Để ở feature (không trải vào `shared/constants/error-codes.ts`): bảng chung đã ở trần kích thước. Request ghi
 * của feature đều `skipErrorToast` rồi màn toast qua `gamificationErrorMessage()`.
 */
export const GAMIFICATION_ERROR_MESSAGES: Record<string, string> = {
  GAME_001: 'Không tìm thấy luật điểm kinh nghiệm',
  GAME_002: 'Điều kiện mở huy hiệu không hợp lệ',
  GAME_003: 'Mã huy hiệu đã tồn tại',
  GAME_004: 'Mức điều chỉnh điểm kinh nghiệm vượt giới hạn cho phép',
  GAME_005: 'Cấu hình cấp độ không hợp lệ',
  GAME_006: 'Chỉ trưng bày được huy hiệu bạn đã đạt, tối đa 6 huy hiệu',
};

/** Số huy hiệu trưng bày tối đa (BE trả `GAME_006` khi vượt). */
export const SHOWCASE_MAX = 6;

/** Nhãn nguồn XP cho lịch sử (BE `XP_SOURCE_TYPES`). */
export const XP_SOURCE_LABELS: Record<XpSourceType, string> = {
  ADMIN_ADJUST: 'Quản trị viên điều chỉnh',
  POMODORO_CYCLE: 'Hoàn thành một phiên Pomodoro',
  QUIZ_PASSED: 'Đạt bài kiểm tra',
  QUIZ_SCORED: 'Làm bài kiểm tra',
  REVIEW_SUBMITTED: 'Gửi đánh giá',
  SR_REVIEW: 'Ôn thẻ ghi nhớ',
  SR_REVIEW_DAY: 'Ôn tập đủ trong ngày',
  STUDY_SET_PUBLISHED: 'Xuất bản bộ học',
  TASK_COMPLETED: 'Hoàn thành công việc',
  TASK_ON_TIME: 'Hoàn thành công việc đúng hạn',
};

/**
 * Ô icon cho từng nguồn XP ở màn lịch sử — mắt nhận ra loại việc trước khi đọc chữ. Icon/tông bám phân hệ nguồn (Học =
 * `book`/`success`, công việc = `checkmark-square`, Pomodoro = `timer`…); `neutral` cho điều chỉnh thủ công của quản trị.
 */
export const XP_SOURCE_ART: Record<XpSourceType, { icon: IconName; tone: IconTileTone }> = {
  ADMIN_ADJUST: { icon: 'user-setting-1', tone: 'neutral' },
  POMODORO_CYCLE: { icon: 'timer', tone: 'warning' },
  QUIZ_PASSED: { icon: 'checkmark-circle', tone: 'success' },
  QUIZ_SCORED: { icon: 'document', tone: 'info' },
  REVIEW_SUBMITTED: { icon: 'edit', tone: 'accent' },
  SR_REVIEW: { icon: 'book', tone: 'success' },
  SR_REVIEW_DAY: { icon: 'calendar-favorite', tone: 'brand' },
  STUDY_SET_PUBLISHED: { icon: 'upload', tone: 'info' },
  TASK_COMPLETED: { icon: 'checkmark-square', tone: 'brand' },
  TASK_ON_TIME: { icon: 'clock', tone: 'success' },
};

export const RARITY_LABELS: Record<BadgeRarity, string> = {
  COMMON: 'Phổ biến',
  EPIC: 'Sử thi',
  LEGENDARY: 'Huyền thoại',
  RARE: 'Hiếm',
};

/**
 * Nền ô emoji huy hiệu theo độ hiếm: phổ biến = xám, hiếm = xanh dương, sử thi = tím thương hiệu, huyền thoại = vàng. Dùng
 * chung cho ô hàng (`BadgeTile`) và ô lưới (`BadgeGridTile`) — hai bảng riêng là hai màu lệch nhau ở lần đổi token sau.
 * ⚠️ Chỉ là điểm nhấn cho mắt: nhãn độ hiếm bằng CHỮ luôn nằm trong `accessibilityLabel` của ô.
 */
export const RARITY_TILE: Record<BadgeRarity, string> = {
  COMMON: 'bg-surface-neutral',
  EPIC: 'bg-surface-primary',
  LEGENDARY: 'bg-surface-secondary',
  RARE: 'bg-surface-info',
};

/** Nhãn bộ đếm điều kiện huy hiệu (BE `COUNTER_KEYS`, `shared/criteria/criteria-evaluator.ts`) cho `BadgeDetailSheet`. */
export const COUNTER_LABELS: Record<string, string> = {
  level: 'Cấp độ',
  longestStreak: 'Chuỗi ngày dài nhất',
  quizHighScores: 'Bài kiểm tra điểm cao',
  quizzesPassed: 'Bài kiểm tra đạt',
  quizzesTaken: 'Bài kiểm tra đã làm',
  reviewsGiven: 'Lượt chấm chéo',
  setsPublished: 'Bộ học đã xuất bản',
  srReviewDays: 'Ngày ôn tập',
  srReviews: 'Lượt ôn thẻ ghi nhớ',
  tasksDone: 'Công việc hoàn thành',
  tasksOnTime: 'Công việc đúng hạn',
};
