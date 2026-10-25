/**
 * Hằng số của màn chi tiết thẻ (p3-03).
 *
 * `FALLBACK_TASK_LIMITS` CHÉP từ `LIMITS.task` của BE (`be/src/core/constants/limits.ts`, README p3-03 §7)
 * và dùng khi `capabilities.limits` chưa mang nhóm `task` — đổi số bên BE thì đổi Ở ĐÂY theo,
 * đây là bản SAO chứ không phải nguồn (cùng cách `FALLBACK_BOARD_LIMITS`).
 */
export const FALLBACK_TASK_LIMITS = {
  assigneesMax: 10,
  attachmentsMax: 10,
  checklistItemMax: 200,
  checklistMax: 100,
  commentAttachmentsMax: 5,
  commentEditWindowSeconds: 900,
  commentMax: 4000,
  descriptionMax: 20_000,
  labelsPerTaskMax: 10,
  storyPointsMax: 100,
  titleMax: 200,
} as const;

/** Bậc gợi ý cho "Điểm" (dãy Fibonacci rút gọn của story points) — app.md §2 `StoryPointsSheet`. */
export const STORY_POINT_STEPS: readonly number[] = [0, 1, 2, 3, 5, 8, 13, 21];

/** Số dòng mô tả hiển thị trước khi gập "Xem thêm" (app.md §2 `DescriptionSection`). */
export const DESCRIPTION_COLLAPSE_LINES = 12;

export type FeedSegment = 'activity' | 'all' | 'comments';

export const FEED_SEGMENTS: readonly { key: FeedSegment; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'activity', label: 'Hoạt động' },
  { key: 'comments', label: 'Bình luận' },
];

/**
 * Khoảng cách tối thiểu (ms) giữa hai lần `invalidate` chi tiết khi socket bắn dồn (tick liên tục
 * 10 mục trong vài giây, PM2-22) — mỗi sự kiện đã vá thẳng vào cache, refetch chỉ để hội tụ.
 */
export const DETAIL_REFETCH_DEBOUNCE_MS = 800;
