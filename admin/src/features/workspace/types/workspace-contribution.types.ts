/**
 * Kiểu dữ liệu khối "Báo cáo đóng góp" của tab `projects` — khớp `GET /admin/workspaces/:id/contribution-stats`
 * (`be/src/modules/contribution/services/contribution-stats.service.ts`, p4-06 admin.md §3).
 *
 * ⛔ CHỈ SỐ ĐẾM về tính năng (bao nhiêu bảng, bao nhiêu lần xuất, tính lại lúc nào). Bảng đóng góp là dữ liệu học
 * tập của nhóm và chỉ đọc với mọi vai trò: KHÔNG có (và không được thêm) trường nào mô tả người, điểm, tỷ lệ, hoạt
 * động theo ngày hay thẻ. `tests/features/workspace/contribution-stats.test.tsx` quét file này để chặn.
 *
 * Viết tay theo `admin.md` vì `openapi.json` chưa được sinh (p0-09).
 */
export interface ContributionStatsView {
  /** Số bảng có công thức do chủ nhóm tuỳ chỉnh (đã đổi ít nhất một lần). */
  boardsWithCustomWeights: number;
  /** Số lần xuất PDF trong `days` ngày gần nhất, theo kết quả. */
  exports: { ready: number; failed: number };
  /** ISO-8601 — lần tính lại gần nhất của bất kỳ bảng nào trong nhóm; `null` khi chưa bảng nào được tính. */
  lastComputedAt: string | null;
  /** Số bảng có thay đổi chưa được tính lại quá 1 giờ — dấu hiệu job `contribution.recompute` kẹt. */
  staleBoards: number;
  /** Số bảng đang chờ tính lại (gồm cả chờ debounce). */
  pendingBoards: number;
}
