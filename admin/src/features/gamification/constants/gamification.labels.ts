import type { BadgeRarity, XpRuleSourceType } from '../types/gamification.types';

/** Nhãn + mô tả ngắn cho nguồn XP (admin.md p4-03 §2.1). */
export const XP_SOURCE_LABELS: Record<XpRuleSourceType, { label: string; hint: string }> = {
  TASK_COMPLETED: { label: 'Hoàn thành task', hint: 'Nhân hệ số story points ≤ 5' },
  TASK_ON_TIME: { label: 'Hoàn thành đúng hạn', hint: 'Thưởng thêm khi xong trước hạn' },
  QUIZ_SCORED: { label: 'Làm bài kiểm tra', hint: 'Theo điểm bài làm' },
  QUIZ_PASSED: { label: 'Đạt bài kiểm tra', hint: 'Thưởng khi vượt ngưỡng đạt' },
  SR_REVIEW: { label: 'Ôn thẻ', hint: 'Mỗi lượt ôn thẻ lặp lại ngắt quãng' },
  SR_REVIEW_DAY: { label: 'Ôn tập trong ngày', hint: 'Hoàn thành phiên ôn của ngày' },
  REVIEW_SUBMITTED: { label: 'Gửi đánh giá', hint: 'Gửi đánh giá/nhận xét' },
  STUDY_SET_PUBLISHED: { label: 'Công khai bộ học', hint: 'Bộ học được công khai' },
  POMODORO_CYCLE: { label: 'Chu kỳ Pomodoro', hint: 'Chưa hỗ trợ' },
  ROADMAP_LESSON: { label: 'Hoàn thành buổi học lộ trình', hint: 'Mỗi buổi học trong lộ trình, không thuộc workspace' },
};

/** Nguồn chưa hỗ trợ — không cho bật (admin.md §2.1). */
export const UNSUPPORTED_SOURCES: ReadonlySet<XpRuleSourceType> = new Set(['POMODORO_CYCLE']);

export const BADGE_RARITY_LABELS: Record<BadgeRarity, string> = {
  COMMON: 'Phổ biến',
  RARE: 'Hiếm',
  EPIC: 'Sử thi',
  LEGENDARY: 'Huyền thoại',
};

export const BADGES_PAGE_SIZE = 20;

/** Nhãn cho `COUNTER_KEYS` (be/src/shared/criteria/criteria-evaluator.ts) — whitelist điều kiện. */
export const COUNTER_LABELS: Record<string, string> = {
  tasksDone: 'Task hoàn thành',
  tasksOnTime: 'Task đúng hạn',
  quizzesTaken: 'Bài kiểm tra đã làm',
  quizzesPassed: 'Bài kiểm tra đạt',
  quizHighScores: 'Bài kiểm tra điểm cao',
  srReviews: 'Lượt ôn thẻ',
  srReviewDays: 'Ngày ôn tập',
  reviewsGiven: 'Đánh giá đã gửi',
  setsPublished: 'Bộ học công khai',
  longestStreak: 'Chuỗi ngày dài nhất',
  level: 'Cấp độ',
};

/**
 * Lý do BE chặn XP (`xp-calc.ts` → `blockedReason`). Tra bằng `xpBlockedReasonLabel` — mã BE thêm về sau
 * (chuỗi tự do) vẫn ra một câu hiểu được thay vì lộ mã kỹ thuật.
 */
export const XP_BLOCKED_REASON_LABELS: Readonly<Record<string, string>> = {
  MIN_TASK_AGE: 'Task quá mới',
  RULE_INACTIVE: 'Luật đang tắt',
};
