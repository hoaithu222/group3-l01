/**
 * Mã lỗi Bảng công việc & chi tiết thẻ (p3-02, p3-03) → câu tiếng Việt.
 *
 * Tách khỏi `error-codes.ts` (sát trần dòng của `file-size-manifest.json`) theo đúng
 * mẫu `access-error-codes.constants.ts`; `error-codes.ts` trải bảng này vào
 * `ERROR_CODE_MESSAGES`, nên `client.helpers.ts` vẫn chỉ tra MỘT bảng.
 *
 * Nguồn: `be/src/core/utils/error.codes.ts` (khối "Projects", be.md p3-02 §8 và p3-03).
 * `TASK_005/006` và `TASK_017..021` DÀNH CHO p4-04 (phụ thuộc/dời lịch) — chưa khai ở đây.
 * ⚠️ p3-03 thêm mã của mình VÀO file này (đừng tạo bảng thứ hai): p3-02 khai đủ
 * `TASK_001..016` hiện có ở BE để hai module không giẫm chân nhau lúc hợp nhất.
 */
export const TASK_ERROR_MESSAGES: Record<string, string> = {
  // ── p3-02: bảng · cột · thẻ · nhãn ───────────────────────────────────────
  TASK_001: 'Cột không tồn tại trên bảng này',
  TASK_002: 'Thẻ chưa đủ điều kiện để hoàn thành',
  TASK_007: 'Cột còn thẻ, hãy chuyển thẻ trước khi xoá cột',
  TASK_008: 'Bảng phải có đúng một cột Hoàn thành và không đổi loại cột đang có thẻ',
  TASK_009: 'Nhóm đã đạt số bảng tối đa',
  TASK_010: 'Bảng đã đạt số thẻ tối đa',
  TASK_011: 'Bảng đã đạt số nhãn tối đa',

  // ── p3-03: chi tiết thẻ, checklist, đính kèm, bình luận ──────────────────
  TASK_003: 'Checklist đã đạt số mục tối đa',
  TASK_004: 'Tệp đính kèm chưa sẵn sàng hoặc không hợp lệ',
  TASK_012: 'Thẻ đã đạt số tệp đính kèm tối đa',
  TASK_013: 'Ngày bắt đầu phải trước hạn chót',
  TASK_014: 'Có người được nhắc tên không thuộc nhóm',
  TASK_015: 'Đã quá thời gian cho phép sửa bình luận',
  TASK_016: 'Thẻ đã xoá quá lâu, không thể khôi phục',
};
