import type { AuthUser } from "../../../core/types/express";
import type { StudyItem } from "../entities/study-item.interface";
import type { StudySet } from "../entities/study-set.interface";
import type { SrProgressCreateInput, SrSuspendReason } from "../entities/sr.interface";
import type { ResolvedSrDeps } from "./sr.deps";
import { initialNewState } from "./sm2";

/**
 * Đồng bộ quyền + mục cho tiến độ ôn của MỘT người, gọi đầu `GET /sr/due` và `GET /sr/summary` (p4-02 be.md §5.6):
 *  - bộ người này KHÔNG còn đọc được (đổi phạm vi, mất quyền nhóm, bộ ẩn/xoá) → tạm ngừng (`SUSPENDED`, không xoá);
 *  - bộ đã đọc lại được → mở lại về `NEW | LEARNING | REVIEW`;
 *  - bộ đã đăng ký nhưng `StudySet.version` đổi từ lần đồng bộ trước → nạp mục MỚI thêm sau khi đăng ký (`SrEnrollment.syncedVersion`).
 * Trả các bộ ĐỌC ĐƯỢC (id → bộ).
 */
export async function refreshAccess(d: ResolvedSrDeps, user: AuthUser): Promise<Map<string, StudySet>> {
  const setIds = await d.progress.listSetIds(user.id);
  if (setIds.length === 0) return new Map();

  const sets = await d.sets.findByIds(setIds);
  const viewable = new Map((await d.access.filterViewable(user, sets)).map((s) => [s.id, s]));
  const byId = new Map(sets.map((s) => [s.id, s]));

  const lost = setIds.filter((id) => !viewable.has(id));
  const reasonOf = (id: string): SrSuspendReason => {
    const s = byId.get(id);
    return !s || s.status !== "ACTIVE" ? "SET_HIDDEN" : "LOST_ACCESS";
  };
  for (const reason of ["SET_HIDDEN", "LOST_ACCESS"] as const) {
    await d.progress.suspendBySets(user.id, lost.filter((id) => reasonOf(id) === reason), reason);
  }
  for (const id of await d.progress.listSuspendedSetIds(user.id)) {
    if (viewable.has(id)) await d.progress.reopenBySet(user.id, id);
  }

  await syncEnrollments(d, user.id, viewable);
  return viewable;
}

async function syncEnrollments(d: ResolvedSrDeps, userId: string, viewable: ReadonlyMap<string, StudySet>): Promise<void> {
  for (const e of await d.enrollments.listActive(userId, [...viewable.keys()])) {
    const set = viewable.get(e.setId);
    if (!set || set.status !== "ACTIVE" || e.syncedVersion === set.version) continue;
    await ensureProgress(d, userId, set, await d.items.listBySet(set.id));
    await d.enrollments.markSynced(e.id, set.version);
  }
}

/** Tạo tiến độ `NEW` cho các mục CHƯA có (NGOÀI transaction). Trả số hàng tạo mới. */
export async function ensureProgress(d: ResolvedSrDeps, userId: string, set: StudySet, items: readonly StudyItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const have = new Set((await d.progress.findByUserItems(userId, items.map((i) => i.id))).map((p) => p.itemId));
  const fresh = initialNewState(d.now());
  const rows: SrProgressCreateInput[] = items
    .filter((i) => !have.has(i.id))
    .map((i) => ({ ...fresh, userId, itemId: i.id, setId: set.id, source: "ENROLL", itemOrder: i.order }));
  return d.progress.createMissing(rows);
}
