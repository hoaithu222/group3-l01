import { localDate } from "./local-date";
import type { ResolvedSrDeps } from "./sr.deps";

export interface NewBudget {
  setId: string;
  /** Số thẻ mới còn được đưa vào hàng đợi hôm nay (`newPerDay − đã ôn thẻ mới hôm nay`). */
  allowed: number;
  /** `min(allowed, số thẻ NEW còn lại)`. */
  available: number;
}

/**
 * "Thẻ mới/ngày" (p4-02 README §2): mỗi bộ đăng ký được đưa tối đa `newPerDay` thẻ MỚI mỗi ngày địa phương; đã ôn bao nhiêu thẻ mới
 * hôm nay (`SrReviewLog.prevInterval = 0`) thì trừ đi. Bộ tắt đăng ký (`active = false`) không đưa thẻ mới.
 */
export async function newBudgets(d: ResolvedSrDeps, userId: string, tz: string, now: Date, setIds?: readonly string[]): Promise<NewBudget[]> {
  const today = localDate(now, tz);
  const out: NewBudget[] = [];
  for (const e of await d.enrollments.listActive(userId, setIds)) {
    const reviewedNew = await d.logs.countByDate(userId, today, { newOnly: true, setId: e.setId });
    const allowed = Math.max(0, e.newPerDay - reviewedNew);
    const available = allowed > 0 ? Math.min(allowed, await d.progress.countNew(userId, e.setId)) : 0;
    out.push({ setId: e.setId, allowed, available });
  }
  return out;
}
