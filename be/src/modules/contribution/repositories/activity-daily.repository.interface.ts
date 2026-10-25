import type { ActivityCell } from "../entities/contribution.interface";

export interface ActivityDayRow {
  boardId: string;
  userId: string;
  /** "YYYY-MM-DD" theo múi giờ báo cáo. */
  date: string;
  taskEvents: number;
  checklistEvents: number;
  commentEvents: number;
  reviewEvents: number;
  total: number;
}

export interface HeatmapFilter {
  boardId?: string;
  workspaceId?: string;
  userId?: string;
  /** Đầu/cuối khoảng, gồm cả hai đầu ("YYYY-MM-DD"). */
  from: string;
  to: string;
}

/** Ô heatmap `(bảng, người, ngày)` — chỉ ngày + số đếm, KHÔNG lưu giờ (riêng tư). Ghi bằng `$set` từ đếm nguồn nên idempotent. */
export interface IActivityDailyRepository {
  /**
   * Đặt các ô của bảng trong `[fromDate, toDate]` ĐÚNG BẰNG `cells`: ô mới/đổi được `$set`, ô đã có mà không còn hoạt động (không nằm
   * trong `cells`) bị xoá. Chạy nhiều lần cùng dữ liệu cho cùng kết quả; hai job đua ghi cùng khoá không lỗi.
   */
  replaceRange(boardId: string, workspaceId: string, fromDate: string, toDate: string, cells: readonly ActivityCell[]): Promise<void>;
  list(filter: HeatmapFilter): Promise<ActivityDayRow[]>;
}
