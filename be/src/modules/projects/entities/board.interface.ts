import type { ColumnKindValue } from "../../../core/constants/project";
import type { BoardReviewConfig } from "./task-review.interface";

export type { ColumnKindValue };

export interface BoardColumn {
  /** "c_" + 8 ký tự [A-Za-z0-9], ổn định khi đổi tên. */
  id: string;
  title: string;
  kind: ColumnKindValue;
  order: number;
  wipLimit: number | null;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  columns: BoardColumn[];
  /**
   * (p4-05) Cấu hình chấm chéo THÔ (JSON, có thể `null`/hỏng) — CHỈ đọc qua `parseBoardReview`, ghi qua `updateReviewCas`.
   * Tuỳ chọn để mọi nơi dựng `Board` cũ (test, repository in-memory) không phải khai.
   */
  review?: unknown;
  createdBy: string;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardCreateInput {
  workspaceId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  columns: BoardColumn[];
  /** (p4-05) Ảnh chụp mặc định chấm chéo (`SystemConfig pm.review`) tại lúc tạo — vắng ⇒ `null` (tắt). */
  review?: BoardReviewConfig;
  createdBy: string;
}

/** Trường sửa được qua `PATCH /boards/:id` (CAS theo version). */
export interface BoardPatch {
  name?: string;
  normalizedName?: string;
  description?: string | null;
  columns?: BoardColumn[];
}

/** Số thẻ chưa xoá của một bảng (một truy vấn nhóm cho nhiều bảng, không N+1). */
export interface BoardTaskCounts {
  /** `columnId` → số thẻ chưa xoá. */
  byColumn: Map<string, number>;
  total: number;
}
