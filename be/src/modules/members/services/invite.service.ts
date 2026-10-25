import type { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { joinRooms } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { env } from "../../../core/config";
import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify, registerNotificationType } from "../../notifications/public";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import { avatarUrlOf } from "../../../shared/media";
import type { IInviteLinkRepository } from "../repositories/invite-link.repository.interface";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { CreateInviteDto } from "../dtos";
import type { JoinRequestService } from "./join-request.service";
import type {
  AcceptInviteResult,
  CreateInviteResult,
  InviteLink,
  InvitePreview,
  InviteRow,
  InviteStatus,
} from "../entities/invite.interface";
import { generateInviteToken, hashInviteToken } from "./invite-token.util";

const auditService = new AuditService();

registerNotificationType({
  type: "workspace.invite-accepted",
  inbox: true,
  inboxFilter: "all",
  pushType: null,
  androidChannel: "default",
  priority: 1,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.member.invite",
});

function inviteStatusOf(link: InviteLink, now: Date): InviteStatus {
  if (link.revokedAt) return "REVOKED";
  if (link.expiresAt <= now) return "EXPIRED";
  if (link.remainingUses <= 0) return "EXHAUSTED";
  return "ACTIVE";
}

/** `create/list/revoke/preview/accept` (be.md p1-02 §5.1-§5.3). */
export class InviteService {
  constructor(
    private readonly inviteRepo: IInviteLinkRepository,
    private readonly membershipRepo: IMembershipRepository,
    private readonly channelBootstrap: ChannelBootstrapPort,
    /** p3-04 — nhánh `joinPolicy=APPROVAL` (không truyền → luôn vào thẳng như Phase 1, unit test cũ). */
    private readonly joinRequests?: JoinRequestService
  ) {}

  async create(actorId: string, workspaceId: string, dto: CreateInviteDto): Promise<CreateInviteResult> {
    const activeCount = await this.inviteRepo.countActive(workspaceId, new Date());
    if (activeCount >= LIMITS.invite.activePerWorkspaceMax) {
      throw new AppError(ErrorMessages[ErrorCode.INV_006], 409, ErrorCode.INV_006);
    }

    const { token, tokenHash, tokenPrefix } = generateInviteToken();
    const expiresAt = new Date(Date.now() + dto.expiresInHours * 3600_000);

    const created = await withTransaction(async (tx) => {
      const link = await tx.inviteLink.create({
        data: {
          workspaceId,
          tokenHash,
          tokenPrefix,
          maxUses: dto.maxUses,
          remainingUses: dto.maxUses,
          expiresAt,
          createdBy: actorId,
          // Ghi null TƯỜNG MINH: Prisma+Mongo KHÔNG khớp `{ revokedAt: null }` với field vắng mặt → `claimLink()` (updateMany)
          // sẽ không bao giờ khớp và mọi lượt chấp nhận trả INV_001 (Phase 1 chỉ seed link có `revokedAt: null` nên test không thấy).
          revokedAt: null,
          revokedBy: null,
          lastUsedAt: null,
        },
      });
      await outbox.add(tx, {
        type: "invite.created",
        aggregateType: "InviteLink",
        aggregateId: link.id,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `invite.created:${link.id}`,
        payload: { event: "invite-created", workspaceId, inviteLinkId: link.id },
      });
      return link;
    });

    await auditService.record({
      actorId,
      action: "invite.create",
      targetType: "InviteLink",
      targetId: created.id,
      workspaceId,
    });

    return {
      id: created.id,
      url: `${env.PUBLIC_APP_LINK_BASE}/invite/${token}`,
      tokenPrefix,
      expiresAt: created.expiresAt,
      maxUses: created.maxUses,
    };
  }

