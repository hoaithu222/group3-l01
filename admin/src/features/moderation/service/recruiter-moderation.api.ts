/**
 * Đường dẫn kiểm duyệt LỜI MỜI việc làm — khớp `be/src/modules/recruiter/admin-recruiter.routes.ts` (p6-08). Cả hai cần `recruiter:approve` theo VAI HỆ THỐNG
 * (nhân sự doanh nghiệp có `recruiter:*` theo dữ liệu KHÔNG vào được). Không gắn cờ tính năng: vận hành xử lý được cả khi bảng tin tuyển dụng đang tắt.
 * Báo cáo `COMPANY` không có đường riêng ở đây — dùng `GET /admin/companies/:id` và `POST /admin/companies/:id/suspend` của phân hệ `recruiter`.
 */
const seg = encodeURIComponent;

export const recruiterModerationApi = {
  /**
   * GET — nội dung lời mời BỊ BÁO CÁO (404 khi lời mời chưa có báo cáo nào). ⚠ MỖI LẦN GỌI BE ghi nhật ký `job-offer.view-reported`
   * (giống nội dung riêng tư D-06) → chỉ gọi sau khi người dùng xác nhận, không refetch ngầm.
   */
  reported: (offerId: string) => `/admin/job-offers/${seg(offerId)}/reported`,
  /** POST `{ reason }` — thu hồi lời mời vi phạm (đã có báo cáo) + đóng báo cáo mở; `409 RECR_009` khi lời mời không còn mở. */
  withdraw: (offerId: string) => `/admin/job-offers/${seg(offerId)}/withdraw`,
} as const;

/** Mã BE khi lời mời không còn ở trạng thái mở (đã thu hồi/từ chối/hết hạn) — đồng bộ lại thay vì kẹt hộp thoại. */
export const OFFER_INVALID_STATE_CODE = 'RECR_009';
