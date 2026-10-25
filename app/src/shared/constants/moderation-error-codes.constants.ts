/**
 * Mã lỗi BÁO CÁO / KIỂM DUYỆT / CHẶN (`MOD_*`, `BLOCK_*`, p1-08) → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (đã ở trần dòng của `file-size-manifest.json`, nhiều module cùng
 * nối thêm khối) — cùng cách `message-error-codes.constants.ts`. `error-codes.ts` trải bảng này
 * vào `ERROR_CODE_MESSAGES`, nên interceptor (`client.helpers.ts`) vẫn chỉ nhìn MỘT bảng.
 *
 * ⚠️ Đồng bộ với `be/src/core/utils/error.codes.ts` (mã THẬT thắng tài liệu).
 *
 * ⛔ Ba mã liên quan tới việc BỊ CHẶN (`BLOCK_002`, `BLOCK_003`, và `MSG_004`/`CONV_002` ở bảng
 * khác) PHẢI giữ câu TRUNG TÍNH — không được viết "bạn đã bị chặn" hay "người này đã chặn bạn".
 * README p1-08 §2: người bị chặn không được biết mình bị chặn, kể cả gián tiếp qua câu lỗi.
 * `BLOCK_001` ("với chính bạn") thì khác: nó chỉ xảy ra khi TỰ báo cáo/TỰ chặn mình.
 */
export const MODERATION_ERROR_MESSAGES: Record<string, string> = {
  MOD_001: 'Báo cáo này đã được xử lý bởi người khác',
  MOD_002: 'Nội dung không còn khả dụng',
  MOD_003: 'Không thể thực hiện thao tác này với loại báo cáo này',
  MOD_004: 'Bạn không có quyền xem nội dung này',
  MOD_005: 'Quyền xem nội dung đã hết hạn',
  MOD_006: 'Bạn đã gửi quá nhiều báo cáo, hãy thử lại sau',
  BLOCK_001: 'Không thể thực hiện với chính bạn',
  /** BE khai nhưng CHƯA nhánh nào dùng (README p1-08 §10) — giữ câu trung tính phòng khi có. */
  BLOCK_002: 'Không thể gửi tin nhắn cho người này',
  BLOCK_003: 'Không thể thêm người này',
  BLOCK_004: 'Bạn đã chặn số người tối đa. Hãy bỏ chặn bớt trước khi chặn thêm',
};
