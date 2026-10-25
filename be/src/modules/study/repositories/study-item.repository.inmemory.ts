import type { StudyItem, StudyItemCreateInput, StudyItemUpdateInput } from "../entities/study-item.interface";
import type { IStudyItemRepository, StudyItemListParams } from "./study-item.repository.interface";

const byOrder = (a: StudyItem, b: StudyItem): number => a.order - b.order || (a.id < b.id ? -1 : 1);

/** Test — cùng ngữ nghĩa với bản Prisma (sắp `order asc, id asc`; mục chỉ đổi khi đúng `setId`). */
export class InMemoryStudyItemRepository implements IStudyItemRepository {
  readonly items = new Map<string, StudyItem>();
  /** Đếm số lần ghi — test khẳng định "không ghi gì khi validate lỗi". */
  writes = 0;
  private clock = 0;

  private tick(): Date {
    this.clock += 1;
    return new Date(Date.UTC(2026, 8, 1, 0, 0, 0) + this.clock * 1000);
  }

  listBySet(setId: string): Promise<StudyItem[]> {
    return Promise.resolve([...this.items.values()].filter((i) => i.setId === setId).sort(byOrder).map((i) => ({ ...i })));
  }

  list(p: StudyItemListParams): Promise<StudyItem[]> {
    const after = p.after;
    const rows = [...this.items.values()]
      .filter((i) => i.setId === p.setId && (!after || i.order > after.order || (i.order === after.order && i.id > after.id)))
      .sort(byOrder);
    return Promise.resolve(rows.slice(0, p.limit).map((i) => ({ ...i })));
  }

  findById(id: string): Promise<StudyItem | null> {
    const item = this.items.get(id);
    return Promise.resolve(item ? { ...item } : null);
  }

  findByIds(ids: readonly string[]): Promise<StudyItem[]> {
    return Promise.resolve(ids.flatMap((id) => (this.items.has(id) ? [{ ...(this.items.get(id) as StudyItem) }] : [])));
  }

  findSetId(itemId: string): Promise<string | null> {
    return Promise.resolve(this.items.get(itemId)?.setId ?? null);
  }

  countBySet(setId: string): Promise<number> {
    return Promise.resolve([...this.items.values()].filter((i) => i.setId === setId).length);
  }

  createMany(items: StudyItemCreateInput[]): Promise<void> {
    const now = this.tick();
    for (const i of items) {
      this.writes += 1;
      this.items.set(i.id, { ...i, version: 1, createdAt: now, updatedAt: now });
    }
    return Promise.resolve();
  }

  update(setId: string, id: string, input: StudyItemUpdateInput): Promise<boolean> {
    const item = this.items.get(id);
    if (!item || item.setId !== setId) return Promise.resolve(false);
    this.writes += 1;
    const { order, ...content } = input;
    Object.assign(item, content, order !== undefined ? { order } : {}, { version: item.version + 1, updatedAt: this.tick() });
    return Promise.resolve(true);
  }

  setOrder(setId: string, id: string, order: number): Promise<void> {
    const item = this.items.get(id);
    if (item && item.setId === setId) {
      this.writes += 1;
      item.order = order;
    }
    return Promise.resolve();
  }

  deleteMany(setId: string, ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const item = this.items.get(id);
      if (item && item.setId === setId) {
        this.items.delete(id);
        this.writes += 1;
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}
