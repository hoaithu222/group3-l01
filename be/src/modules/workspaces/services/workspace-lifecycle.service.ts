import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { normalizeSearch } from "../../../core/utils/normalize";
import { AppError, NotFoundError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { permissionService } from "../../../core/permission";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify, registerNotificationType } from "../../notifications/public";
import type { MembershipLifecyclePort } from "../../../shared/ports/membership-lifecycle.port";
import type { IWorkspaceRepository } from "../repositories/workspace.repository.interface";
import type { Workspace, WorkspaceRoleValue } from "../entities/workspace.interface";
import type { ArchiveWorkspaceDto, RestoreWorkspaceDto, TransferOwnerDto } from "../dtos";
import { computeWorkspaceActions } from "./workspace-permission.resolver";
import { systemDefaultTimeZone } from "../../../core/config/workspace-timezone";
import { toWorkspaceDetail, type WorkspaceDetail } from "./workspace.presenter";

const auditService = new AuditService();

// Side-effect lúc import (giống `registerBuiltinNotificationTypes`) — chỉ
// thông báo hộp thư, không push (README p1-01 §5 "Push: Không").
registerNotificationType({
  type: "workspace.admin-change",
  inbox: true,
  inboxFilter: "all",
  pushType: null,
  androidChannel: "default",
  priority: 2,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.read",
});

interface ArchiveOptions {
  actorId: string;
  reason: "MANUAL" | "PLATFORM";
  note?: string;
  /** Route admin (be.md §4) không gửi `expectedVersion` — bỏ trống bỏ qua kiểm CAS version, chỉ còn CAS `status`. */
  expectedVersion?: number;
}

interface RestoreOptions {
  actorId: string;
  isPlatformActor: boolean;
  expectedVersion?: number;
  reason?: string;
}

/** `archive/restore/transfer-owner/leave` (be.md §5.3-§5.6) — `create/list/get/patch/me` ở `workspace.service.ts`. */
export class WorkspaceLifecycleService {
  constructor(
    private readonly repo: IWorkspaceRepository,
    private readonly membershipLifecycle: MembershipLifecyclePort
  ) {}

  async archive(userId: string, workspaceId: string, dto: ArchiveWorkspaceDto, role: WorkspaceRoleValue): Promise<WorkspaceDetail> {
    const workspace = await withTransaction((tx) =>
      this.archiveInTx(tx, workspaceId, { actorId: userId, reason: "MANUAL", note: dto.note, expectedVersion: dto.expectedVersion })
    );
    return this.afterStateChange(workspace, userId, role);
  }

  async platformArchive(adminId: string, workspaceId: string, reason: string): Promise<Workspace> {
    return withTransaction((tx) => this.archiveInTx(tx, workspaceId, { actorId: adminId, reason: "PLATFORM", note: reason }));
  }

  async restore(userId: string, workspaceId: string, dto: RestoreWorkspaceDto, role: WorkspaceRoleValue): Promise<WorkspaceDetail> {
    const workspace = await withTransaction((tx) =>
      this.restoreInTx(tx, workspaceId, { actorId: userId, isPlatformActor: false, expectedVersion: dto.expectedVersion })
    );
    return this.afterStateChange(workspace, userId, role);
  }

  async platformRestore(adminId: string, workspaceId: string, reason: string): Promise<Workspace> {
    return withTransaction((tx) => this.restoreInTx(tx, workspaceId, { actorId: adminId, isPlatformActor: true, reason }));
  }

