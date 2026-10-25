import { runtimeConfig } from "../../../core/config/runtime-config";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { AuditService } from "../../audit-log/audit-log.service";
import { createSystemConfigService, type SystemConfigActor } from "../../system-config/public";

/**
 * Cổng phụ trợ của gamification (service không import `runtimeConfig`/`socket`/`AuditService`/`system-config` trực tiếp — nhận qua DI).
 */
export interface IGamConfigPort {
  /** Giá trị HIỆU LỰC (default ⊕ override đã clamp, cache nhiều tầng) — đường nóng của consumer. */
  effective(key: string): Promise<Record<string, unknown>>;
  /** Giá trị hiệu lực + `version` bản ghi đang lưu (cho form admin + CAS). */
  getOne(key: string): Promise<{ effective: Record<string, unknown>; version: number }>;
  /** Ghi qua `SystemConfigService` (floor/ceil, CAS, xoá cache, audit `system-config.update`). */
  update(key: string, value: Record<string, unknown>, expectedVersion: number, reason: string, actor: SystemConfigActor): Promise<{ version: number }>;
}

export class SystemConfigGamPort implements IGamConfigPort {
  private readonly service = createSystemConfigService();

  effective(key: string): Promise<Record<string, unknown>> {
    return runtimeConfig.getEffective(key);
  }

  async getOne(key: string): Promise<{ effective: Record<string, unknown>; version: number }> {
    const dto = await this.service.getOne(key);
    return { effective: dto.effective, version: dto.version };
  }

  async update(key: string, value: Record<string, unknown>, expectedVersion: number, reason: string, actor: SystemConfigActor): Promise<{ version: number }> {
    const dto = await this.service.update(key, { value, expectedVersion, reason }, actor);
    return { version: dto.version };
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

export interface IGamAudit {
  record(input: AuditInput): Promise<void>;
}

export class ServiceGamAudit implements IGamAudit {
  private readonly audit = new AuditService();

  record(input: AuditInput): Promise<void> {
    return this.audit.record(input);
  }
}

/** `gamification:updated` → `user:{id}` (mọi thiết bị) — payload v1; lỗi phát (Socket.IO chưa khởi tạo) KHÔNG làm hỏng nghiệp vụ. */
export interface GamificationUpdatedPayload {
  xp: number;
  level: number;
  streak: number;
  levelUp?: { from: number; to: number };
  newBadges: Array<{ id: string; code: string; name: string; emoji: string | null }>;
}

export interface IGamEmitter {
  updated(userId: string, payload: GamificationUpdatedPayload): void;
}

export class SocketGamEmitter implements IGamEmitter {
  updated(userId: string, payload: GamificationUpdatedPayload): void {
    try {
      emitToUsers([userId], SocketEvent.GAMIFICATION_UPDATED, payload);
    } catch {
      // Best-effort: worker riêng phát qua cầu nối Redis (p0-03); lỗi phát/chưa có đường nào tới Socket.IO chỉ bỏ qua — client đồng bộ lại khi mở app (`GET /me/gamification`).
    }
  }
}
