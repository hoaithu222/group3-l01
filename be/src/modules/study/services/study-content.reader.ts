import type { AuthUser } from "../../../core/types/express";
import { GRADABLE_ITEM_TYPES, type StudyItem } from "../entities/study-item.interface";
import type { StudySet } from "../entities/study-set.interface";
import type { StudyDeps } from "./study.deps";
import { loadSet } from "./study.deps";

/**
 * Cổng ĐỌC nội dung bộ học cho module khác (p5-01 live quiz; p4-02 cùng module dùng thẳng repository) — luôn kiểm
 * `StudySetAccess.canView` TRƯỚC khi trả nội dung, nên module gọi không phải (và không được) tự đọc `StudySet`/`StudyItem`.
 * Export qua `@modules/study/public` (`createStudyContentReader`).
 */
export class StudyContentReader {
  constructor(private readonly d: Pick<StudyDeps, "sets" | "items" | "access">) {}

  /** Bộ mà người dùng ĐỌC được nội dung; không thấy/đã ẩn/đã xoá → 404 trung tính. */
  async getViewableSet(user: AuthUser, setId: string): Promise<StudySet> {
    const set = await loadSet(this.d, setId);
    await this.d.access.assertContent(user, set);
    return set;
  }

  /** Mục CHẤM ĐƯỢC (trắc nghiệm/nhiều đáp án/đúng-sai/điền chỗ trống) của bộ, sắp theo `order` — đã kiểm quyền đọc. */
  async listGradableItems(user: AuthUser, setId: string): Promise<StudyItem[]> {
    const set = await this.getViewableSet(user, setId);
    return (await this.d.items.listBySet(set.id)).filter((i) => GRADABLE_ITEM_TYPES.includes(i.type));
  }
}
