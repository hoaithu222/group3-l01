import { VersionConflictError } from "../../../core/exceptions";
import { localDate } from "../../../core/utils/local-date";
import { DOMAIN_EVENTS, eventKeys, type LevelUpPayload, type XpAwardedPayload } from "../../../shared/events/domain-events";
import { STREAK_SOURCES, STORED_COUNTER_KEYS, type GamificationCounters, type UserGamification } from "../entities/gamification.interface";
import type { IXpEventRepository } from "../repositories/xp-event.repository.interface";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IGamDirectory } from "../repositories/directory";
import { UniqueViolationError, type IGamOutbox, type ITxRunner, type TxHandle } from "../repositories/tx";
import type { BadgeService, UnlockedBadge } from "./badge.service";
import type { IGamEmitter } from "./gamification.ports";
import type { LevelConfigService } from "./level-config.service";
import { levelFromXp } from "./level";
import { applyActivity } from "./streak";
import type { XpRuleService } from "./xp-rule.service";
import { applyDailyCap, baseXp } from "./xp-calc";
import { xpDedupeKey, type XpInput } from "./xp-source-mapper";

export interface XpConsumerDeps {
  rules: XpRuleService;
  levels: LevelConfigService;
  events: IXpEventRepository;
  users: IUserGamificationRepository;
  directory: IGamDirectory;
  badges: BadgeService;
  tx: ITxRunner;
  outbox: IGamOutbox;
  emitter: IGamEmitter;
}

export type RecordStatus = "RECORDED" | "DUPLICATE" | "SKIPPED";

/**
 * Ghi nhận XP (p4-03 be.md §5.2) — MỘT transaction cho mỗi `XpInput`, idempotent theo THỰC THỂ NGUỒN (`XpEvent.dedupeKey`): retry/sự kiện lặp
 * không cộng hai lần (GM-01). Thứ tự: đường nhanh `exists` → tạo trước NGOÀI tx các hàng khoá unique MỚI (`UserGamification`, `XpDailyTotal`; hai tx cùng
 * tạo ⇒ P2002 không retry) → tx: đọc tổng trần ngày → `XpEvent` (câu lệnh GHI đầu tiên — trùng khoá thoát callback, bắt Ở NGOÀI) → tổng ngày →
 * counters/chuỗi/cấp độ/huy hiệu → CAS `UserGamification` → outbox `xp.awarded`, `gamification.level-up`. Vượt trần vẫn ghi `XpEvent` xp 0 `capped`
 * và counters/chuỗi vẫn tăng (GM-02). Hai consumer cùng người đụng cùng `UserGamification` ⇒ write-conflict ⇒ `withTransaction` thử lại.
 */
export class XpConsumerService {
  constructor(private readonly d: XpConsumerDeps) {}

