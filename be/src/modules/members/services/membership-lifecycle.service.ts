import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import type { MembershipLifecyclePort } from "../../../shared/ports/membership-lifecycle.port";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { WorkspaceMembership } from "../entities/member.interface";
import { outranks } from "./member-rank.policy";

const auditService = new AuditService();

/**
 * `dedupeKey` dùng `Date.now()` — KHÔNG hoàn toàn "tất định" theo lý tưởng
 * `reuse-first.md`, nhưng CAS `status: "ACTIVE"` trên `WorkspaceMembership`
 * (không có field `version` để nhúng vào key như `Workspace`) đã tự chặn ĐÚNG
 * MỘT lần chuyển trạng thái thật commit; endpoint không có `Idempotency-Key`
 * ở tầng HTTP (be.md §4) nên rủi ro duy nhất còn lại là 1 audit/notify thừa
 * nếu client tự retry — chấp nhận được, không phải mất dữ liệu.
 */

interface RevokeOptions {
  reason?: string;
  isPlatformActor?: boolean;
  /** p3-04 — `WorkspaceMembership.leftReason` (mặc định = `status`: LEFT|REMOVED|BANNED; hết hạn khách = EXPIRED). */
  leftReason?: string;
  /** p3-04 — `permission:revoked.reason` (mặc định suy từ `status`; hết hạn khách = EXPIRED). */
  revokeReason?: RevokeScopeReason;
  /** p3-04 — tác nhân hệ thống (job hết hạn): không ghi `removedBy`, không gửi `workspace.admin-change`. */
  system?: boolean;
  /** p3-04 — điều kiện CAS thêm vào `updateMany` (vd `role: "GUEST"`, `expiryVersion`) để job cũ không gỡ nhầm. */
  guard?: Prisma.WorkspaceMembershipWhereInput;
}

type RevokeScopeReason = "REMOVED" | "BANNED" | "LEFT" | "EXPIRED";

/** Job `guest.expire` chạy sớm tối đa 5 giây so với `expiresAt` vẫn được xử lý (đồng hồ lệch nhẹ giữa các instance). */
const EXPIRE_GRACE_MS = 5_000;

/** `changeRole/revoke/unban/leave` (be.md p1-02 §5.4-§5.6) — bậc quyền qua `member-rank.policy.ts`. */
export class MembershipLifecycleService implements MembershipLifecyclePort {
  constructor(private readonly repo: IMembershipRepository) {}

