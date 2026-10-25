import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type { DueQueryDto, EnrollDto, SummaryQueryDto } from "../dtos";
import type { SrProgress } from "../entities/sr.interface";
import { srErrors, studyErrors } from "../study.errors";
import { addDaysToLocalDate, diffLocalDates, localDate, startOfLocalDayPlus, startOfNextLocalDay } from "./local-date";
import { ensureProgress, refreshAccess } from "./sr-access-sync";
import { newBudgets } from "./sr-budget";
import { toDueItemDto, type SrDueItemDto } from "./sr.presenter";
import { withSrClock, type ResolvedSrDeps, type SrDeps } from "./sr.deps";
import { loadSet } from "./study.deps";

export interface SrSummary {
  dueToday: number;
  newToday: number;
  /** 7 ngày kế tiếp (không gồm hôm nay), đủ 7 phần tử kể cả ngày 0 thẻ. */
  dueNext7Days: Array<{ date: string; count: number }>;
  reviewedToday: number;
  reviewStreakDays: number;
  serverNow: string;
}

export interface SrDueResult {
  items: SrDueItemDto[];
  remainingToday: number;
  serverNow: string;
}

/**
 * Ôn tập ngắt quãng — đăng ký bộ, hàng đợi hôm nay, tóm tắt (p4-02 be.md §5.6). "Hôm nay" = ngày địa phương theo `User.timezone`
 * (`nextReviewAt < 00:00 ngày mai`). Mỗi lần đọc hàng đợi/tóm tắt đồng bộ quyền trước (`refreshAccess`): bộ mất quyền → `SUSPENDED`
 * và không lộ nội dung (ST-24). Lượt ôn ở `SrReviewService`.
 */
export class SrService {
  private readonly d: ResolvedSrDeps;

  constructor(deps: SrDeps) {
    this.d = withSrClock(deps);
  }

  async enroll(user: AuthUser, dto: EnrollDto): Promise<{ setId: string; enrolledItems: number; newPerDay: number }> {
    const d = this.d;
    const set = await loadSet(d, dto.setId);
    await d.access.assertContent(user, set);
    if (set.status !== "ACTIVE") throw studyErrors.notFound();

    const items = await d.items.listBySet(set.id);
    if (items.length === 0) throw srErrors.noItems();
    const enrollment = await d.enrollments.upsert(user.id, set.id, { newPerDay: dto.newPerDay, defaultNewPerDay: LIMITS.sr.newPerDay });
    await ensureProgress(d, user.id, set, items);
    await d.enrollments.markSynced(enrollment.id, set.version);
    // Đăng ký lại bộ từng bị tạm ngừng do mất quyền (nay đọc lại được): mở các thẻ đó.
    await d.progress.reopenBySet(user.id, set.id);
    return { setId: set.id, enrolledItems: items.length, newPerDay: enrollment.newPerDay };
  }

  /** Bỏ đăng ký: tiến độ giữ nguyên, chỉ ngừng đưa thẻ MỚI (thẻ đã học vẫn đến hạn theo lịch). Chưa từng đăng ký → vẫn thành công. */
  async unenroll(user: AuthUser, setId: string): Promise<void> {
    await this.d.enrollments.deactivate(user.id, setId);
  }

  /** Job `sr.item-deleted`: xoá tiến độ của mục đã bị xoá khỏi bộ (mọi người ôn). Trả số hàng xoá. */
  purgeItems(itemIds: readonly string[]): Promise<number> {
    return this.d.progress.deleteByItems(itemIds);
  }

