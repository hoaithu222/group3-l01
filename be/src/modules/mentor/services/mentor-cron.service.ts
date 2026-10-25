import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { MentorDeps } from "./mentor.deps";
import type { MentorEngagementsService } from "./mentor-engagements.service";
import { MENTOR_NOTIFICATION_TYPES } from "./mentor-notifications";

const DAY_MS = 86_400_000;

export interface CronResult {
  processed: number;
}

/**
 * Tick TĨNH (queue `cron`, `defineCron` — KHÔNG scheduler theo thực thể): quét theo index `status + endsAt/expiresAt`, mỗi lượt tối đa
 * `LIMITS.mentor.cronBatch`; mọi thao tác CAS nên hai tick chồng nhau (nhiều worker) vô hại.
 */
export class MentorCronService {
  constructor(
    private readonly d: MentorDeps,
    private readonly engagements: Pick<MentorEngagementsService, "endInternal">
  ) {}

  /** `mentor.expire` (15 phút) — đợt ACTIVE quá `endsAt` → ENDED(EXPIRED) + outbox thu hồi (IR-02). */
  async expireDue(): Promise<CronResult> {
    const now = this.d.now();
    let processed = 0;
    for (const e of await this.d.engagements.listDueToExpire(now, LIMITS.mentor.cronBatch)) {
      try {
        if (await this.engagements.endInternal(e.id, "EXPIRED", null)) processed += 1;
      } catch (err) {
        logger.error("[mentor.expire] Kết thúc đợt cố vấn lỗi", { engagementId: e.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { processed };
  }

  /** `mentor.ending-soon` (mỗi giờ) — báo MỘT lần/đợt/hạn khi còn ≤ `endingSoonDays` (gia hạn reset cờ). */
  async notifyEndingSoon(): Promise<CronResult> {
    const now = this.d.now();
    const until = new Date(now.getTime() + LIMITS.mentor.endingSoonDays * DAY_MS);
    let processed = 0;
    for (const e of await this.d.engagements.listEndingSoon(now, until, LIMITS.mentor.cronBatch)) {
      const post = await this.d.posts.findById(e.postId);
      const refs = { workspaceId: e.workspaceId, postId: e.postId, engagementId: e.id, endsAt: e.endsAt.toISOString() };
      const sent = await this.d.tx.run(async (tx) => {
        if (!(await this.d.engagements.markEndingSoonNotified(tx, e.id, now))) return false;
        const base = { type: MENTOR_NOTIFICATION_TYPES.ENDING_SOON, workspaceId: e.workspaceId, source: { type: "MentorEngagement", id: e.id }, refs };
        const stamp = e.endsAt.getTime();
        await this.d.notifier.notify(tx, { ...base, scope: null, recipients: [{ userId: e.mentorId }], dedupeKey: `mentor.ending-soon:${e.id}:${stamp}:mentor` });
        if (post) {
          await this.d.notifier.notify(tx, {
            ...base,
            scope: { type: "WORKSPACE", id: e.workspaceId },
            recipients: [{ userId: post.createdBy }],
            dedupeKey: `mentor.ending-soon:${e.id}:${stamp}:team`,
          });
        }
        return true;
      });
      if (sent) processed += 1;
    }
    return { processed };
  }

  /** `mentor.post-expire` (mỗi giờ) — bài OPEN/FULFILLED quá `expiresAt` → CLOSED; đơn PENDING → EXPIRED. Đợt đang chạy giữ nguyên. */
  async expirePosts(): Promise<CronResult> {
    const now = this.d.now();
    let processed = 0;
    for (const post of await this.d.posts.listExpired(now, LIMITS.mentor.cronBatch)) {
      const closed = await this.d.tx.run(async (tx) => {
        if (!(await this.d.posts.close(tx, post.id, now))) return false;
        await this.d.applications.expirePendingByPost(tx, post.id, now);
        return true;
      });
      if (closed) processed += 1;
    }
    return { processed };
  }
}
