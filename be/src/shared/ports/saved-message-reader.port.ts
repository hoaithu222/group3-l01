/**
 * Cổng "người xem đã lưu những tin nào" (p1-04/p1-09 — `MessageView.isSaved`) — đặt ở `shared/ports/` (giống
 * `ChannelVoiceActivityReader`) để `modules/messages` ghép cờ `isSaved` vào trang tin MÀ KHÔNG import `modules/discovery` (luật 3 tầng,
 * `.claude/rules/architecture.md`). `modules/discovery` đăng ký bản đọc lúc import `saved.routes.ts`; chưa đăng ký (worker thuần, test
 * không nạp `discovery`) → `getSavedMessageReader()` trả `null` và `MessageView` bỏ trường `isSaved`.
 *
 * ⚠ Reader chỉ trả tập id do CHÍNH người xem đã lưu — KHÔNG kiểm quyền đọc tin (caller đã có `Message` người xem đọc được).
 */
export interface SavedMessageReader {
  /** MỘT truy vấn cho cả trang (index `(userId, messageId)`): trả tập con của `messageIds` mà `userId` đã lưu. */
  savedIdsOf(userId: string, messageIds: readonly string[]): Promise<Set<string>>;
}

let reader: SavedMessageReader | null = null;

/** Gọi lúc boot của module sở hữu tin đã lưu (`saved.routes.ts`); đăng ký lại sẽ GHI ĐÈ. */
export function registerSavedMessageReader(impl: SavedMessageReader): void {
  reader = impl;
}

export function getSavedMessageReader(): SavedMessageReader | null {
  return reader;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearSavedMessageReader(): void {
  reader = null;
}