  async due(user: AuthUser, query: DueQueryDto): Promise<SrDueResult> {
    const d = this.d;
    const now = d.now();
    const tz = await d.users.getTimezone(user.id);
    const endOfToday = startOfNextLocalDay(now, tz);
    const viewable = await refreshAccess(d, user);
    const setIds = this.scope(viewable, query.setId);
    if (setIds.length === 0) return { items: [], remainingToday: 0, serverNow: now.toISOString() };

    const learning = await d.progress.listDue(user.id, { before: endOfToday, limit: query.limit, setIds });
    const budgets = await newBudgets(d, user.id, tz, now, setIds);
    const picked: SrProgress[] = [...learning];
    for (const b of budgets) {
      const room = query.limit - picked.length;
      if (room <= 0) break;
      picked.push(...(await d.progress.listNew(user.id, b.setId, Math.min(b.available, room))));
    }

    const items = await this.hydrate(picked, viewable);
    const dueTotal = await d.progress.countDue(user.id, endOfToday, setIds);
    const newTotal = budgets.reduce((n, b) => n + b.available, 0);
    return { items, remainingToday: Math.max(0, dueTotal + newTotal - items.length), serverNow: now.toISOString() };
  }

  async summary(user: AuthUser, query: SummaryQueryDto): Promise<SrSummary> {
    const d = this.d;
    const now = d.now();
    const tz = await d.users.getTimezone(user.id);
    const viewable = await refreshAccess(d, user);
    const setIds = this.scope(viewable, query.setId);
    const today = localDate(now, tz);
    const empty = setIds.length === 0;

    const dueToday = empty ? 0 : await d.progress.countDue(user.id, startOfNextLocalDay(now, tz), setIds);
    const newToday = empty ? 0 : (await newBudgets(d, user.id, tz, now, setIds)).reduce((n, b) => n + b.available, 0);
    const upcoming = empty
      ? []
      : await d.progress.listDueDates(user.id, startOfLocalDayPlus(now, tz, 1), startOfLocalDayPlus(now, tz, 8), setIds);

    const counts = new Map<string, number>();
    for (const at of upcoming) counts.set(localDate(at, tz), (counts.get(localDate(at, tz)) ?? 0) + 1);
    const dueNext7Days = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysToLocalDate(today, i + 1);
      return { date, count: counts.get(date) ?? 0 };
    });

    return {
      dueToday,
      newToday,
      dueNext7Days,
      reviewedToday: await d.logs.countByDate(user.id, today),
      reviewStreakDays: await this.streakDays(user.id, today),
      serverNow: now.toISOString(),
    };
  }

  /** Số ngày ôn LIÊN TIẾP tính tới hôm nay (chưa ôn hôm nay thì tính tới hôm qua — chuỗi chưa gãy). */
  private async streakDays(userId: string, today: string): Promise<number> {
    const dates = new Set(await this.d.logs.listLocalDates(userId, addDaysToLocalDate(today, -LIMITS.sr.reviewLogRetentionDays)));
    let cursor = dates.has(today) ? today : addDaysToLocalDate(today, -1);
    let streak = 0;
    while (dates.has(cursor) && diffLocalDates(cursor, today) <= LIMITS.sr.reviewLogRetentionDays) {
      streak += 1;
      cursor = addDaysToLocalDate(cursor, -1);
    }
    return streak;
  }

  private scope(viewable: ReadonlyMap<string, unknown>, setId?: string): string[] {
    if (setId) return viewable.has(setId) ? [setId] : [];
    return [...viewable.keys()];
  }

  /** Gắn nội dung mục; mục đã bị xoá khỏi bộ (job dọn chưa chạy) → bỏ qua và xoá tiến độ mồ côi. */
  private async hydrate(rows: readonly SrProgress[], viewable: ReadonlyMap<string, { title: string }>): Promise<SrDueItemDto[]> {
    const items = new Map((await this.d.items.findByIds(rows.map((r) => r.itemId))).map((i) => [i.id, i]));
    const orphans = rows.filter((r) => !items.has(r.itemId)).map((r) => r.itemId);
    if (orphans.length > 0) await this.d.progress.deleteByItems(orphans);
    return rows.flatMap((r) => {
      const item = items.get(r.itemId);
      return item ? [toDueItemDto(r, item, viewable.get(r.setId)?.title ?? "")] : [];
    });
  }
}
