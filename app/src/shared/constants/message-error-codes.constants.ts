/**
 * Mã lỗi TIN NHẮN (`MSG_*`, p1-04) + THREAD/MENTION (p1-06) → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (đã ở đúng trần dòng của `file-size-manifest.json`,
 * mỗi module nối thêm một khối) để phần tin nhắn tự lớn lên ở đây mà không đụng
 * bảng chung nhiều module cùng ghi — cùng lý do `error-codes.ts` ghi ở mục "Nợ".
 * `error-codes.ts` trải bảng này vào `ERROR_CODE_MESSAGES`, nên mọi nơi tra mã
 * lỗi (`client.helpers.ts`, `ForwardResultsList`) vẫn chỉ nhìn MỘT bảng.
 *
 * ⚠️ Đồng bộ với `be/src/core/utils/error.codes.ts` (mã THẬT thắng tài liệu).
 * Riêng dải thread/mention BE đánh số LỆCH so với `p1-06 be.md §8` (be.md gọi
 * "MSG_017..020", nhưng `MSG_017` đã bị "chuyển tiếp tới người dùng trực tiếp"
 * chiếm): thật là 018 = hội thoại không có luồng · 019 = luồng lồng luồng ·
 * 020 = không được `@all` · 021 = nhắc `@all` quá nhiều lần.
 */
export const MESSAGE_ERROR_MESSAGES: Record<string, string> = {
  MSG_001: 'Tin nhắn vượt quá 4.000 ký tự',
  MSG_002: 'Mỗi tin tối đa 5 tệp đính kèm',
  MSG_003: 'Đã quá thời gian cho phép sửa tin nhắn',
  MSG_004: 'Bạn không thể gửi tin nhắn ở đây',
  MSG_005: 'Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ',
  MSG_006: 'Tin nhắn đã bị thu hồi',
  MSG_007: 'Tin nhắn trống',
  MSG_008: 'Nhắc tên không hợp lệ',
  MSG_009: 'Chỉ người gửi mới sửa được tin nhắn này',
  MSG_010: 'Đã đạt số tin ghim tối đa, hãy bỏ ghim một tin cũ',
  MSG_011: 'Tin nhắn thoại dài quá 5 phút',
  MSG_012: 'Không tìm thấy tin nhắn trong cuộc trò chuyện này',
  MSG_013: 'Biểu tượng cảm xúc không hợp lệ',
  MSG_014: 'Tin nhắn đã có quá nhiều loại cảm xúc',
  MSG_015: 'Không thể chuyển tiếp tin nhắn này',
  MSG_016: 'Không thể xem trước liên kết này',
  /** MỚI so với `be.md` gốc (mã THẬT trong BE) — chuyển tiếp `directUserId` khi hook hội thoại chưa đăng ký. */
  MSG_017: 'Chưa hỗ trợ chuyển tiếp tới người dùng trực tiếp (hội thoại chưa khả dụng)',
  MSG_018: 'Cuộc trò chuyện này không hỗ trợ luồng trả lời',
  MSG_019: 'Không thể tạo luồng trong một luồng',
  MSG_020: 'Bạn không được nhắc tất cả thành viên ở đây',
  MSG_021: 'Bạn đã nhắc tất cả quá nhiều lần, thử lại sau',

  // ── Mở rộng chat (p7-04, đồng bộ `be/src/core/utils/error.codes.ts`): khảo sát · tin hẹn giờ · nhắc lại ──
  POLL_001: 'Khảo sát cần từ 2 đến 10 lựa chọn, không trùng nhau và không quá dài',
  POLL_002: 'Thời hạn khảo sát phải ở tương lai và không quá 30 ngày',
  POLL_003: 'Khảo sát này chỉ cho chọn một lựa chọn',
  POLL_004: 'Khảo sát đã kết thúc, không thể bầu thêm',
  POLL_005: 'Không tìm thấy khảo sát hoặc lựa chọn',
  POLL_006: 'Khảo sát ẩn danh không hiển thị danh sách người bầu',
  SCHED_001: 'Thời điểm gửi phải sau ít nhất 1 phút và trong vòng 30 ngày',
  SCHED_002: 'Bạn đã có tối đa 50 tin hẹn giờ đang chờ gửi',
  SCHED_003: 'Tin hẹn giờ đã được gửi hoặc đã huỷ, không thể thay đổi',
  SCHED_004: 'Không thể gửi tin: bạn không còn quyền gửi hoặc cuộc trò chuyện đã đóng',
  REMIND_001: 'Thời điểm nhắc phải sau ít nhất 1 phút và trong vòng 365 ngày',
  REMIND_002: 'Bạn đã có tối đa 100 lời nhắc đang chờ',
};