  async list(workspaceId: string, cursor: string | undefined, limit: number): Promise<{ data: InviteRow[]; nextCursor: string | null; hasMore: boolean }> {
    const { data, hasMore } = await this.inviteRepo.listByWorkspace(workspaceId, { cursor, limit });
    const creatorIds = Array.from(new Set(data.map((l) => l.createdBy)));
    const { prisma } = await import("../../../infrastructure/database");
    const creators = creatorIds.length
      ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
      : [];
    const byId = new Map(creators.map((c) => [c.id, c]));
    const now = new Date();
    const { encodeCursor } = await import("../../../core/utils/cursor");
    const last = data[data.length - 1];
    return {
      data: data.map((link) => ({
        id: link.id,
        tokenPrefix: link.tokenPrefix,
        role: link.role,
        maxUses: link.maxUses,
        usesCount: link.usesCount,
        expiresAt: link.expiresAt,
        status: inviteStatusOf(link, now),
        createdBy: byId.get(link.createdBy) ?? { id: link.createdBy, name: "?" },
        createdAt: link.createdAt,
        lastUsedAt: link.lastUsedAt,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
    };
  }

  async revoke(actorId: string, workspaceId: string, inviteId: string): Promise<void> {
    const link = await this.inviteRepo.findById(inviteId);
    if (!link || link.workspaceId !== workspaceId) return; // idempotent (be.md §4 DELETE)
    if (link.revokedAt) return;

    await withTransaction(async (tx) => {
      await tx.inviteLink.update({ where: { id: inviteId }, data: { revokedAt: new Date(), revokedBy: actorId } });
      await outbox.add(tx, {
        type: "invite.revoked",
        aggregateType: "InviteLink",
        aggregateId: inviteId,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `invite.revoked:${inviteId}`,
        payload: { event: "invite-revoked", workspaceId, inviteLinkId: inviteId },
      });
    });
    await auditService.record({
      actorId,
      action: "invite.revoke",
      targetType: "InviteLink",
      targetId: inviteId,
      workspaceId,
    });
  }

  /** be.md §5.2 — trung tính khi hết hiệu lực (không lộ tên workspace ở 410). */
  async preview(token: string, viewerId: string | undefined): Promise<InvitePreview> {
    const link = await this.inviteRepo.findByTokenHash(hashInviteToken(token));
    if (!link) throw new NotFoundError();
    const now = new Date();
    const status = inviteStatusOf(link, now);
    if (status === "EXPIRED") throw new AppError(ErrorMessages[ErrorCode.INV_001], HttpStatusCode.GONE, ErrorCode.INV_001);
    if (status === "EXHAUSTED") throw new AppError(ErrorMessages[ErrorCode.INV_002], HttpStatusCode.GONE, ErrorCode.INV_002);
    if (status === "REVOKED") throw new AppError(ErrorMessages[ErrorCode.INV_003], HttpStatusCode.GONE, ErrorCode.INV_003);

    const { prisma } = await import("../../../infrastructure/database");
    const workspace = await prisma.workspace.findUnique({ where: { id: link.workspaceId } });
    if (!workspace || workspace.status === "ARCHIVED") {
      throw new AppError(ErrorMessages[ErrorCode.INV_005], 409, ErrorCode.INV_005);
    }
    const inviter = await prisma.user.findUnique({ where: { id: link.createdBy }, select: { name: true, avatarAssetId: true } });

    let alreadyMember: boolean | undefined;
    if (viewerId) {
      const membership = await this.membershipRepo.findByWorkspaceAndUser(link.workspaceId, viewerId);
      alreadyMember = membership?.status === "ACTIVE";
    }

    // Ảnh nhóm + người mời: URL ký sẵn dựng từ cột `avatarAssetId` của 2 bản ghi vừa đọc (không truy vấn thêm).
    return {
      workspace: { id: workspace.id, name: workspace.name, avatarUrl: avatarUrlOf(workspace.avatarAssetId), description: workspace.description },
      inviter: { name: inviter?.name ?? "?", avatarUrl: avatarUrlOf(inviter?.avatarAssetId) },
      expiresAt: link.expiresAt,
      requiresApproval: workspace.joinPolicy === "APPROVAL",
      ...(alreadyMember !== undefined && { alreadyMember }),
    };
  }

  /** be.md §5.3 — transaction nguyên tử, tranh lượt cuối qua CAS `remainingUses`. */
  async accept(userId: string, token: string, requestMessage?: string): Promise<AcceptInviteResult> {
    const tokenHash = hashInviteToken(token);
    const link = await this.inviteRepo.findByTokenHash(tokenHash);
    if (!link) throw new NotFoundError();

    const membership = await this.membershipRepo.findByWorkspaceAndUser(link.workspaceId, userId);
    if (membership?.status === "ACTIVE") {
      return { workspaceId: link.workspaceId, defaultChannelId: null, alreadyMember: true };
    }
    if (membership?.status === "BANNED") {
      throw new AppError(ErrorMessages[ErrorCode.INV_004], 403, ErrorCode.INV_004);
    }
    // p3-04 §2 — link mời KHÔNG dùng để tạo khách (khách chỉ qua lời mời đích danh theo email).
    if (link.role === "GUEST") {
      throw new AppError(ErrorMessages[ErrorCode.INV_009], 400, ErrorCode.INV_009);
    }

    // p3-04 §5.5 — nhóm bật duyệt (`joinPolicy=APPROVAL`): link chỉ tạo yêu cầu PENDING chờ OWNER/ADMIN duyệt.
    const brief = this.joinRequests ? await this.joinRequests.findWorkspace(link.workspaceId) : null;
    if (this.joinRequests && brief?.joinPolicy === "APPROVAL") {
      if (brief.status === "ARCHIVED") throw new AppError(ErrorMessages[ErrorCode.INV_005], 409, ErrorCode.INV_005);
      const outcome = await this.joinRequests.requestFromLink(
        userId,
        link,
        brief,
        membership,
        (tx) => this.claimLink(tx, link, new Date()),
        requestMessage
      );
      return { workspaceId: link.workspaceId, defaultChannelId: null, alreadyMember: false, status: outcome.status };
    }

    const activeCount = await this.membershipRepo.countActiveByUser(userId);
    if (activeCount >= LIMITS.workspace.perUserMax) {
      throw new AppError(ErrorMessages[ErrorCode.WS_006], 409, ErrorCode.WS_006);
    }

    const result = await withTransaction(async (tx) => {
      const now = new Date();
      await this.claimLink(tx, link, now);

      const workspace = await tx.workspace.findUnique({ where: { id: link.workspaceId } });
      if (!workspace) throw new NotFoundError();
      if (workspace.status === "ARCHIVED") {
        throw new AppError(ErrorMessages[ErrorCode.INV_005], 409, ErrorCode.INV_005);
      }

      await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: link.workspaceId, userId } },
        create: {
          workspaceId: link.workspaceId,
          userId,
          role: link.role,
          status: "ACTIVE",
          joinedAt: now,
          invitedBy: link.createdBy,
          inviteLinkId: link.id,
        },
        update: {
          status: "ACTIVE",
          role: link.role,
          joinedAt: now,
          leftAt: null,
          removedBy: null,
          banReason: null,
          leftReason: null,
          invitedBy: link.createdBy,
          inviteLinkId: link.id,
        },
      });

      if (workspace.defaultChannelId) {
        await this.channelBootstrap.joinDefault(tx, workspace.defaultChannelId, userId);
      }

      await tx.workspace.update({
        where: { id: link.workspaceId },
        data: { memberCount: { increment: 1 }, lastActivityAt: now },
      });

      await outbox.add(tx, {
        type: "membership.joined",
        aggregateType: "WorkspaceMembership",
        aggregateId: `${link.workspaceId}:${userId}`,
        queue: "notifications",
        jobName: "membership.events",
        dedupeKey: `membership.joined:${link.workspaceId}:${userId}:${link.id}:${now.getTime()}`,
        payload: { event: "joined", workspaceId: link.workspaceId, userId, role: link.role, via: "INVITE" },
      });

      await notify(tx, {
        type: "workspace.invite-accepted",
        actorId: userId,
        scope: { type: "WORKSPACE", id: link.workspaceId },
        workspaceId: link.workspaceId,
        source: { type: "InviteLink", id: link.id },
        refs: { workspaceId: link.workspaceId, inviteLinkId: link.id },
        recipients: [{ userId: link.createdBy }],
        dedupeKey: `workspace.invite-accepted:${link.id}:${userId}`,
      });

      return { workspaceId: link.workspaceId, defaultChannelId: workspace.defaultChannelId };
    });

