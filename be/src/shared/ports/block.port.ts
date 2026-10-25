/**
 * Cổng "chặn người dùng" (p1-08 be.md §5.7) — MỘT nguồn sự thật cho mọi nơi cần
 * biết "A và B có chặn nhau không" (p1-05 thêm vào nhóm chat, p1-07 lọc
 * mention/push, p0-03 presence, p2-01 đổ chuông cuộc gọi). Module tiêu thụ
 * lấy instance qua `getBlockPort()` của `@modules/blocks/public` (ngoại lệ có
 * chủ đích của luật "không import chéo module", giống `@modules/assets/public`)
 * — KHÔNG tự đọc collection `UserBlock`.
 *
 * Hiệu ứng thống nhất (README p1-08 §2): A chặn B → hai người không nhắn 1-1/gọi/
 * thấy presence của nhau (cả hai hướng); mention từ B không tạo thông báo cho A
 * (một hướng: chỉ người CHẶN được lọc); tin trong nhóm/kênh vẫn hiển thị.
 * Cache Redis `block:{userId}` (5 phút) — LỖI Redis luôn fail-open về DB, KHÔNG
 * chặn nghiệp vụ chính vì hạ tầng cache.
 */
export interface BlockPort {
  /** A chặn B HOẶC B chặn A. */
  isBlockedEitherWay(a: string, b: string): Promise<boolean>;

  /** `blockerId` đã chặn `blockedId` (một chiều). */
  hasBlocked(blockerId: string, blockedId: string): Promise<boolean>;

  /** Những người `userId` đã chặn. */
  blockedIdsOf(userId: string): Promise<string[]>;

  /** Những người đã chặn `userId` (chiều ngược). */
  blockerIdsOf(userId: string): Promise<string[]>;

  /** Hợp hai hướng — mọi người mà `userId` không được thấy presence/không nhắn 1-1/không gọi. */
  hiddenBetween(userId: string): Promise<Set<string>>;

  /**
   * Bỏ khỏi `recipientIds` những người ĐÃ CHẶN `senderId` (một hướng — B nhắc A
   * trong nhóm thì A đã chặn B mới bị lọc). Giữ nguyên thứ tự, không trùng.
   */
  filterNotificationRecipients(senderId: string, recipientIds: string[]): Promise<string[]>;

  /** Xoá cache của các user này (gọi SAU khi block/unblock đã commit). */
  invalidate(userIds: string[]): Promise<void>;
}
