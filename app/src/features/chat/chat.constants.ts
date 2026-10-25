/**
 * Giới hạn nghiệp vụ phía client — khớp `be/src/core/constants/limits.ts`
 * (`message.*`, `conversation.pinMax/forwardTargetsMax`). `Capabilities.limits`
 * (`core/capabilities`) là `Record<string, unknown>` không định hình sẵn
 * (`capabilities.types.ts`: "ép kiểu chi tiết NGAY TẠI CHỖ DÙNG") — chat cần
 * đọc nhiều giới hạn cùng lúc ở nhiều file khác nhau nên khai một bộ TRẦN CỨNG
 * ở đây thay vì lặp lại việc ép kiểu từng nơi; sai lệch với runtime override
 * (admin hạ giới hạn qua `SystemConfig`) chỉ khiến validate CLIENT lỏng hơn
 * server một chút — server luôn là nguồn sự thật cuối cùng, lỗi đó vẫn hiện
 * đúng thông điệp qua `error-codes.ts`.
 */
export const CHAT_LIMITS = {
  maxChars: 4000,
  attachmentsMax: 5,
  editWindowSeconds: 15 * 60,
  mentionsMax: 20,
  voiceNoteMaxSeconds: 300,
  reactionsDistinctMax: 20,
  linksMax: 10,
  pinMax: 10,
  forwardTargetsMax: 10,
} as const;

/** be.md §9 `capabilities` → `SystemConfig chat.quickReactions` — mặc định khớp giá trị BE seed. */
export const QUICK_REACTIONS = ['👍', '❤️', '😆', '😮', '😢', '🙏'] as const;

/**
 * Bật lớp tô nền chip nhắc tên đằng sau `TextInput` (`MentionHighlight`). Chưa kiểm trên
 * máy thật — nếu dải nền lệch chữ (font/padding hai lớp không trùng) thì đặt `false`:
 * chip vẫn hoạt động đầy đủ (range, marker, xoá nguyên khối), chỉ mất dải nền nhạt.
 */
export const MENTION_HIGHLIGHT_ENABLED = true;

/** `@Tất cả` cho nhóm đông hơn mức này thì hỏi xác nhận trước khi chèn (app.md p1-06 §3 — đề xuất 20). */
export const MENTION_ALL_CONFIRM_ABOVE = 20;

/** Nhóm cùng tác giả cách nhau ≤ 5 phút thì ẩn avatar/tên (app.md §3 "Grouping"). */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** app.md §7 — chỉ tự dính cuối khi đã ở cuối ≤ 80px. */
export const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

/** app.md §4.2 — mở màn coi là "nhiều tin chưa đọc" (chuyển sang `around`) khi vượt ngưỡng này. */
export const AROUND_UNREAD_THRESHOLD = 30;