  async record(input: XpInput): Promise<RecordStatus> {
    const d = this.d;
    const dedupeKey = xpDedupeKey(input);
    if (await d.events.exists(dedupeKey)) return "DUPLICATE";
    const who = await d.directory.getTimezoneAndStatus(input.userId);
    if (!who || who.status === "ANONYMIZED") return "SKIPPED";

    const day = localDate(input.occurredAt, who.timezone);
    const [rule, cfg, minAge] = await Promise.all([d.rules.get(input.sourceType), d.levels.get(), d.levels.minTaskAgeSec()]);
    const base = baseXp(input, rule, minAge);
    await d.users.ensure(input.userId);
    const capRule = base.xp > 0 && rule && rule.dailyCap !== null ? rule.dailyCap : null;
    if (capRule !== null) await d.events.ensureDailyTotal(input.userId, input.sourceType, day);

    try {
      const out = await d.tx.run(async (tx) => {
        const { allowed, capped } = applyDailyCap(base.xp, capRule, capRule !== null ? await d.events.getDailyTotal(input.userId, input.sourceType, day, tx) : 0);
        await d.events.create(
          {
            dedupeKey,
            userId: input.userId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            workspaceId: input.workspaceId,
            xp: allowed,
            capped,
            blockedReason: base.blockedReason,
            localDate: day,
            occurredAt: input.occurredAt,
            actorId: null,
            reason: null,
          },
          tx
        );
        if (allowed > 0 && capRule !== null) await d.events.incDailyTotal(input.userId, input.sourceType, day, allowed, tx);

        const cur = await d.users.find(input.userId, tx);
        if (!cur) throw new Error(`UserGamification chưa có cho ${input.userId}`);
        const counters: GamificationCounters = { ...cur.counters };
        const changed = new Set<string>();
        for (const key of STORED_COUNTER_KEYS) {
          const inc = input.counters[key] ?? 0;
          if (inc > 0) {
            counters[key] += inc;
            changed.add(key);
          }
        }

        let { streak, lastActiveDate } = cur;
        let streakTz = cur.streakTz;
        if (STREAK_SOURCES.has(input.sourceType) || rule?.countsForStreak) {
          const next = applyActivity({ streak, lastActiveDate, longestStreak: counters.longestStreak }, day);
          if (next.lastActiveDate !== lastActiveDate) streakTz = who.timezone;
          streak = next.streak;
          lastActiveDate = next.lastActiveDate;
          if (next.longestStreak > counters.longestStreak) {
            counters.longestStreak = next.longestStreak;
            changed.add("longestStreak");
          }
        }

        const xp = cur.xp + allowed;
        const level = Math.max(cur.level, levelFromXp(xp, cfg));
        if (level > cur.level) changed.add("level");
        const unlocked = await d.badges.evaluate(tx, input.userId, [...changed], { ...counters, level });

        const saved = await d.users.updateIf(input.userId, cur.version, { xp, level, streak, lastActiveDate, streakTz, counters }, tx);
        if (!saved) throw new VersionConflictError(cur.version);

        if (allowed > 0) {
          const awarded: XpAwardedPayload = { event: DOMAIN_EVENTS.XP_AWARDED, userId: input.userId, sourceType: input.sourceType, sourceId: input.sourceId, workspaceId: input.workspaceId, xp: allowed, at: input.occurredAt.toISOString() };
          await d.outbox.add(tx, {
            type: DOMAIN_EVENTS.XP_AWARDED,
            aggregateType: "XpEvent",
            aggregateId: input.userId,
            queue: "gamification",
            jobName: "xp.awarded",
            dedupeKey: eventKeys.xpAwarded(dedupeKey),
            payload: awarded as unknown as Record<string, unknown>,
          });
        }
        if (level > cur.level) await this.addLevelUp(tx, input.userId, cur, level);
        return { saved, unlocked, from: cur.level, to: level };
      });
      this.emit(out.saved, out.from, out.to, out.unlocked);
      return "RECORDED";
    } catch (err) {
      if (err instanceof UniqueViolationError && err.key === "XpEvent.dedupeKey") return "DUPLICATE";
      throw err;
    }
  }

  /** Ghi nhận nhiều lần ghi (một sự kiện → nhiều `XpInput`); thử hết rồi mới ném lỗi đầu tiên để job retry (phần đã ghi bị chặn bởi `XpEvent` unique). */
  async recordMany(inputs: readonly XpInput[]): Promise<RecordStatus[]> {
    const out: RecordStatus[] = [];
    let failure: unknown = null;
    for (const input of inputs) {
      try {
        out.push(await this.record(input));
      } catch (err) {
        failure ??= err;
      }
    }
    if (failure) throw failure;
    return out;
  }

  /** Outbox `gamification.level-up` (→ `notifications/gamification.level-up`): `dedupeKey` là `…:l<to>` — lên lại đúng cấp cũ (sau khi admin hạ XP) không phát lại. */
  private async addLevelUp(tx: TxHandle, userId: string, cur: UserGamification, to: number): Promise<void> {
    const dedupeKey = eventKeys.levelUp(userId, to);
    if (await this.d.outbox.exists(tx, dedupeKey)) return;
    const payload: LevelUpPayload = { event: DOMAIN_EVENTS.GAMIFICATION_LEVEL_UP, userId, from: cur.level, to };
    await this.d.outbox.add(tx, {
      type: DOMAIN_EVENTS.GAMIFICATION_LEVEL_UP,
      aggregateType: "User",
      aggregateId: userId,
      queue: "notifications",
      jobName: "gamification.level-up",
      dedupeKey,
      payload: payload as unknown as Record<string, unknown>,
    });
  }

  private emit(saved: UserGamification, from: number, to: number, unlocked: readonly UnlockedBadge[]): void {
    this.d.emitter.updated(saved.userId, {
      xp: saved.xp,
      level: saved.level,
      streak: saved.streak,
      ...(to > from && { levelUp: { from, to } }),
      newBadges: [...unlocked],
    });
  }
}
