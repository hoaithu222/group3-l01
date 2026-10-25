import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { ROOM } from "../../../infrastructure/socket";
import { joinRooms } from "../../../infrastructure/socket/socket.emit";
import { permissionService } from "../../../core/permission";
import { LIMITS } from "../../../core/constants/limits";
import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { AppError, ConflictError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { encodeCursor } from "../../../core/utils/cursor";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import { avatarUrlOf } from "../../../shared/media";
import type { IInvitationRepository, WorkspaceBrief } from "../repositories/invitation.repository.interface";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { InviteLink } from "../entities/invite.interface";
import type { JoinRequestRow } from "../entities/invitation.interface";
import type { MemberRow, WorkspaceMembership, WorkspaceRoleValue } from "../entities/member.interface";
import { INVITE_REQUEST_MESSAGE_MAX } from "../dtos/create-invite.dto";
import { toMemberRow } from "./member.presenter";
import "./access-notification-types";

const auditService = new AuditService();
const REJECT_COOLDOWN_MS = 24 * 3600_000;

export type JoinRequestOutcome = { status: "PENDING"; created: boolean };

/** Duyệt tham gia (be.md p3-04 §5.5): tạo yêu cầu từ link mời khi `joinPolicy=APPROVAL`, danh sách, duyệt/từ chối/huỷ. */
export class JoinRequestService {
  constructor(
    private readonly memberships: IMembershipRepository,
    private readonly invitations: IInvitationRepository,
    private readonly channelBootstrap: ChannelBootstrapPort
  ) {}

  /**
   * Nhánh `APPROVAL` của `InviteService.accept`: tạo/giữ yêu cầu `PENDING`. Đang PENDING → trả lại trạng thái chờ, KHÔNG tiêu
   * lượt link (RB-08); vừa bị từ chối < 24 giờ → `429 WS_019`; ngược lại tiêu MỘT lượt link khi tạo PENDING (giữ ý nghĩa `maxUses`).
   * `requestMessage` (đã chuẩn hoá ở `acceptInviteSchema`, ≤ `INVITE_REQUEST_MESSAGE_MAX`) chỉ được lưu khi TẠO yêu cầu mới; yêu cầu đang chờ giữ nguyên lời nhắn cũ.
   */
  async requestFromLink(
    userId: string,
    link: InviteLink,
    workspace: WorkspaceBrief,
    existing: WorkspaceMembership | null,
    consumeLink: (tx: Prisma.TransactionClient) => Promise<void>,
    requestMessage?: string
  ): Promise<JoinRequestOutcome> {
    if (existing?.status === "PENDING") return { status: "PENDING", created: false };
    if (existing?.status === "REMOVED" && existing.leftReason === "REJECTED" && existing.decidedAt) {
      const wait = existing.decidedAt.getTime() + REJECT_COOLDOWN_MS - Date.now();
      if (wait > 0) {
        throw new AppError(ErrorMessages[ErrorCode.WS_019], 429, ErrorCode.WS_019, { retryAfterSeconds: Math.ceil(wait / 1000) });
      }
    }
    const activeCount = await this.memberships.countActiveByUser(userId);
    if (activeCount >= LIMITS.workspace.perUserMax) {
      throw new AppError(ErrorMessages[ErrorCode.WS_006], 409, ErrorCode.WS_006);
    }

    const now = new Date();
    await withTransaction(async (tx) => {
      await consumeLink(tx);
      const fresh = {
        role: "MEMBER" as const,
        status: "PENDING" as const,
        requestedAt: now,
        // Ghi null TƯỜNG MINH khi không có lời nhắn (Prisma+Mongo: field vắng mặt ≠ null).
        requestMessage: requestMessage?.trim().slice(0, INVITE_REQUEST_MESSAGE_MAX) || null,
        invitedBy: link.createdBy,
        inviteLinkId: link.id,
        leftAt: null,
        leftReason: null,
        removedBy: null,
        banReason: null,
        decidedBy: null,
        decidedAt: null,
      };
      await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
        create: { workspaceId: workspace.id, userId, joinedAt: now, ...fresh },
        update: fresh,
      });
      const admins = await tx.workspaceMembership.findMany({
        where: { workspaceId: workspace.id, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
        select: { userId: true },
      });
      if (admins.length > 0) {
        await notify(tx, {
          type: PHASE3_NOTIFICATION_TYPES.JOIN_REQUESTED,
          actorId: userId,
          scope: { type: "WORKSPACE", id: workspace.id },
          workspaceId: workspace.id,
          source: { type: "WorkspaceMembership", id: `join-request:${workspace.id}:${userId}:${now.getTime()}` },
          refs: { workspaceId: workspace.id, workspaceName: workspace.name, requesterId: userId },
          recipients: admins.map((a) => ({ userId: a.userId })),
          dedupeKey: `workspace.join-requested:${workspace.id}:${userId}:${now.getTime()}`,
        });
      }
    });
    return { status: "PENDING", created: true };
  }

  /** Workspace tối thiểu (`joinPolicy`, trạng thái) cho `InviteService.accept` — không import chéo repo. */
  findWorkspace(workspaceId: string): Promise<WorkspaceBrief | null> {
    return this.invitations.findWorkspace(workspaceId);
  }

  /** `GET /workspaces/:id/join-requests` (OWNER/ADMIN). */
  async list(
    workspaceId: string,
    query: { cursor?: string; limit: number }
  ): Promise<{ data: JoinRequestRow[]; nextCursor: string | null; hasMore: boolean }> {
    const { data, hasMore } = await this.memberships.listPendingRequests(workspaceId, query);
    const rows: JoinRequestRow[] = data.map((row) => ({
      user: { id: row.user.id, name: row.user.name, avatarUrl: avatarUrlOf(row.user.avatarAssetId) },
      requestMessage: row.membership.requestMessage ?? null,
      requestedAt: row.membership.requestedAt ?? row.membership.joinedAt,
      via: "INVITE_LINK",
    }));
    const last = data[data.length - 1];
    const lastAt = last ? (last.membership.requestedAt ?? last.membership.joinedAt) : null;
    return { data: rows, nextCursor: hasMore && last && lastAt ? encodeCursor(lastAt, last.membership.id) : null, hasMore };
  }

  /** `POST …/join-requests/:userId/approve` — PENDING → ACTIVE + kênh mặc định + `JOIN_APPROVED`. */
  async approve(actorId: string, actorRole: WorkspaceRoleValue, workspaceId: string, userId: string): Promise<MemberRow> {
    const workspace = await this.requireActiveWorkspace(workspaceId);
    const pending = await this.requirePending(workspaceId, userId);
    const activeCount = await this.memberships.countActiveByUser(userId);
    if (activeCount >= LIMITS.workspace.perUserMax) {
      throw new AppError(ErrorMessages[ErrorCode.WS_006], 409, ErrorCode.WS_006);
    }

    const now = new Date();
    await withTransaction(async (tx) => {
      const claim = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId, status: "PENDING" },
        data: { status: "ACTIVE", role: "MEMBER", joinedAt: now, decidedBy: actorId, decidedAt: now, leftAt: null, leftReason: null },
      });
      if (claim.count === 0) throw this.notPending();

      if (workspace.defaultChannelId) await this.channelBootstrap.joinDefault(tx, workspace.defaultChannelId, userId);
      await tx.workspace.update({ where: { id: workspaceId }, data: { memberCount: { increment: 1 }, lastActivityAt: now } });
      await outbox.add(tx, {
        type: "membership.joined",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${workspaceId}:${userId}`,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `membership.joined:${workspaceId}:${userId}:approved:${now.getTime()}`,
        payload: { event: "joined", workspaceId, userId, role: "MEMBER", via: "APPROVED" },
      });
      await notify(tx, {
        type: PHASE3_NOTIFICATION_TYPES.JOIN_APPROVED,
        actorId,
        scope: { type: "WORKSPACE", id: workspaceId },
        workspaceId,
        source: { type: "WorkspaceMembership", id: `join-approved:${workspaceId}:${userId}:${now.getTime()}` },
        refs: { workspaceId, workspaceName: workspace.name },
        recipients: [{ userId }],
        dedupeKey: `workspace.join-approved:${workspaceId}:${userId}:${now.getTime()}`,
      });
    });

    await permissionService.bumpVersion({ type: "WORKSPACE", id: workspaceId });
    joinRooms([userId], [ROOM.workspace(workspaceId)]);
    await auditService.record({
      actorId,
      action: "join-request.approve",
      targetType: "WorkspaceMembership",
      targetId: `${workspaceId}:${userId}`,
      workspaceId,
      metadata: { requestedAt: pending.requestedAt?.toISOString() },
    });
    return this.presentRow(workspaceId, userId, actorId, actorRole);
  }

  /** `POST …/join-requests/:userId/reject` — PENDING → REMOVED (`leftReason REJECTED`); xin lại được sau 24 giờ. */
  async reject(
    actorId: string,
    actorRole: WorkspaceRoleValue,
    workspaceId: string,
    userId: string,
    reason: string | undefined
  ): Promise<MemberRow> {
    const workspace = await this.requireActiveWorkspace(workspaceId);
    await this.requirePending(workspaceId, userId);

    const now = new Date();
    await withTransaction(async (tx) => {
      const claim = await tx.workspaceMembership.updateMany({
        where: { workspaceId, userId, status: "PENDING" },
        data: { status: "REMOVED", leftAt: now, leftReason: "REJECTED", decidedBy: actorId, decidedAt: now, removedBy: actorId },
      });
      if (claim.count === 0) throw this.notPending();
      await notify(tx, {
        type: PHASE3_NOTIFICATION_TYPES.JOIN_REJECTED,
        actorId,
        // Người bị từ chối không còn là thành viên → không gắn scope (không có gì để kiểm quyền/mở).
        scope: null,
        workspaceId,
        source: { type: "WorkspaceMembership", id: `join-rejected:${workspaceId}:${userId}:${now.getTime()}` },
        refs: { workspaceId, workspaceName: workspace.name },
        recipients: [{ userId }],
        dedupeKey: `workspace.join-rejected:${workspaceId}:${userId}:${now.getTime()}`,
      });
    });
    await auditService.record({
      actorId,
      action: "join-request.reject",
      targetType: "WorkspaceMembership",
      targetId: `${workspaceId}:${userId}`,
      workspaceId,
      reason,
    });
    return this.presentRow(workspaceId, userId, actorId, actorRole);
  }

  /** `POST /workspaces/:id/join-request/cancel` — chính người đang chờ huỷ yêu cầu (`LEFT`); không có yêu cầu → 404. */
  async cancel(userId: string, workspaceId: string): Promise<void> {
    const now = new Date();
    const claim = await withTransaction((tx) =>
      tx.workspaceMembership.updateMany({
        where: { workspaceId, userId, status: "PENDING" },
        data: { status: "LEFT", leftAt: now, leftReason: "LEFT" },
      })
    );
    if (claim.count === 0) throw new NotFoundError();
  }

  // ── nội bộ ────────────────────────────────────────────────────────────────

  private async requirePending(workspaceId: string, userId: string): Promise<WorkspaceMembership> {
    const membership = await this.memberships.findByWorkspaceAndUser(workspaceId, userId);
    if (!membership || membership.status !== "PENDING") throw this.notPending();
    return membership;
  }

  private notPending(): ConflictError {
    return new ConflictError("Yêu cầu không còn ở trạng thái chờ duyệt");
  }

  private async requireActiveWorkspace(workspaceId: string): Promise<WorkspaceBrief> {
    const workspace = await this.invitations.findWorkspace(workspaceId);
    if (!workspace) throw new NotFoundError();
    if (workspace.status === "ARCHIVED") throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);
    return workspace;
  }

  private async presentRow(workspaceId: string, userId: string, actorId: string, actorRole: WorkspaceRoleValue): Promise<MemberRow> {
    const found = await this.memberships.findWithUser(workspaceId, userId);
    if (!found) throw new NotFoundError();
    return toMemberRow(found, actorId, "OFFLINE", actorRole);
  }
}
