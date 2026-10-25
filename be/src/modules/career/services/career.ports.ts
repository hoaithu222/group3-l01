import { LIMITS } from "../../../core/constants/limits";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { redis } from "../../../infrastructure/redis";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { AuditService } from "../../audit-log/audit-log.service";

/**
 * Cổng phụ trợ của `career` — service không import `runtimeConfig`/Redis/socket/`AuditService` trực tiếp (nhận qua DI, test thay bản giả).
 */
export const SKILL_CONFIG_KEY = "skill";

export interface ISkillConfigPort {
  /** Story points tối thiểu để một task được tính (SystemConfig `skill.creditMinStoryPoints`, mặc định 1). */
  creditMinStoryPoints(): Promise<number>;
  /** Cron đối soát hằng đêm có chạy không (`skill.nightlyReconcile`, mặc định bật). */
  nightlyReconcile(): Promise<boolean>;
}

export class RuntimeSkillConfig implements ISkillConfigPort {
  async creditMinStoryPoints(): Promise<number> {
    const v = (await runtimeConfig.getEffective(SKILL_CONFIG_KEY))["creditMinStoryPoints"];
    return typeof v === "number" ? v : LIMITS.skill.creditMinStoryPoints;
  }

  async nightlyReconcile(): Promise<boolean> {
    const v = (await runtimeConfig.getEffective(SKILL_CONFIG_KEY))["nightlyReconcile"];
    return typeof v === "boolean" ? v : true;
  }
}

export interface AuditInput {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ICareerAudit {
  record(input: AuditInput): Promise<void>;
}

export class ServiceCareerAudit implements ICareerAudit {
  private readonly audit = new AuditService();

  record(input: AuditInput): Promise<void> {
    return this.audit.record(input);
  }
}

/** `skill:unlocked` → `user:{id}` (v1) — phát ở job `skill.events` SAU commit; lỗi phát không làm hỏng nghiệp vụ (client đồng bộ lại khi mở màn). */
export interface SkillUnlockedSocketPayload {
  v: 1;
  skillId: string;
  code: string;
  name: string;
  icon: string;
  unlockedAt: string;
}

export interface ISkillEmitter {
  unlocked(userId: string, payload: SkillUnlockedSocketPayload): void;
}

export class SocketSkillEmitter implements ISkillEmitter {
  unlocked(userId: string, payload: SkillUnlockedSocketPayload): void {
    try {
      emitToUsers([userId], SocketEvent.SKILL_UNLOCKED, payload);
    } catch {
      // Best-effort (worker phát qua cầu nối Redis p0-03); thông báo SKILL_UNLOCKED vẫn bền trong hộp thư.
    }
  }
}

/** Limiter "Đánh giá lại toàn bộ" — một lần mỗi `ttlSeconds` trên TOÀN hệ thống (Redis `SET NX EX`). */
export interface IReevaluateGate {
  tryAcquire(ttlSeconds: number): Promise<boolean>;
}

export class RedisReevaluateGate implements IReevaluateGate {
  tryAcquire(ttlSeconds: number): Promise<boolean> {
    return redis.setNx("skill:reevaluate-all", String(Date.now()), ttlSeconds);
  }
}
