/**
 * Cổng "ghi một tín hiệu hoạt động của người dùng" cho burnout radar (p7-03) — đặt ở `shared/ports/` để module khác (`messages` → `message.created`, `study` → `sr.reviewed`, `pomodoro`…) báo hoạt động của tác giả
 * MÀ KHÔNG import `modules/burnout/services/*` (luật 3 tầng, `.claude/rules/architecture.md`). Lấy bản cài đặt bằng `createBurnoutSignalPort()` từ `modules/burnout` (barrel).
 *
 * Quyền riêng tư nằm Ở PHÍA NHẬN: bản cài đặt chỉ ghi khi phân hệ `burnout` đang bật VÀ `userId` đã BẬT theo dõi; người khác — không ghi gì. Caller KHÔNG cần (và không nên) tự kiểm. Chỉ truyền `userId` của CHÍNH
 * người thực hiện, không truyền loại/nội dung sự kiện. Không bao giờ ném lỗi (thu thập là best-effort).
 */
export interface BurnoutSignalPort {
  /** `at` mặc định = bây giờ; `eventId` (id ổn định của sự kiện nguồn, vd jobId) chống đếm trùng khi sự kiện được giao lại. */
  recordEvent(userId: string, at?: Date, eventId?: string): Promise<void>;
}
