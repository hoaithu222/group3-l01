import { prisma } from "../../infrastructure/database";
import { redis } from "../../infrastructure/redis";
import { AppError, NotFoundError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { LIMITS } from "../../core/constants/limits";
import { permissionService, type MentionHookInputRef, type MentionHookScopeType } from "../../core/permission";
import { isGrantRoleRef, ROLE_REF_LABEL, type GrantRoleRef } from "../../core/constants/role-coverage";

export interface RoleMentionCheckInput {
  scopeType: MentionHookScopeType;
  scopeId: string;
  actorId: string;
  /** Có khi SỬA tin: chỉ mention vai trò MỚI (chưa có trên tin) mới phải kiểm quyền/hạn mức. */
  messageId?: string;
  mentions: MentionHookInputRef[];
}

/** Nhãn hiển thị (snapshot vào `mentions[].label`) của một `roleRef` hợp lệ; lạ → `null`. */
export function roleMentionLabel(targetId: string | null | undefined): string | null {
  return isGrantRoleRef(targetId) ? ROLE_REF_LABEL[targetId] : null;
}

function invalidRoleError(targetIds: Array<string | null>): AppError {
  return new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, {
    reason: "INVALID_TARGET",
    invalidMentions: targetIds.map((targetId) => ({ targetId, reason: "NOT_FOUND" })),
  });
}

/**
 * `@role` (p3-04 be.md §5.7): kiểm mention theo VAI TRÒ trước khi tin được lưu. Chỉ trong KÊNH (hội thoại →
 * `MSG_008 ROLE_NOT_SUPPORTED`); `targetId ∈ {ADMIN, MEMBER}`; người gửi phải có `workspace.mention.role` (OWNER/ADMIN)
 * của workspace chứa kênh; hạn mức `LIMITS.mention.roleMentionsPerHour` lần/giờ/người/workspace (chỉ tính khi tin CÓ
 * mention vai trò, vượt → 429 `RATE_003`). Người nhận được giải ra ở job `fanout.message-role` (`role-mention-fanout.service.ts`).
 */
export class RoleMentionPolicy {
  async assertAllowed(input: RoleMentionCheckInput): Promise<void> {
    const roleTargets = input.mentions.filter((m) => m.type === "ROLE").map((m) => m.targetId ?? null);
    if (roleTargets.length === 0) return;

    if (input.scopeType !== "CHANNEL") {
      throw new AppError(ErrorMessages[ErrorCode.MSG_008], 400, ErrorCode.MSG_008, { reason: "ROLE_NOT_SUPPORTED" });
    }
    const unknown = roleTargets.filter((t) => !isGrantRoleRef(t));
    if (unknown.length > 0) throw invalidRoleError(unknown);

    // Sửa tin mà vai trò đã có sẵn trên tin → không kiểm lại quyền/không tính thêm lượt (người gửi đã được phép lúc gửi).
    let fresh = roleTargets as GrantRoleRef[];
    if (input.messageId) {
      const existing = await prisma.message.findUnique({ where: { id: input.messageId }, select: { mentions: true } });
      // ROLE lưu "ADMIN"|"MEMBER" ở `roleRef` (`targetId` là ObjectId nên null) — xem `messages/repositories/message.repository.prisma.ts`.
      const kept = new Set((existing?.mentions ?? []).filter((m) => m.type === "ROLE").map((m) => m.roleRef));
      fresh = fresh.filter((t) => !kept.has(t));
    }
    if (fresh.length === 0) return;

    const channel = await prisma.channel.findUnique({ where: { id: input.scopeId }, select: { workspaceId: true } });
    if (!channel) throw new NotFoundError();

    const allowed = await permissionService.can({ id: input.actorId, email: "" }, "workspace.mention.role", {
      type: "WORKSPACE",
      id: channel.workspaceId,
    });
    if (!allowed) {
      throw new AppError(ErrorMessages[ErrorCode.PERM_006], 403, ErrorCode.PERM_006, { reason: "MENTION_ROLE_FORBIDDEN" });
    }

    await this.consumeQuota(channel.workspaceId, input.actorId);
  }

  /** Redis INCR+EXPIRE 1 giờ theo (workspace, người gửi); Redis lỗi → cho qua (cùng triết lý `@all`). */
  private async consumeQuota(workspaceId: string, actorId: string): Promise<void> {
    const key = `mention-role:${workspaceId}:${actorId}`;
    const count = await redis.incr(key);
    if (count === null) return;
    if (count === 1) await redis.expire(key, 3600);
    if (count > LIMITS.mention.roleMentionsPerHour) {
      throw new AppError(ErrorMessages[ErrorCode.RATE_003], 429, ErrorCode.RATE_003, { retryAfterSeconds: 3600 });
    }
  }
}
