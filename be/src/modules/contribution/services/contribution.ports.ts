import { runtimeConfig } from "../../../core/config/runtime-config";
import { CONTRIBUTION_DEFAULTS_CONFIG_KEY, DEFAULT_CONTRIBUTION_CONFIG, type ContributionConfigValue } from "../../../core/constants/contribution";
import { effectiveWorkspaceTimeZone, systemDefaultTimeZone } from "../../../core/config/workspace-timezone";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { redis } from "../../../infrastructure/redis";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { logger } from "../../../infrastructure/logger";
import { AuditService } from "../../audit-log/audit-log.service";
import { boardContributionConfigSchema, cloneConfig } from "./contribution-config.schema";

/** Cổng cấu hình: mặc định công thức cho bảng mới + múi giờ tính ngày/tuần/tháng. Service KHÔNG import `runtimeConfig` trực tiếp. */
export interface IContribConfigPort {
  defaults(): Promise<ContributionConfigValue>;
  /** Múi giờ của nhóm: `Workspace.timezone` (nếu OWNER/ADMIN đã đặt) → `pm.timezone` → `CRON_TZ` (đồng bộ chéo #9). */
  timezone(workspaceId: string): Promise<string>;
}

export class RuntimeContribConfig implements IContribConfigPort {
  /** `workspaceTimezone` = `Workspace.timezone` thô của nhóm (container truyền `directory.getWorkspaceTimezone`); vắng ⇒ luôn dùng mặc định hệ thống như trước. */
  constructor(private readonly workspaceTimezone?: (workspaceId: string) => Promise<string | null>) {}

  async defaults(): Promise<ContributionConfigValue> {
    try {
      const parsed = boardContributionConfigSchema.safeParse(await runtimeConfig.getEffective(CONTRIBUTION_DEFAULTS_CONFIG_KEY));
      return parsed.success ? cloneConfig(parsed.data) : cloneConfig(DEFAULT_CONTRIBUTION_CONFIG);
    } catch {
      return cloneConfig(DEFAULT_CONTRIBUTION_CONFIG);
    }
  }

  async timezone(workspaceId: string): Promise<string> {
    const [raw, fallback] = await Promise.all([this.workspaceTimezone?.(workspaceId).catch(() => null) ?? null, systemDefaultTimeZone()]);
    return effectiveWorkspaceTimeZone(raw, fallback);
  }
}

/** Xếp job tính lại (queue `reports`) — `jobId` do caller dựng (đã an toàn cho BullMQ). Trùng `jobId` ⇒ BullMQ bỏ qua (debounce). */
export interface IContribQueue {
  enqueueRecompute(boardId: string, jobId: string, delayMs: number): Promise<void>;
}

export const RECOMPUTE_QUEUE = "reports" as const;
export const RECOMPUTE_JOB = "contribution.recompute" as const;

/**
 * `queueConnection` (ioredis, `maxRetriesPerRequest: null`) KHÔNG BAO GIỜ tự reject khi Redis mất: lệnh xếp hàng chờ kết nối lại vô hạn. `enqueueRecompute` nằm trên đường
 * phản hồi của `PUT /contribution-config` nên phải có TRẦN thời gian — hết hạn ném lỗi (service đã bắt và chỉ log; báo cáo tự tính tại chỗ khi công thức mới hơn snapshot).
 */
export const ENQUEUE_TIMEOUT_MS = 1500;

export class QueueContribJobs implements IContribQueue {
  async enqueueRecompute(boardId: string, jobId: string, delayMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Xếp job tính lại quá ${ENQUEUE_TIMEOUT_MS}ms (Redis không phản hồi)`)), ENQUEUE_TIMEOUT_MS);
    });
    try {
      await Promise.race([enqueue(RECOMPUTE_QUEUE, RECOMPUTE_JOB, { boardId }, { jobId: toSafeJobId(jobId), delay: delayMs }), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export interface AuditInput {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface IContribAudit {
  record(input: AuditInput): Promise<void>;
}

export class ServiceContribAudit implements IContribAudit {
  private readonly audit = new AuditService();

  record(input: AuditInput): Promise<void> {
    return this.audit.record(input);
  }
}

/** `board:updated` vào room `board:{id}` — best-effort (worker/test không có Socket.IO). Trường thừa (`contributionChanged`) client cũ bỏ qua. */
export interface IContribEmitter {
  contributionChanged(boardId: string, version: number): void;
}

export class SocketContribEmitter implements IContribEmitter {
  contributionChanged(boardId: string, version: number): void {
    try {
      emitToRoom(ROOM.board(boardId), SocketEvent.BOARD_UPDATED, { boardId, version, contributionChanged: true });
    } catch (err) {
      logger.warn("[contribution] emit board:updated thất bại", { boardId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Cache ngắn hạn cho báo cáo theo tuần (tính khi xem). Redis lỗi/không có → bỏ qua, luôn tính lại. */
export interface IContribCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export class RedisContribCache implements IContribCache {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get<T>(key);
      return value ?? null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await redis.set(key, value as string | object, ttlSeconds);
    } catch {
      // best-effort
    }
  }
}
