import { AppError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { localDate } from "../../../core/utils/local-date";
import { DOMAIN_EVENTS, eventKeys, type LevelUpPayload, type XpAwardedPayload } from "../../../shared/events/domain-events";
import type { XpAdjustDto } from "../dtos";
import type { IGamDirectory } from "../repositories/directory";
import { UniqueViolationError, type IGamOutbox, type ITxRunner } from "../repositories/tx";
import type { IUserGamificationRepository } from "../repositories/user-gamification.repository.interface";
import type { IXpEventRepository } from "../repositories/xp-event.repository.interface";
import type { BadgeService, UnlockedBadge } from "./badge.service";
import type { IGamAudit, IGamEmitter } from "./gamification.ports";
import { levelFromXp } from "./level";
import type { LevelConfigService } from "./level-config.service";

export interface XpAdjustDeps {
  users: IUserGamificationRepository;
  events: IXpEventRepository;
  directory: IGamDirectory;
  levels: LevelConfigService;
  badges: BadgeService;
  tx: ITxRunner;
  outbox: IGamOutbox;
  audit: IGamAudit;
  emitter: IGamEmitter;
  now?: () => Date;
}

/**
 * Điều chỉnh XP của một người (p4-03 be.md §5.6) — ghi `XpEvent ADMIN_ADJUST` (không trần ngày, không tính chuỗi), XP không âm, cấp độ tính lại và
 * CHO PHÉP HẠ; lý do bắt buộc + audit `gamification.xp-adjust` (trước/sau). Idempotent theo khoá (`Idempotency-Key` của request): gọi lại cùng khoá trả trạng thái
 * hiện tại, không cộng hai lần. Không phát `xp.awarded` khi `delta < 0` (coins p7-02 không được thưởng theo điều chỉnh trừ).
 */
export class XpAdjustService {
  constructor(private readonly d: XpAdjustDeps) {}

  async adjust(actor: AuthUser, userId: string, dto: XpAdjustDto, idempotencyKey: string): Promise<{ xp: number; level: number }> {
    const d = this.d;
    if (Math.abs(dto.delta) > LIMITS.gamification.adjustMaxAbs) throw new AppError(ErrorMessages[ErrorCode.GAME_004], 400, ErrorCode.GAME_004, { max: LIMITS.gamification.adjustMaxAbs });
    const who = await d.directory.getTimezoneAndStatus(userId);
    if (!who || who.status === "ANONYMIZED") throw new NotFoundError("Không tìm thấy người dùng");
    await d.users.ensure(userId);
    const cfg = await d.levels.get();
    const at = d.now?.() ?? new Date();
    const dedupeKey = `ADMIN_ADJUST:${idempotencyKey}:${userId}`;

    try {
      const out = await d.tx.run(async (tx) => {
        const cur = await d.users.find(userId, tx);
        if (!cur) throw new Error(`UserGamification chưa có cho ${userId}`);
        const xp = Math.max(0, cur.xp + dto.delta);
        const level = levelFromXp(xp, cfg);
        await d.events.create(
          { dedupeKey, userId, sourceType: "ADMIN_ADJUST", sourceId: idempotencyKey, workspaceId: null, xp: dto.delta, capped: false, blockedReason: null, localDate: localDate(at, who.timezone), occurredAt: at, actorId: actor.id, reason: dto.reason },
          tx
        );
        const unlocked = level > cur.level ? await d.badges.evaluate(tx, userId, ["level"], { ...cur.counters, level }) : [];
        const saved = await d.users.updateIf(userId, cur.version, { xp, level }, tx);
        if (!saved) throw new VersionConflictError(cur.version);
        if (dto.delta > 0) {
          const awarded: XpAwardedPayload = { event: DOMAIN_EVENTS.XP_AWARDED, userId, sourceType: "ADMIN_ADJUST", sourceId: idempotencyKey, workspaceId: null, xp: dto.delta, at: at.toISOString() };
          await d.outbox.add(tx, { type: DOMAIN_EVENTS.XP_AWARDED, aggregateType: "XpEvent", aggregateId: userId, queue: "gamification", jobName: "xp.awarded", dedupeKey: eventKeys.xpAwarded(dedupeKey), payload: awarded as unknown as Record<string, unknown> });
        }
        if (level > cur.level && !(await d.outbox.exists(tx, eventKeys.levelUp(userId, level)))) {
          const up: LevelUpPayload = { event: DOMAIN_EVENTS.GAMIFICATION_LEVEL_UP, userId, from: cur.level, to: level };
          await d.outbox.add(tx, { type: DOMAIN_EVENTS.GAMIFICATION_LEVEL_UP, aggregateType: "User", aggregateId: userId, queue: "notifications", jobName: "gamification.level-up", dedupeKey: eventKeys.levelUp(userId, level), payload: up as unknown as Record<string, unknown> });
        }
        return { before: { xp: cur.xp, level: cur.level }, after: { xp: saved.xp, level: saved.level }, streak: saved.streak, unlocked };
      });
      await d.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: "gamification.xp-adjust",
        targetType: "User",
        targetId: userId,
        reason: dto.reason,
        metadata: { delta: dto.delta, before: out.before, after: out.after },
      });
      this.emit(userId, out.before.level, out.after, out.streak, out.unlocked);
      return out.after;
    } catch (err) {
      // Cùng khoá điều chỉnh đã áp (retry của request): trả trạng thái hiện tại, không cộng lần hai.
      if (err instanceof UniqueViolationError && err.key === "XpEvent.dedupeKey") {
        const now = await d.users.find(userId);
        return { xp: now?.xp ?? 0, level: now?.level ?? 1 };
      }
      throw err;
    }
  }

  private emit(userId: string, fromLevel: number, after: { xp: number; level: number }, streak: number, unlocked: readonly UnlockedBadge[]): void {
    this.d.emitter.updated(userId, { xp: after.xp, level: after.level, streak, ...(after.level > fromLevel && { levelUp: { from: fromLevel, to: after.level } }), newBadges: [...unlocked] });
  }
}
