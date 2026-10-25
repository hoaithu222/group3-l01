/**
 * Kiểu dữ liệu khối "Chấm chéo" của tab Dự án — khớp `GET /admin/workspaces/:id/review-stats?days=30`
 * (`be/src/modules/projects/services/review/review-stats.service.ts`, p4-05 admin.md §3).
 *
 * ⛔ CHỈ SỐ ĐẾM + tên bảng (metadata tổ chức). Lượt chấm là dữ liệu học tập của nhóm: KHÔNG có (và không được thêm)
 * trường nào mô tả tên người chấm, điểm, nhận xét hay tiêu đề thẻ. `tests/features/peer-review/review-stats-privacy.test.tsx`
 * quét file này để chặn.
 *
 * Viết tay theo `admin.md` vì `openapi.json` chưa được sinh (p0-09).
 */
export interface ReviewBoardRow {
  boardId: string;
  boardName: string;
  /** Bảng đang bật chấm chéo (do chủ nhóm đặt). */
  enabled: boolean;
  /** Số lượt chấm đang mở của bảng. */
  openRounds: number;
}

export interface ReviewStatsView {
  /** Lượt chấm đang mở (thẻ đang ở cột Review chờ duyệt). */
  openRounds: number;
  /** Lượt giao cho từng người chấm còn chờ nộp. */
  pendingReviews: number;
  /** Lượt giao chờ quá 72 giờ chưa nộp. */
  overdue72h: number;
  /** Trung vị (giờ) từ lúc được giao đến lúc nộp; `null` khi chưa có lượt nộp nào trong kỳ. */
  medianHoursToSubmit: number | null;
  /** Tổng số lượt chấm mở trong kỳ — mẫu số của tỉ lệ tự duyệt. */
  roundsInPeriod: number;
  /** Lượt tự duyệt do nhóm không đủ người chấm. */
  autoApprovedRounds: number;
  /** Lượt được OWNER/ADMIN miễn chấm. */
  waivedRounds: number;
  byBoard: ReviewBoardRow[];
}
