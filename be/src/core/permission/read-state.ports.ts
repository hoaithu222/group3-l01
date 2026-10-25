/**
 * Cổng của p1-07 (`modules/read-state`) — mirror `message-hooks.port.ts`/`conversation-hooks.port.ts`:
 * registry 1-implementation toàn cục, `get*()` trả `null` khi chưa đăng ký (test cũ không boot
 * `router.ts`) — nơi gọi tự fallback, KHÔNG throw. Type tự chứa để `core/` không import `modules/`.
 */

// ── IReadReceiptPublisher — impl bởi `modules/conversations` (p1-05, `emitReadReceipt`) ─────────

/**
 * `ReadMarkerService` (read-state) gọi sau khi mốc đọc HỘI THOẠI tiến lên. Implementation tự
 * kiểm privacy `User.privacy.readReceipts` của người đọc (không phát nếu người đó tắt "đã xem")
 * rồi phát `read:receipt` tới `conv:{id}`.
 */
export interface IReadReceiptPublisher {
  publish(conversationId: string, userId: string, lastReadSeq: number, readAt: Date): Promise<void>;
}

let readReceiptPublisherImpl: IReadReceiptPublisher | null = null;

export function registerReadReceiptPublisher(impl: IReadReceiptPublisher): void {
  readReceiptPublisherImpl = impl;
}

export function getReadReceiptPublisher(): IReadReceiptPublisher | null {
  return readReceiptPublisherImpl;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function resetReadReceiptPublisher(): void {
  readReceiptPublisherImpl = null;
}

// ── IReadStateReader — impl bởi `modules/read-state` (đọc mốc đọc THREAD cho `ThreadView`) ──────

export interface IReadStateReader {
  /** `threadId → lastReadSeq` của `userId` (thread chưa có mốc → không có key, coi như 0). */
  getThreadReadSeqs(userId: string, threadIds: string[]): Promise<Map<string, number>>;
}

let readStateReaderImpl: IReadStateReader | null = null;

export function registerReadStateReader(impl: IReadStateReader): void {
  readStateReaderImpl = impl;
}

export function getReadStateReader(): IReadStateReader | null {
  return readStateReaderImpl;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function resetReadStateReader(): void {
  readStateReaderImpl = null;
}

