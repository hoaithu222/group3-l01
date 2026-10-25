import type { ContributionSnapshotRow } from "../entities/contribution.interface";

/** Kết quả tính sẵn theo `(bảng, người, kỳ)` — `ALL` và các tháng có dữ liệu; tuần không lưu (tính khi xem, cache). */
export interface IContributionSnapshotRepository {
  /** Thay TOÀN BỘ snapshot của bảng bằng `rows` trong một transaction (người đọc không thấy trạng thái nửa vời). */
  replaceForBoard(boardId: string, rows: readonly ContributionSnapshotRow[]): Promise<void>;
  listByPeriod(boardId: string, periodKey: string): Promise<ContributionSnapshotRow[]>;
  /** Snapshot `ALL` của MỘT người ở mọi bảng — cho `ContributionReadPort` (p6-07/p6-08). */
  listAllPeriodByUser(userId: string): Promise<ContributionSnapshotRow[]>;
}
