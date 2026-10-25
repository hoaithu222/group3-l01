import type { ColumnKindValue } from "../../../core/constants/project";

export interface StatsBoardRow {
  id: string;
  name: string;
  archivedAt: Date | null;
  columnCount: number;
  updatedAt: Date;
}

/** Truy vấn tổng hợp CHỈ SỐ LIỆU cho admin — không bao giờ trả tiêu đề/mô tả thẻ (dữ liệu nhóm). */
export interface IProjectStatsRepository {
  workspaceExists(workspaceId: string): Promise<boolean>;
  listBoards(workspaceId: string): Promise<StatsBoardRow[]>;
  /** Số thẻ chưa xoá theo (bảng, loại cột). */
  countByBoardAndKind(workspaceId: string): Promise<{ boardId: string; kind: ColumnKindValue; count: number }[]>;
  /** Thẻ chưa xoá, có hạn < `now`, chưa ở cột DONE. */
  countOverdue(workspaceId: string, now: Date): Promise<number>;
  /** `completedAt` của thẻ chưa xoá hoàn thành từ `since` (chặn `limit` bản ghi). */
  completedSince(workspaceId: string, since: Date, limit: number): Promise<Date[]>;
}
