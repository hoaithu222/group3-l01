/**
 * Kiểu dữ liệu tab `projects` (Dự án) — khớp `GET /admin/workspaces/:id/project-stats` của module
 * `projects` phía BE (p3-02 admin.md §3).
 *
 * ⛔ CHỈ SỐ LIỆU. Tên board (metadata tổ chức) CÓ hiển thị theo chốt của admin.md §2.1, nhưng KHÔNG
 * có (và không được thêm) trường nào nêu tiêu đề/mô tả thẻ, nhãn, người làm hay bình luận — đó là
 * dữ liệu của nhóm. `tests/features/workspace/projects-privacy.test.tsx` quét file này để chặn.
 *
 * Viết tay theo `admin.md` vì `openapi.json` chưa được sinh (p0-09).
 */
import type { ColumnKind } from '@/shared/constants/column-kinds';

/** Số thẻ theo loại cột (`ColumnKind`) — chỉ ĐẾM. */
export type ProjectCardsByKind = Record<ColumnKind, number>;

export interface ProjectBoardRow {
  id: string;
  name: string;
  archived: boolean;
  columnCount: number;
  byKind: ProjectCardsByKind;
  /** ISO-8601 — lần cập nhật gần nhất của bảng. */
  updatedAt: string;
}

export interface ProjectTotals {
  /**
   * Số bảng — BE (`admin-project-stats.service.ts`) đếm bảng ĐANG DÙNG (chưa lưu trữ) và trả riêng
   * `archivedBoards`; admin.md §3 chỉ ghi `boards`. Vì hai nguồn nói khác nhau, UI KHÔNG dựa vào hai số
   * này để hiện "số bảng" mà đếm từ `boards[]` (mỗi bảng có cờ `archived`).
   */
  boards: number;
  archivedBoards?: number;
  tasks: number;
  done30d: number;
  overdue: number;
}

export interface ProjectDoneWeek {
  /** ISO-8601 — ngày đầu tuần. */
  weekStart: string;
  count: number;
}

export interface ProjectStatsView {
  boards: ProjectBoardRow[];
  totals: ProjectTotals;
  /** 8 tuần gần nhất, cũ → mới. */
  doneByWeek: ProjectDoneWeek[];
}
