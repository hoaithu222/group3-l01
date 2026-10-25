import type { StudyItem, StudyItemCreateInput, StudyItemUpdateInput } from "../entities/study-item.interface";
import type { TxHandle } from "./tx";

export interface StudyItemListParams {
  setId: string;
  /** Mục đứng SAU `(order, id)` này (sắp tăng dần). */
  after?: { order: number; id: string };
  limit: number;
}

export interface IStudyItemRepository {
  /** Toàn bộ mục của bộ (≤ `itemsPerSetMax`), sắp `order asc, id asc`. */
  listBySet(setId: string, tx?: TxHandle): Promise<StudyItem[]>;
  list(params: StudyItemListParams): Promise<StudyItem[]>;
  findById(id: string): Promise<StudyItem | null>;
  /** Nhiều mục theo id (p4-02: nội dung thẻ đến hạn) — id không tồn tại bị bỏ qua; thứ tự KHÔNG bảo đảm. */
  findByIds(ids: readonly string[]): Promise<StudyItem[]>;
  /** `setId` của một mục — resolver quyền đọc asset `STUDY_ITEM` (không nạp cả mục). */
  findSetId(itemId: string): Promise<string | null>;
  countBySet(setId: string, tx?: TxHandle): Promise<number>;
  createMany(items: StudyItemCreateInput[], tx: TxHandle): Promise<void>;
  /** Ghi đè nội dung (và `order` nếu có), `version + 1`. `false` = mục không thuộc bộ. */
  update(setId: string, id: string, input: StudyItemUpdateInput, tx: TxHandle): Promise<boolean>;
  /** Chỉ đổi `order` (nén lại thứ tự). */
  setOrder(setId: string, id: string, order: number, tx: TxHandle): Promise<void>;
  /** Xoá cứng các mục THUỘC bộ; trả số mục thật sự xoá. */
  deleteMany(setId: string, ids: string[], tx: TxHandle): Promise<number>;
}
