/**
 * Mã lỗi `RSC_*` của Resource Hub (be.md p3-01 §8) → câu tiếng Việt.
 *
 * ⚠️ `be/src/core/utils/error.codes.ts` CHƯA có nhóm `RSC_*` lúc viết (BE p3-01
 * đang làm song song) — chép THẲNG bảng `be.md` §8. Đối chiếu lại khi BE xong.
 *
 * Để ở feature chứ không nhét `shared/constants/error-codes.ts`: bảng chung đã
 * ở trần dòng và đang được agent khác sửa; interceptor toàn cục vẫn toast được
 * vì BE trả sẵn câu tiếng Việt trong `error.message`. Bảng này phục vụ chỗ cần
 * câu TẠI CHỖ (lý do trên hàng đợi tải lên, lỗi dưới ô tên thư mục).
 */
export const RESOURCE_ERROR = {
  /** 400 — Thư mục vượt quá số cấp cho phép. */
  DEPTH: 'RSC_001',
  /** 409 — Đã có thư mục cùng tên ở vị trí này. */
  FOLDER_NAME_TAKEN: 'RSC_002',
  /** 400 — Tệp chưa sẵn sàng hoặc không thể thêm vào kho tài liệu. */
  ASSET_NOT_ATTACHABLE: 'RSC_003',
  /** 409 — Thư mục còn nội dung. */
  FOLDER_NOT_EMPTY: 'RSC_004',
  /** 409 — Tệp này chưa có bản xem trước. */
  NO_PREVIEW: 'RSC_005',
  /** 400 — Di chuyển thư mục vào chính nó / con của nó. */
  MOVE_INTO_SELF: 'RSC_006',
  /** 413 — Kho tài liệu của nhóm đã đầy. */
  QUOTA_EXCEEDED: 'RSC_007',
  /** 409 — Không khôi phục được vì vị trí gốc không còn. */
  RESTORE_PARENT_GONE: 'RSC_008',
  /** Xung đột phiên bản (`expectedVersion`) — mã chung của hệ thống. */
  VERSION_CONFLICT: 'RES_003',
} as const;

export const RESOURCE_ERROR_MESSAGES: Record<string, string> = {
  RSC_001: 'Thư mục vượt quá số cấp cho phép',
  RSC_002: 'Đã có thư mục cùng tên ở vị trí này',
  RSC_003: 'Tệp chưa sẵn sàng hoặc không thể thêm vào kho tài liệu',
  RSC_004: 'Thư mục còn nội dung, hãy xoá hoặc di chuyển nội dung trước',
  RSC_005: 'Tệp này chưa có bản xem trước',
  RSC_006: 'Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó',
  RSC_007: 'Kho tài liệu của nhóm đã đầy dung lượng',
  RSC_008: 'Không thể khôi phục vì vị trí gốc không còn',
  RES_003: 'Dữ liệu đã thay đổi, vui lòng tải lại rồi thử lại',
};
