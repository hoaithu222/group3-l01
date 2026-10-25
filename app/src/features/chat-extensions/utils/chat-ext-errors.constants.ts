/**
 * Mã lỗi backend → câu tiếng Việt CỦA NGỮ CẢNH (p7-04). Bảng chung của app (`shared/constants/error-codes.ts`) có cùng các mã này, nhưng câu ở đây nói theo
 * việc người dùng đang làm ("Khảo sát không còn khả dụng" thay vì "Không tìm thấy khảo sát hoặc lựa chọn"), và KHÔNG nhắc con số cụ thể (10 lựa chọn, 30 ngày, 50 tin…):
 * giới hạn này admin hạ được (`SystemConfig limits.*`) nên con số cứng trong câu sẽ sai. Feature tắt toast của interceptor (`skipErrorToast`) để tự hiện câu này.
 */
export const CHAT_EXT_ERROR_MESSAGES: Record<string, string> = {
  POLL_001: 'Khảo sát cần đủ số lựa chọn cho phép, không trùng nhau và không quá dài',
  POLL_002: 'Hạn kết thúc phải ở tương lai và trong giới hạn cho phép',
  POLL_003: 'Khảo sát này chỉ cho chọn một lựa chọn',
  POLL_004: 'Khảo sát đã kết thúc, không thể bầu thêm',
  POLL_005: 'Khảo sát không còn khả dụng',
  POLL_006: 'Khảo sát ẩn danh không hiển thị danh sách người bầu',
  SCHED_001: 'Thời điểm gửi phải sau ít nhất 1 phút và trong giới hạn cho phép',
  SCHED_002: 'Bạn đã đạt số tin hẹn giờ tối đa đang chờ gửi, hãy huỷ bớt hoặc chờ tin gửi đi',
  SCHED_003: 'Tin này đã được gửi hoặc đã huỷ nên không thể thay đổi',
  SCHED_004: 'Bạn không còn quyền gửi tin ở đây hoặc cuộc trò chuyện đã đóng',
  REMIND_001: 'Thời điểm nhắc phải sau ít nhất 1 phút và trong giới hạn cho phép',
  REMIND_002: 'Bạn đã đạt số lời nhắc tối đa đang chờ, hãy xoá bớt lời nhắc cũ',
  MSG_001: 'Tin nhắn quá dài',
  MSG_004: 'Bạn không thể gửi tin ở đây',
  MSG_005: 'Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ',
  MSG_006: 'Tin nhắn đã bị thu hồi hoặc không phải tin thường nên không thể chuyển đổi',
  MSG_007: 'Tin nhắn trống',
  MSG_008: 'Nhắc tên không hợp lệ',
  MSG_012: 'Tin không còn khả dụng',
  RSC_003: 'Tệp chưa sẵn sàng hoặc không thể thêm vào kho tài liệu',
  RSC_007: 'Kho tài liệu của nhóm đã đầy dung lượng',
  RES_003: 'Tin hẹn giờ vừa được thay đổi ở nơi khác, danh sách đã được tải lại',
  CFG_005: 'Tính năng này đang tạm tắt',
  SYS_501: 'Tính năng này chưa được cấu hình',
  SYS_503: 'Nhiều người đang thao tác cùng lúc, hãy thử lại sau ít giây',
  PERM_404: 'Không còn quyền truy cập nội dung này',
};

/** `VAL_001` kèm `details.reason` (BE `message-conversion.service.ts`) — dùng chung cho "Tạo task" (đích = bảng) và "Lưu vào tài liệu" (đích = nhóm). */
export const CHAT_EXT_VALIDATION_REASONS: Record<string, string> = {
  WORKSPACE_MISMATCH: 'Đích bạn chọn không thuộc cùng nhóm với tin nhắn. Hãy chọn bảng/nhóm của nhóm chứa cuộc trò chuyện.',
  ASSET_NOT_IN_MESSAGE: 'Tệp không thuộc tin nhắn này',
};
