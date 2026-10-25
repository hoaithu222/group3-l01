import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { StudyUserZone } from "../repositories/user-directory";
import { STUDY_NOTIFICATION_TYPES } from "../notifications/study.notification-types";
import { localDate, localHour, safeTimeZone } from "./local-date";
import { actingUser } from "./mock.deps";
import type { SrService } from "./sr.service";
import { withSrClock, type ResolvedSrDeps, type SrDeps } from "./sr.deps";

/** Cỡ lô người quét mỗi vòng. */
const BATCH = 200;
/** Cận trên của "cuối ngày địa phương" ở mọi múi giờ (UTC+14 → tối đa `now + 24h`) + dư. */
const HORIZON_MS = 26 * 3_600_000;

/**
 * Nhắc ôn hằng ngày (p4-02 be.md §7): job TĨNH mỗi giờ (`sr.daily-reminder`, `0 * * * *`) — chọn các múi giờ có giờ địa phương = giờ nhắc
 * (`LIMITS.sr.reminderLocalHour`), tìm người ACTIVE ở các múi giờ đó có thẻ đến hạn, tính `dueToday + newToday` bằng CHÍNH `SrService.summary`
 * (đã lọc quyền), > 0 → `notify()` `SR_DUE_REMINDER`. Idempotent theo `dedupeKey = sr-due:<userId>:<localDate>` (job chạy lại/hai lần vô hại).
 * ⛔ KHÔNG dùng scheduler theo-người/múi giờ — `syncCronSchedulers()` xoá mọi scheduler không nằm trong registry tĩnh.
 */
export class SrReminderService {
  private readonly d: ResolvedSrDeps;

  constructor(deps: SrDeps, private readonly sr: Pick<SrService, "summary">) {
    this.d = withSrClock(deps);
  }

  /** Trả số người đã được nhắc. */
  async run(): Promise<number> {
    const d = this.d;
    const now = d.now();
    const due = (await d.users.listTimezones()).filter((tz) => localHour(now, safeTimeZone(tz)) === LIMITS.sr.reminderLocalHour);
    if (due.length === 0) return 0;

    const before = new Date(now.getTime() + HORIZON_MS);
    let afterUserId: string | undefined;
    let notified = 0;
    for (;;) {
      const ids = await d.progress.listCandidateUserIds(before, { afterUserId, limit: BATCH });
      if (ids.length === 0) break;
      afterUserId = ids[ids.length - 1];
      for (const user of await d.users.findActiveByTimezones(ids, due)) notified += await this.remindOne(user, now);
      if (ids.length < BATCH) break;
    }
    return notified;
  }

  private async remindOne(user: StudyUserZone, now: Date): Promise<number> {
    const d = this.d;
    try {
      const s = await this.sr.summary(actingUser(user.id), {});
      const count = s.dueToday + s.newToday;
      if (count <= 0) return 0;
      const day = localDate(now, user.timezone);
      const key = `sr-due:${user.id}:${day}`;
      await d.tx.run((tx) =>
        d.notifier.notify(tx, {
          type: STUDY_NOTIFICATION_TYPES.SR_DUE_REMINDER,
          scope: null,
          source: { type: "SrReminder", id: key },
          refs: { dueCount: count, localDate: day },
          recipients: [{ userId: user.id }],
          dedupeKey: key,
        })
      );
      return 1;
    } catch (err) {
      // Lỗi một người KHÔNG chặn người khác trong lô.
      logger.error("[sr.daily-reminder] Nhắc ôn một người thất bại", { userId: user.id, error: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  }
}