  async transferOwner(userId: string, workspaceId: string, dto: TransferOwnerDto): Promise<{ workspace: Workspace; previousOwnerRole: "ADMIN" }> {
    const workspace = await withTransaction(async (tx) => {
      const target = await tx.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: dto.toUserId } },
      });
      if (!target || target.status !== "ACTIVE" || target.role === "OWNER") {
        throw new AppError(ErrorMessages[ErrorCode.WS_003], 409, ErrorCode.WS_003);
      }

      const targetUser = await tx.user.findUnique({ where: { id: dto.toUserId }, select: { name: true } });
      if (!targetUser) throw new AppError(ErrorMessages[ErrorCode.WS_003], 409, ErrorCode.WS_003);

      const compareName = target.displayName ?? targetUser.name;
      if (normalizeSearch(dto.confirmName) !== normalizeSearch(compareName)) {
        throw new AppError(ErrorMessages[ErrorCode.WS_005], 400, ErrorCode.WS_005);
      }

      const demoted = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId, role: "OWNER" },
        data: { role: "ADMIN" },
      });
      if (demoted.count !== 1) {
        throw new AppError(ErrorMessages[ErrorCode.WS_008], 409, ErrorCode.WS_008);
      }
      await tx.workspaceMembership.update({
        where: { workspaceId_userId: { workspaceId, userId: dto.toUserId } },
        data: { role: "OWNER" },
      });

      const ownerCount = await tx.workspaceMembership.count({ where: { workspaceId, role: "OWNER", status: "ACTIVE" } });
      if (ownerCount !== 1) {
        throw new AppError(ErrorMessages[ErrorCode.WS_008], 409, ErrorCode.WS_008);
      }

      const result = await tx.workspace.updateMany({
        where: { id: workspaceId, version: dto.expectedVersion, status: "ACTIVE" },
        data: { ownerId: dto.toUserId, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
        throw new VersionConflictError(current.version);
      }

      await auditService.record({
        actorId: userId,
        action: "workspace.transfer-owner",
        targetType: "Workspace",
        targetId: workspaceId,
        workspaceId,
        metadata: { toUserId: dto.toUserId },
      });

      const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

      await outbox.add(tx, {
        type: "workspace.owner-transferred",
        aggregateType: "Workspace",
        aggregateId: workspaceId,
        queue: "notifications",
        jobName: "workspace.events",
        dedupeKey: `workspace.owner-transferred:${workspaceId}:v${workspace.version}`,
        payload: { event: "owner-transferred", workspaceId, fromUserId: userId, toUserId: dto.toUserId },
      });

      return workspace;
    });

    await permissionService.bumpVersion({ type: "WORKSPACE", id: workspaceId });
    return { workspace, previousOwnerRole: "ADMIN" };
  }

  async leave(userId: string, workspaceId: string, role: WorkspaceRoleValue): Promise<void> {
    if (role === "OWNER") {
      throw new AppError(ErrorMessages[ErrorCode.WS_004], 409, ErrorCode.WS_004);
    }
    await this.membershipLifecycle.leave(userId, workspaceId);
  }

  private async archiveInTx(tx: Prisma.TransactionClient, workspaceId: string, opts: ArchiveOptions): Promise<Workspace> {
    const result = await tx.workspace.updateMany({
      where: { id: workspaceId, status: "ACTIVE", ...(opts.expectedVersion !== undefined && { version: opts.expectedVersion }) },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedBy: opts.actorId,
        archivedReason: opts.reason,
        archiveNote: opts.note ?? null,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
      if (!current) throw new NotFoundError();
      if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
      throw new VersionConflictError(current.version);
    }

    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

    if (opts.reason === "PLATFORM") {
      await auditService.record({
        actorId: opts.actorId,
        action: "workspace.platform-archive",
        targetType: "Workspace",
        targetId: workspaceId,
        workspaceId,
        reason: opts.note,
      });
      await notify(tx, {
        type: "workspace.admin-change",
        actorId: opts.actorId,
        scope: { type: "WORKSPACE", id: workspaceId },
        workspaceId,
        source: { type: "Workspace", id: workspaceId },
        refs: { workspaceId, action: "archived" },
        recipients: [{ userId: workspace.ownerId }],
        dedupeKey: `workspace.admin-change:${workspaceId}:archived:v${workspace.version}`,
      });
    }

    await outbox.add(tx, {
      type: "workspace.archived",
      aggregateType: "Workspace",
      aggregateId: workspaceId,
      queue: "notifications",
      jobName: "workspace.events",
      dedupeKey: `workspace.archived:${workspaceId}:v${workspace.version}`,
      payload: { event: "archived", workspaceId, reason: opts.reason },
    });

    // p1-05 (`modules/conversations/jobs/workspace-status.job.ts`) cần chuyển
    // nhóm chat (GROUP) của workspace sang chỉ đọc (`ConversationHooks.onWorkspaceArchived`)
    // — 1 outbox row RIÊNG (jobName khác) trong CÙNG transaction, mirror cách
    // `members` ghi `conversations.workspace-member-removed`: mỗi cặp
    // queue/jobName chỉ có đúng 1 processor (`registerJob`), không import module `conversations`.
    await outbox.add(tx, {
      type: "conversation.workspace-archived",
      aggregateType: "Workspace",
      aggregateId: workspaceId,
      queue: "notifications",
      jobName: "conversations.workspace-archived",
      dedupeKey: `conversations.workspace-archived:${workspaceId}:v${workspace.version}`,
      payload: { workspaceId },
    });

    return workspace as unknown as Workspace;
  }

  private async restoreInTx(tx: Prisma.TransactionClient, workspaceId: string, opts: RestoreOptions): Promise<Workspace> {
    const current = await tx.workspace.findUnique({ where: { id: workspaceId } });
    if (!current) throw new NotFoundError();
    if (current.status === "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.WS_007], 409, ErrorCode.WS_007);
    if (current.archivedReason === "PLATFORM" && !opts.isPlatformActor) {
      throw new AppError(ErrorMessages[ErrorCode.WS_009], 403, ErrorCode.WS_009);
    }

    const result = await tx.workspace.updateMany({
      where: {
        id: workspaceId,
        status: "ARCHIVED",
        ...(opts.expectedVersion !== undefined && { version: opts.expectedVersion }),
      },
      data: { status: "ACTIVE", archivedAt: null, archivedBy: null, archivedReason: null, archiveNote: null, version: { increment: 1 } },
    });
    if (result.count === 0) throw new VersionConflictError(current.version);

    if (opts.isPlatformActor) {
      await auditService.record({
        actorId: opts.actorId,
        action: "workspace.platform-restore",
        targetType: "Workspace",
        targetId: workspaceId,
        workspaceId,
        reason: opts.reason,
      });
    }

    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

    await outbox.add(tx, {
      type: "workspace.restored",
      aggregateType: "Workspace",
      aggregateId: workspaceId,
      queue: "notifications",
      jobName: "workspace.events",
      dedupeKey: `workspace.restored:${workspaceId}:v${workspace.version}`,
      payload: { event: "restored", workspaceId },
    });

    // Đối xứng với archive ở trên — `ConversationHooks.onWorkspaceRestored`
    // (GROUP ARCHIVED → ACTIVE, không mở lại DISSOLVED).
    await outbox.add(tx, {
      type: "conversation.workspace-restored",
      aggregateType: "Workspace",
      aggregateId: workspaceId,
      queue: "notifications",
      jobName: "conversations.workspace-restored",
      dedupeKey: `conversations.workspace-restored:${workspaceId}:v${workspace.version}`,
      payload: { workspaceId },
    });

    return workspace as unknown as Workspace;
  }

  private async afterStateChange(workspace: Workspace, userId: string, role: WorkspaceRoleValue): Promise<WorkspaceDetail> {
    await permissionService.bumpVersion({ type: "WORKSPACE", id: workspace.id });
    const [memberCount, membership] = await Promise.all([
      this.repo.countMembers(workspace.id),
      this.repo.findMembership(workspace.id, userId),
    ]);
    if (!membership) throw new NotFoundError();
    const access = { visible: true, role, actions: computeWorkspaceActions(role, workspace.status) };
    return toWorkspaceDetail(workspace, memberCount, access, membership, undefined, await systemDefaultTimeZone());
  }
}
