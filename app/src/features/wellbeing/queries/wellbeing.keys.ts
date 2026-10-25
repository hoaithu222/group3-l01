import type { WellbeingDays } from '../api/wellbeing.types';

/**
 * Khoá cache. Đăng xuất: `wipeUserData()` gọi `queryClient.clear()` nên KHÔNG có dữ liệu sức khoẻ nào còn lại cho người dùng kế tiếp — và feature
 * này KHÔNG có store/AsyncStorage nào cần khai ở `user-scoped-stores.constants.ts` (không lưu bền gì cả). Không có `persistQueryClient` trong app,
 * nên cache này chỉ nằm ở bộ nhớ.
 */
export const wellbeingKeys = {
  all: ['wellbeing'] as const,
  setting: () => ['wellbeing', 'setting'] as const,
  /** Tiền tố của MỌI lịch sử (7 và 30 ngày) — để xoá/làm mới cùng lúc. */
  historyAll: () => ['wellbeing', 'history'] as const,
  /** `days` là tham số của kết quả ⇒ nằm TRONG key (thiếu thì đổi 7↔30 mà biểu đồ không đổi). */
  history: (days: WellbeingDays) => ['wellbeing', 'history', { days }] as const,
  /** P1 — danh sách nhóm tôi đã tự chia sẻ. */
  shares: () => ['wellbeing', 'shares'] as const,
};
