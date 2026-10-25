import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database";
import { createContextLogger } from "../../infrastructure/logger";
import type { CursorResponse } from "../../core/utils/response";
import { encodeCursor, decodeCursor } from "../../core/utils/cursor";

const log = createContextLogger({ service: "AuditService" });

export interface RecordAuditInput {
  actorId: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Người thực hiện đã tra từ `User` — CHỈ các trường an toàn để hiện trong UI
 * quản trị (không email/passwordHash/…). `name` của tài khoản đã ẩn danh hoá
 * là "Tài khoản đã xoá" (do `UserAnonymizer` ghi đè) nên vẫn tự che PII.
 */
export interface AuditActor {
  id: string;
  name: string;
  /** Vai trò hệ thống HIỆN TẠI của user (khác `actorRole` = vai lúc thao tác). */
  role: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  /**
   * `null` khi bản ghi User không còn (xoá cứng). AuditLog không có relation tới
   * User (Prisma + MongoDB) nên tra bằng MỘT truy vấn batch mỗi trang — xem `list()`.
   */
  actor: AuditActor | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId: string | null;
  reason: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  at: Date;
}

export interface ListAuditLogParams {
  cursor?: string;
  limit: number;
  actorId?: string;
  /** Một hoặc nhiều mã hành động — nhiều mã thì lọc `IN`. */
  action?: string | string[];
  targetType?: string;
  targetId?: string;
  workspaceId?: string;
  from?: Date;
  to?: Date;
}

/** 1 mã → so khớp bằng; nhiều mã → `IN`; rỗng → không lọc. */
function toActionFilter(action: string | string[] | undefined): string | { in: string[] } | undefined {
  if (action === undefined) return undefined;
  const list = Array.isArray(action) ? action : [action];
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : { in: list };
}

/**
 * AuditService — ghi vết hành động nhạy cảm (khoá/mở/đổi role/xoá...).
 * `record()` KHÔNG BAO GIỜ ném lỗi ra ngoài nghiệp vụ chính — audit log lỗi
 * chỉ được log warn, trừ khi gọi có chủ ý bên trong transaction Prisma.
 */
export class AuditService {
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          actorRole: input.actorRole ?? "unknown",
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          workspaceId: input.workspaceId,
          reason: input.reason,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
          ip: input.ip,
          userAgent: input.userAgent,
        },
      });
    } catch (err) {
      log.warn("Ghi audit log thất bại — không chặn nghiệp vụ chính", {
        action: input.action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async list(params: ListAuditLogParams): Promise<CursorResponse<AuditLogEntry>> {
    const { limit, cursor, actorId, action, targetType, targetId, workspaceId, from, to } = params;
    const decoded = cursor ? decodeCursor(cursor) : null;
    const actionFilter = toActionFilter(action);

    const records = await prisma.auditLog.findMany({
      where: {
        ...(actorId && { actorId }),
        ...(actionFilter && { action: actionFilter }),
        ...(targetType && { targetType }),
        ...(targetId && { targetId }),
        ...(workspaceId && { workspaceId }),
        ...((from || to) && { at: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
        ...(decoded && {
          OR: [{ at: { lt: decoded.at } }, { at: decoded.at, id: { lt: decoded.id } }],
        }),
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const last = page[page.length - 1];

    const actors = await this.loadActors(page.map((r) => r.actorId));

    return {
      data: page.map((r) => ({ ...r, actor: actors.get(r.actorId) ?? null })),
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.at, last.id) : null,
        hasMore,
        limit,
      },
    };
  }

  /**
   * Tra tên/vai trò người thực hiện cho CẢ trang bằng đúng MỘT truy vấn
   * (`id IN (...)`) — tránh N+1. Trang rỗng thì không chạm DB.
   */
  private async loadActors(actorIds: string[]): Promise<Map<string, AuditActor>> {
    const ids = [...new Set(actorIds)];
    if (ids.length === 0) return new Map();

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true },
    });
    return new Map(users.map((u) => [u.id, { id: u.id, name: u.name, role: u.role }]));
  }
}
