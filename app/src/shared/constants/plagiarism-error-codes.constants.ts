/**
 * Mã lỗi QUÉT TRÙNG LẶP NỘI BỘ (`PLAG_*`, p7-05) → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (cùng cách `wallet-error-codes.constants.ts`) — `error-codes.ts` trải bảng này vào
 * `ERROR_CODE_MESSAGES`, interceptor vẫn chỉ nhìn MỘT bảng.
 *
 * ⚠️ Đồng bộ với `be/src/core/utils/error.codes.ts` (mã THẬT thắng tài liệu). `CFG_005` (cờ `plagiarism` tắt) là mã
 * CHUNG nằm ở bảng chung — màn hub/tạo lượt quét ẩn theo 404 trước khi tới bước hiện câu đó.
 */
export const PLAGIARISM_ERROR_MESSAGES: Record<string, string> = {
  PLAG_001: 'Số tệp quét không hợp lệ (tối đa 50 tệp; so với nhau cần ít nhất 2 tệp)',
  PLAG_002: 'Các tệp đã chọn chưa hỗ trợ kiểm tra trùng lặp',
  PLAG_003: 'Nhóm đang có lượt quét khác đang chạy, hãy đợi lượt trước hoàn tất',
  PLAG_004: 'Nhóm đã dùng hết số lượt quét trong ngày hôm nay',
  PLAG_005: 'Lượt quét chưa hoàn tất hoặc đã kết thúc',
  PLAG_006: 'Báo cáo đã hết thời hạn lưu trữ (180 ngày)',
};