  async changeRole(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    role: "ADMIN" | "MEMBER"
  ): Promise<WorkspaceMembership> {
    const [actor, target] = await Promise.all([
      this.repo.findByWorkspaceAndUser(workspaceId, actorId),
      this.repo.findByWorkspaceAndUser(workspaceId, targetUserId),
    ]);
    if (!actor || actor.status !== "ACTIVE" || actor.role !== "OWNER") {
      throw new AppError(ErrorMessages[ErrorCode.WS_011], 403, ErrorCode.WS_011);
    }
    if (!target || target.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
    }
    if (target.role === "OWNER") {
      throw new AppError(ErrorMessages[ErrorCode.WS_010], 403, ErrorCode.WS_010);
    }

    const updated = await withTransaction(async (tx) => {
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      if (workspace.status === "ARCHIVED") {
        throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);
      }
      const result = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId: targetUserId, role: target.role },
        data: { role },
      });
      if (result.count === 0) {
        throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
      }
      await auditService.record({
        actorId,
        action: "member.role-change",
        targetType: "WorkspaceMembership",
        targetId: `${workspaceId}:${targetUserId}`,
        workspaceId,
        metadata: { from: target.role, to: role },
      });
      await outbox.add(tx, {
        type: "membership.role-changed",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `membership.role-changed:${workspaceId}:${targetUserId}:${Date.now()}`,
        payload: { event: "role-changed", workspaceId, userId: targetUserId, role },
      });
      // p3-04 (`modules/channels/jobs/channel-role-access.consumer.ts`): tính lại quyền kênh riêng tư cấp THEO VAI TRÒ
      // của người này (RB-09) — outbox row RIÊNG (jobName khác) vì mỗi cặp queue/jobName chỉ có 1 processor.
      await outbox.add(tx, {
        type: "channel.role-access-sync",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "channel.role-access-sync",
        dedupeKey: `channel.role-access-sync:${workspaceId}:${targetUserId}:${Date.now()}`,
        payload: { workspaceId, userId: targetUserId },
      });
      await notify(tx, {
        type: "workspace.admin-change",
        actorId,
        scope: { type: "WORKSPACE", id: workspaceId },
        workspaceId,
        source: { type: "WorkspaceMembership", id: `${workspaceId}:${targetUserId}` },
        refs: { workspaceId, action: "role-changed", role },
        recipients: [{ userId: targetUserId }],
        dedupeKey: `workspace.admin-change:${workspaceId}:${targetUserId}:role:${role}:${Date.now()}`,
      });
      return await tx.workspaceMembership.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
    });

    await permissionService.bumpVersion({ type: "WORKSPACE", id: workspaceId });
    return updated as unknown as WorkspaceMembership;
  }

  /** Đổi biệt danh trong nhóm — chính chủ HOẶC người có bậc cao hơn (be.md §4 PATCH /members/:userId). */
  async updateDisplayName(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    displayName: string | null
  ): Promise<WorkspaceMembership> {
    const [actor, target] = await Promise.all([
      this.repo.findByWorkspaceAndUser(workspaceId, actorId),
      this.repo.findByWorkspaceAndUser(workspaceId, targetUserId),
    ]);
    if (!actor || actor.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_011], 403, ErrorCode.WS_011);
    }
    if (!target || target.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
    }
    if (actorId !== targetUserId && !outranks(actor.role, target.role)) {
      throw new AppError(ErrorMessages[ErrorCode.WS_011], 403, ErrorCode.WS_011);
    }

    const updated = await withTransaction(async (tx) => {
      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      if (workspace.status === "ARCHIVED") {
        throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);
      }
      const result = await tx.workspaceMembership.update({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        data: { displayName },
      });
      await outbox.add(tx, {
        type: "membership.displayName-changed",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `membership.displayName-changed:${workspaceId}:${targetUserId}:${Date.now()}`,
        payload: { event: "displayName-changed", workspaceId, userId: targetUserId },
      });
      return result;
    });

    return updated as unknown as WorkspaceMembership;
  }

  /** Loại (`REMOVED`)/chặn (`BANNED`) một MEMBER khác — kiểm bậc trước khi vào transaction. */
  async revoke(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    status: "REMOVED" | "BANNED",
    reason: string
  ): Promise<void> {
    if (actorId === targetUserId) {
      throw new AppError(ErrorMessages[ErrorCode.WS_012], 400, ErrorCode.WS_012);
    }
    const [actor, target] = await Promise.all([
      this.repo.findByWorkspaceAndUser(workspaceId, actorId),
      this.repo.findByWorkspaceAndUser(workspaceId, targetUserId),
    ]);
    if (!actor || actor.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_011], 403, ErrorCode.WS_011);
    }
    if (!target || target.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
    }
    if (!outranks(actor.role, target.role)) {
      throw new AppError(ErrorMessages[ErrorCode.WS_011], 403, ErrorCode.WS_011);
    }

    await this.revokeInTx(workspaceId, targetUserId, status, {
      actorId,
      reason,
      auditAction: status === "BANNED" ? "member.ban" : "member.remove",
    });
  }

  async unban(actorId: string, workspaceId: string, targetUserId: string, reason: string): Promise<void> {
    const [actor, target] = await Promise.all([
      this.repo.findByWorkspaceAndUser(workspaceId, actorId),
      this.repo.findByWorkspaceAndUser(workspaceId, targetUserId),
    ]);
    if (!actor || actor.status !== "ACTIVE" || (actor.role !== "OWNER" && actor.role !== "ADMIN")) {
      throw new AppError(ErrorMessages[ErrorCode.WS_011], 403, ErrorCode.WS_011);
    }
    if (!target || target.status !== "BANNED") {
      throw new AppError(ErrorMessages[ErrorCode.WS_014], 409, ErrorCode.WS_014);
    }

    await withTransaction(async (tx) => {
      const result = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId: targetUserId, status: "BANNED" },
        data: { status: "REMOVED", banReason: null },
      });
      if (result.count === 0) throw new AppError(ErrorMessages[ErrorCode.WS_014], 409, ErrorCode.WS_014);
      await auditService.record({
        actorId,
        action: "member.unban",
        targetType: "WorkspaceMembership",
        targetId: `${workspaceId}:${targetUserId}`,
        workspaceId,
        reason,
      });
    });
  }

  /** be.md p1-01 §5.6 — `WorkspaceLifecycleService.leave()` chặn OWNER trước khi gọi tới đây. */
  async leave(userId: string, workspaceId: string): Promise<void> {
    await this.revokeInTx(workspaceId, userId, "LEFT", { actorId: userId, auditAction: null });
  }

  async platformRevoke(adminId: string, workspaceId: string, targetUserId: string, reason: string, ban: boolean): Promise<void> {
    const target = await this.repo.findByWorkspaceAndUser(workspaceId, targetUserId);
    if (!target || target.status !== "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);
    }
    if (target.role === "OWNER") {
      throw new AppError(ErrorMessages[ErrorCode.WS_015], 409, ErrorCode.WS_015);
    }
    await this.revokeInTx(workspaceId, targetUserId, ban ? "BANNED" : "REMOVED", {
      actorId: adminId,
      reason,
      auditAction: "member.platform-revoke",
      isPlatformActor: true,
    });
  }

  /**
   * Lõi dùng chung cho remove/ban/leave/platform-revoke (be.md §5.5 bước 2-3):
   * CAS status ACTIVE → status đích trong transaction (audit + outbox CÙNG tx),
   * sau commit gọi `permissionService.revokeScope()` (bump version + đá khỏi
   * room `ws/ch/conv/call` + `permission:revoked` → `user:{id}` + huỷ push chờ).
   */
  private async revokeInTx(
    workspaceId: string,
    targetUserId: string,
    status: "REMOVED" | "BANNED" | "LEFT",
    opts: RevokeOptions & { actorId: string; auditAction: string | null }
  ): Promise<void> {
    await withTransaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId: targetUserId, status: "ACTIVE", ...opts.guard },
        data: {
          status,
          leftAt: new Date(),
          leftReason: opts.leftReason ?? status,
          ...(!opts.system && opts.actorId !== targetUserId && { removedBy: opts.actorId }),
          ...(status === "BANNED" && { banReason: opts.reason }),
        },
      });
      if (result.count === 0) throw new AppError(ErrorMessages[ErrorCode.WS_013], 409, ErrorCode.WS_013);

      await tx.workspace.update({ where: { id: workspaceId }, data: { memberCount: { decrement: 1 } } });

      if (opts.auditAction) {
        await auditService.record({
          actorId: opts.actorId,
          action: opts.auditAction,
          targetType: "WorkspaceMembership",
          targetId: `${workspaceId}:${targetUserId}`,
          workspaceId,
          reason: opts.reason,
        });
      }

      await outbox.add(tx, {
        type: "membership.revoked",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `membership.revoked:${workspaceId}:${targetUserId}:${Date.now()}`,
        payload: { event: "revoked", workspaceId, userId: targetUserId, status, ...(opts.leftReason && { reason: opts.leftReason }) },
      });

      // p1-03 (`modules/channels/jobs/membership-revoked.consumer.ts`) cần dọn
      // ChannelGrant/ChannelMembership của user này khi rời/bị loại/bị chặn
      // khỏi workspace — ghi thêm 1 outbox row RIÊNG (jobName khác) trong CÙNG
      // transaction thay vì tự import module `channels` (luật 3 tầng) hay đổi
      // `jobName` ở trên (mỗi cặp queue/jobName chỉ có đúng 1 processor —
      // `registerJob()`, `infrastructure/queue/worker.ts` — đổi ở đây sẽ ghi
      // đè handler `membership.events` mà module này đang sở hữu).
      await outbox.add(tx, {
        type: "channel.membership-revoked",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "channel.membership-revoked",
        dedupeKey: `channel.membership-revoked:${workspaceId}:${targetUserId}:${Date.now()}`,
        payload: { workspaceId, userId: targetUserId },
      });

      // p1-05 (`modules/conversations/jobs/workspace-member-removed.job.ts`) cần
      // dọn/chuyển chủ GROUP conversation + tính lại readOnly của DIRECT khi
      // user rời/bị loại/bị chặn khỏi workspace — cùng lý do outbox row riêng
      // (jobName khác) như `channel.membership-revoked` ngay trên, KHÔNG import
      // module `conversations` (luật 3 tầng).
      await outbox.add(tx, {
        type: "conversation.workspace-member-removed",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${targetUserId}`,
        queue: "notifications",
        jobName: "conversations.workspace-member-removed",
        dedupeKey: `conversations.workspace-member-removed:${workspaceId}:${targetUserId}:${Date.now()}`,
        payload: { workspaceId, userId: targetUserId },
      });

      if (status !== "LEFT" && opts.actorId !== targetUserId && !opts.system) {
        await notify(tx, {
          type: "workspace.admin-change",
          actorId: opts.actorId,
          scope: { type: "WORKSPACE", id: workspaceId },
          workspaceId,
          source: { type: "WorkspaceMembership", id: `${workspaceId}:${targetUserId}` },
          refs: { workspaceId, action: status.toLowerCase() },
          recipients: [{ userId: targetUserId }],
          dedupeKey: `workspace.admin-change:${workspaceId}:${targetUserId}:${status}:${Date.now()}`,
        });
      }
    });

    await permissionService.revokeScope({
      scope: { type: "WORKSPACE", id: workspaceId },
      userIds: [targetUserId],
      reason: opts.revokeReason ?? (status === "LEFT" ? "LEFT" : status === "BANNED" ? "BANNED" : "REMOVED"),
    });
  }

  /**
   * p6-03 — thu hồi KHÁCH bởi HỆ THỐNG (kết thúc đợt cố vấn qua `WorkspaceMembershipPort.revokeGuest`): cùng đường `revokeInTx`,
   * không kiểm bậc/hạn, không thông báo `workspace.admin-change`. Không còn là khách ACTIVE → `SKIPPED` (idempotent).
   */
  async revokeGuestBySystem(workspaceId: string, userId: string, reason: "REMOVED" | "LEFT" | "EXPIRED"): Promise<"REVOKED" | "SKIPPED"> {
    const membership = await this.repo.findByWorkspaceAndUser(workspaceId, userId);
    if (!membership || membership.status !== "ACTIVE" || membership.role !== "GUEST") return "SKIPPED";
    try {
      await this.revokeInTx(workspaceId, userId, reason === "LEFT" ? "LEFT" : "REMOVED", {
        actorId: userId,
        auditAction: null,
        system: true,
        leftReason: reason,
        revokeReason: reason,
        guard: { role: "GUEST" },
      });
    } catch (err) {
      if (err instanceof AppError && err.errorCode === ErrorCode.WS_013) return "SKIPPED";
      throw err;
    }
    return "REVOKED";
  }

  /**
   * p3-04 §5.4 — khách hết hạn (job `guest.expire` + cron quét bù `guests.expire-sweep`). IDEMPOTENT: không còn ACTIVE/GUEST,
   * version job cũ (`expectedVersion` ≠ `expiryVersion`, tức đã gia hạn) hoặc chưa tới hạn → `SKIPPED`. Đi cùng đường
   * thu hồi với remove/ban/leave (`revokeInTx`): `status=REMOVED, leftReason=EXPIRED`, `memberCount-1`, outbox
   * `membership.revoked` + `channel.membership-revoked` (xoá grant DIRECT của khách) + `conversations.workspace-member-removed`
   * (rời nhóm chat), sau commit `revokeScope` (đá room, `permission:revoked` reason `EXPIRED`, huỷ push chờ).
   */
  async expireGuest(
    workspaceId: string,
    userId: string,
    opts: { expectedVersion?: number; now?: Date } = {}
  ): Promise<"EXPIRED" | "SKIPPED"> {
    const now = opts.now ?? new Date();
    const membership = await this.repo.findByWorkspaceAndUser(workspaceId, userId);
    if (!membership || membership.status !== "ACTIVE" || membership.role !== "GUEST" || !membership.expiresAt) {
      return "SKIPPED";
    }
    const version = membership.expiryVersion ?? 0;
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== version) return "SKIPPED";
    if (membership.expiresAt.getTime() > now.getTime() + EXPIRE_GRACE_MS) return "SKIPPED";

    try {
      await this.revokeInTx(workspaceId, userId, "REMOVED", {
        actorId: userId,
        auditAction: null,
        system: true,
        leftReason: "EXPIRED",
        revokeReason: "EXPIRED",
        guard: { role: "GUEST", expiryVersion: version },
      });
    } catch (err) {
      // Thua cuộc đua (vừa bị gỡ/vừa gia hạn giữa lúc đọc và ghi) → coi như đã có người xử lý.
      if (err instanceof AppError && err.errorCode === ErrorCode.WS_013) return "SKIPPED";
      throw err;
    }
    await auditService.record({
      actorId: userId,
      actorRole: "system",
      action: "guest.expire",
      targetType: "WorkspaceMembership",
      targetId: `${workspaceId}:${userId}`,
      workspaceId,
      metadata: { expiresAt: membership.expiresAt.toISOString() },
    });
    return "EXPIRED";
  }
}
