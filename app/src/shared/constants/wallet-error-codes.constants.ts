/**
 * Mã lỗi VÍ NHÓM (`WALLET_*`, p6-04) → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (đã ở trần dòng của `file-size-manifest.json`, nhiều
 * module cùng nối thêm khối) — cùng cách `message-error-codes.constants.ts`.
 * `error-codes.ts` trải bảng này vào `ERROR_CODE_MESSAGES`, nên interceptor
 * (`client.helpers.ts`) vẫn chỉ nhìn MỘT bảng.
 *
 * ⚠️ Đồng bộ với `be/src/core/utils/error.codes.ts` (mã THẬT thắng tài liệu). Câu
 * ở đây viết theo giọng app ("bạn") và nói rõ VIỆC NÊN LÀM tiếp theo, khác câu BE.
 * `CFG_005` (cờ `wallet` tắt) là mã CHUNG của mọi phân hệ nên nằm ở bảng chung
 * nếu cần — ví ẩn màn theo 404 trước khi tới bước hiện câu đó.
 */
export const WALLET_ERROR_MESSAGES: Record<string, string> = {
  WALLET_001: 'Có người tham gia không còn thuộc nhóm. Hãy bỏ họ khỏi khoản chia rồi thử lại',
  WALLET_002: 'Tổng số tiền chia chưa khớp với số tiền khoản chi',
  WALLET_003: 'Ảnh chưa xử lý xong. Vui lòng đợi ảnh tải xong rồi thử lại',
  WALLET_004: 'Khoản chi này đã có người thanh toán nên không sửa được. Hãy tạo khoản điều chỉnh',
  WALLET_005: 'Khoản nợ vừa thay đổi. Số tiền bạn nhập vượt quá khoản nợ hiện tại',
  WALLET_006: 'Bạn không thể trả tiền cho chính mình',
  WALLET_007: 'Giao dịch này không còn ở trạng thái chờ xác nhận',
  WALLET_008: 'Nơi đăng tin nhắc nợ không hợp lệ. Hãy chọn lại',
  WALLET_009: 'Bạn chỉ lưu được tối đa 3 tài khoản nhận tiền. Hãy xoá bớt một tài khoản',
  WALLET_010: 'Vừa nhắc nợ gần đây. Mỗi giờ chỉ nhắc được một lần',
};
