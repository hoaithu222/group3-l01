import { criteriaSchema, evaluateCriteria, type Criteria, type CounterValues } from "../../../shared/criteria/criteria-evaluator";
import type { Badge } from "../entities/gamification.interface";
import { GAMIFICATION_NOTIFICATION_TYPES } from "../notifications/gamification.notification-types";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IGamNotifier, ITxRunner, TxHandle } from "../repositories/tx";
import { LIMITS } from "../../../core/constants/limits";

export interface UnlockedBadge {
  id: string;
  code: string;
  name: string;
  emoji: string | null;
}

export interface BadgeDeps {
  badges: IBadgeRepository;
  userBadges: IUserBadgeRepository;
  gamification: IUserGamificationRepository;
  notifier: IGamNotifier;
  tx: ITxRunner;
}

/** Điều kiện của huy hiệu đã lưu (`Json`) → `Criteria`; lưu sai dạng (dữ liệu cũ/sửa tay) → `null` (bỏ qua, không làm hỏng consumer). */
export function parseCriteria(raw: unknown): Criteria | null {
  const parsed = criteriaSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Đánh giá + cấp huy hiệu (p4-03 be.md §5.2 bước 8, §5.5). Chỉ đánh giá huy hiệu BẬT có counter vừa đổi (`Badge.counters`); mỗi huy hiệu mở đúng MỘT
 * lần (`UserBadge` unique `(userId, badgeId)`; huy hiệu đã thu hồi KHÔNG tự mở lại) kèm MỘT thông báo `BADGE_UNLOCKED`. Không có endpoint tự cấp.
 */
export class BadgeService {
  constructor(private readonly d: BadgeDeps) {}

  /** Trong transaction của consumer: mở các huy hiệu vừa đủ điều kiện, ghi `UserBadge` + `notify`. */
  async evaluate(tx: TxHandle, userId: string, changed: readonly string[], counters: CounterValues): Promise<UnlockedBadge[]> {
    const candidates = await this.d.badges.listActiveByCounters(changed);
    if (candidates.length === 0) return [];
    const owned = new Set((await this.d.userBadges.listByUser(userId, tx)).map((b) => b.badgeId));
    const unlocked: UnlockedBadge[] = [];
    for (const badge of candidates) {
      const criteria = parseCriteria(badge.criteria);
      if (owned.has(badge.id) || !criteria || !evaluateCriteria(criteria, counters)) continue;
      await this.d.userBadges.create({ userId, badgeId: badge.id, via: "EVENT" }, tx);
      await this.notifyUnlocked(tx, userId, badge);
      unlocked.push({ id: badge.id, code: badge.code, name: badge.name, emoji: badge.emoji });
    }
    return unlocked;
  }

  /** Xem trước: bao nhiêu người ĐANG đủ điều kiện (đếm trên `UserGamification`). */
  preview(criteria: Criteria): Promise<number> {
    return this.d.gamification.countMatching(criteria);
  }

  /**
   * Backfill huy hiệu mới cho người ĐÃ đủ điều kiện (job `badge.backfill`): duyệt `UserGamification` theo `userId` lô nhỏ, `UserBadge via BACKFILL`
   * (unique — chạy lại không tạo thêm), tối đa MỘT thông báo/người/huy hiệu. Trả số người được cấp MỚI.
   */
  async backfill(badgeId: string): Promise<number> {
    const badge = await this.d.badges.findById(badgeId);
    const criteria = badge && badge.isActive ? parseCriteria(badge.criteria) : null;
    if (!badge || !criteria) return 0;
    let granted = 0;
    let afterUserId: string | undefined;
    for (;;) {
      const page = await this.d.gamification.listMatchingPage(criteria, { afterUserId, limit: LIMITS.gamification.backfillBatch });
      if (page.length === 0) break;
      for (const g of page) {
        if (!(await this.d.userBadges.insertIfMissing({ userId: g.userId, badgeId, via: "BACKFILL" }))) continue;
        await this.d.tx.run((tx) => this.notifyUnlocked(tx, g.userId, badge));
        granted += 1;
      }
      afterUserId = page[page.length - 1].userId;
      if (page.length < LIMITS.gamification.backfillBatch) break;
    }
    return granted;
  }

  private notifyUnlocked(tx: TxHandle, userId: string, badge: Badge): Promise<void> {
    const key = `badge-unlocked:${userId}:${badge.id}`;
    return this.d.notifier.notify(tx, {
      type: GAMIFICATION_NOTIFICATION_TYPES.BADGE_UNLOCKED,
      scope: null,
      source: { type: "UserBadge", id: key },
      refs: { badgeId: badge.id, code: badge.code, name: badge.name, emoji: badge.emoji },
      recipients: [{ userId }],
      dedupeKey: key,
    });
  }
}
