/**
 * Mã lỗi TÌM KIẾM · TIN ĐÃ LƯU (`SRCH_001..004`, p1-09) → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (đã ở trần dòng của `file-size-manifest.json`) — cùng cách
 * `message-error-codes.constants.ts`. `error-codes.ts` trải bảng này vào `ERROR_CODE_MESSAGES`.
 *
 * ⚠️ Khớp `be/src/core/utils/error.codes.ts` (mã THẬT). p5-04 (tìm toàn workspace, chưa build) BE cũng khai
 * `SRCH_001..004` với nghĩa KHÁC và dự kiến đánh số lại từ `SRCH_101` — app phải theo BE khi p5-04 dựng.
 * `MSG_006` (tin đã thu hồi), `MSG_010` (đủ ghim), `RES_001`, `PERM_404`, `RATE_002`, `VAL_001` đã có ở bảng chung.
 */
export const DISCOVERY_ERROR_MESSAGES: Record<string, string> = {
  /** 400 — `q` ngoài 2–100 grapheme. Client đã chặn trước; mã này chỉ tới khi hai bên đếm lệch nhau. */
  SRCH_001: 'Từ khoá tìm kiếm cần từ 2 đến 100 ký tự',
  /** 400 — quá 8 từ (AND theo từ). */
  SRCH_002: 'Từ khoá có quá nhiều từ, hãy rút gọn',
  /** 400 — phạm vi không hỗ trợ tìm (chỉ kênh/hội thoại ở P0). */
  SRCH_003: 'Phạm vi này không hỗ trợ tìm kiếm',
  /** 409 — đã lưu đủ `LIMITS.saved.max` (1.000) tin. */
  SRCH_004: 'Bạn đã lưu số tin nhắn tối đa, hãy bỏ lưu bớt',
};
