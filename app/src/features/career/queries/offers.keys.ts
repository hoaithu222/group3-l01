/**
 * Khoá React Query của Recruiter board phía sinh viên (app.md p6-08 §4) — MỌI tham số ảnh hưởng kết quả nằm trong khoá. Khai riêng, không thêm
 * vào `career.keys.ts` (file dùng chung với p6-06/p6-07). Danh sách lời mời KHÔNG có tham số lọc: nhóm Mới/Quan tâm/Đã đóng lọc phía app trên
 * cùng một bộ dữ liệu (BE chỉ lọc được một `status`), nên mọi màn dùng chung một khoá và socket chỉ vá một chỗ.
 */
export const offerKeys = {
  all: ['career', 'offers'] as const,
  list: () => ['career', 'offers', 'list'] as const,
  detail: (offerId: string) => ['career', 'offers', 'detail', offerId] as const,
  messages: (offerId: string) => ['career', 'offers', 'messages', offerId] as const,
  blocks: () => ['career', 'company-blocks'] as const,
  /** "Ai đã xem hồ sơ của tôi" — danh sách cursor, không tham số lọc. */
  profileViews: () => ['career', 'profile-views'] as const,
  jobSettings: () => ['career', 'job-settings'] as const,
};
