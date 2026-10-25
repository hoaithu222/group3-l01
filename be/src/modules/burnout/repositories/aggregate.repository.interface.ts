import type { WellbeingLevel } from "../domain/burnout-rules";

/**
 * Cổng đọc dành RIÊNG cho số liệu admin. QUYỀN RIÊNG TƯ được khoá ở CHÍNH kiểu này: mọi hàm chỉ trả về SỐ ĐẾM/PHÂN BỐ — không có hàm nào nhận hay trả `userId`, nên service admin không có cách nào (kể cả do lỗi
 * lập trình) lộ dữ liệu của một người. Test `burnout-privacy.test.ts` khoá danh sách hàm này.
 */
export interface IBurnoutAggregateRepository {
  /** Số người ĐANG bật theo dõi. */
  countEnabled(): Promise<number>;

  /** Số cảnh báo đã gửi trong `[from, to)`. */
  countAlertedBetween(from: Date, to: Date): Promise<number>;

  /** Phân bố mức HIỆN TẠI: mỗi người một lần (đánh giá mới nhất có `date ≥ sinceDate`) rồi đếm theo mức. */
  latestLevelCounts(sinceDate: string): Promise<Record<WellbeingLevel, number>>;
}
