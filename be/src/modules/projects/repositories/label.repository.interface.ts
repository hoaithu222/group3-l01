import type { Label, LabelCreateInput, LabelPatch } from "../entities/label.interface";
import type { TxContext } from "./unit-of-work";

export interface ILabelRepository {
  findById(id: string): Promise<Label | null>;
  listByBoard(boardId: string): Promise<Label[]>;
  /** Nhãn của bảng theo danh sách id (id không thuộc bảng vắng mặt) — kiểm `labelIds` của thẻ. */
  findByBoardAndIds(boardId: string, ids: string[], tx?: TxContext): Promise<Label[]>;
  countByBoard(boardId: string): Promise<number>;
  /** `null` khi trùng `(boardId, normalizedName)` (unique). Không nuốt lỗi khác. */
  create(input: LabelCreateInput): Promise<Label | null>;
  /** `null` khi nhãn không còn HOẶC đổi tên trùng nhãn khác (`conflict` phân biệt ở service bằng `findByName`). */
  update(id: string, patch: LabelPatch): Promise<Label | null>;
  findByName(boardId: string, normalizedName: string): Promise<Label | null>;
  delete(id: string): Promise<boolean>;
}