    await permissionService.bumpVersion({ type: "WORKSPACE", id: link.workspaceId });

    // `member:updated` do consumer `membership.events` phát (outbox `membership.joined` bên trên) — chỗ này
    // chỉ lo join room ngay lập tức để client nhận realtime trong `ws:{id}` không phải chờ job relay.
    joinRooms([userId], [ROOM.workspace(link.workspaceId)]);

    return { ...result, alreadyMember: false };
  }

  /** CAS `remainingUses` (tranh lượt cuối) — dùng chung cho vào thẳng và tạo yêu cầu chờ duyệt; hết hiệu lực → 410 theo trạng thái thật. */
  private async claimLink(tx: Prisma.TransactionClient, link: InviteLink, now: Date): Promise<void> {
    const claim = await tx.inviteLink.updateMany({
      // `isSet: false` để vẫn nhận link tạo TRƯỚC khi `create()` ghi null tường minh (field vắng mặt).
      where: {
        id: link.id,
        OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
        expiresAt: { gt: now },
        remainingUses: { gt: 0 },
      },
      data: { remainingUses: { decrement: 1 }, usesCount: { increment: 1 }, lastUsedAt: now },
    });
    if (claim.count === 0) {
      const current = await tx.inviteLink.findUniqueOrThrow({ where: { id: link.id } });
      const status = inviteStatusOf(
        {
          id: current.id,
          workspaceId: current.workspaceId,
          tokenHash: current.tokenHash,
          tokenPrefix: current.tokenPrefix,
          role: current.role,
          maxUses: current.maxUses,
          remainingUses: current.remainingUses,
          usesCount: current.usesCount,
          expiresAt: current.expiresAt,
          revokedAt: current.revokedAt,
          revokedBy: current.revokedBy,
          createdBy: current.createdBy,
          createdAt: current.createdAt,
          lastUsedAt: current.lastUsedAt,
        },
        now
      );
      const code =
        status === "REVOKED" ? ErrorCode.INV_003 : status === "EXHAUSTED" ? ErrorCode.INV_002 : ErrorCode.INV_001;
      throw new AppError(ErrorMessages[code], HttpStatusCode.GONE, code);
    }
  }
}
