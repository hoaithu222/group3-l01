import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { ROOM } from "../../../infrastructure/socket";
import { joinRooms } from "../../../infrastructure/socket/socket.emit";
import { permissionService } from "../../../core/permission";
import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { HttpStatusCode } from "../../../core/constants/http-status";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { ChannelGrantChange, ChannelGrantPort } from "../../../shared/ports/channel-grant.port";
import { avatarUrlOf } from "../../../shared/media";
import type { IInvitationRepository, WorkspaceBrief } from "../repositories/invitation.repository.interface";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type {
  AcceptInvitationResult,
  InvitationDto,
  InvitationPreview,
  WorkspaceInvitation,
} from "../entities/invitation.interface";
import type { IGuestConfig } from "./guest-config";
import { hashInviteToken } from "./invite-token.util";
import {
  checkEmailAccess,
  doneKeyFor,
  guestExpiryFrom,
  isInvitationUsable,
  maskEmail,
  normalizeEmail,
  resolveGuestPolicy,
} from "./invitation-rules";
import { toInvitationDto } from "./invitation.presenter";
import { scheduleGuestExpiryInTx } from "./guest-expiry.schedule";
import "./access-notification-types";

const auditService = new AuditService();

/** `GET /me/invitations` — lời mời + đủ thông tin để hiện (không token; chấp nhận qua `POST /me/invitations/:id/accept`). */
export interface MyInvitationDto extends InvitationDto {
  workspace: { name: string; avatarUrl: string | null };
  inviter: { name: string };
}

interface AcceptTxResult {
  result: AcceptInvitationResult;
  grantChange: ChannelGrantChange | null;
  joinedAsMember: boolean;
  becameMember: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function gone(): AppError {
  return new AppError(ErrorMessages[ErrorCode.INV_010], HttpStatusCode.GONE, ErrorCode.INV_010);
}

/** Xem trước, chấp nhận (theo token hoặc theo id với tài khoản đã xác minh email) và liệt kê lời mời của chính mình. */
export class InvitationAcceptService {
  constructor(
    private readonly invitations: IInvitationRepository,
    private readonly memberships: IMembershipRepository,
    private readonly channelBootstrap: ChannelBootstrapPort,
    private readonly channelGrant: ChannelGrantPort,
    private readonly guestConfig: IGuestConfig
  ) {}

  /** `GET /invitations/by-token/:token` (`optionalAuth`) — token lạ 404; hết hạn/thu hồi/đã dùng 410 `INV_010`. */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.invitations.findByTokenHash(hashInviteToken(token));
    if (!invitation) throw new NotFoundError();
    if (!isInvitationUsable(invitation, new Date())) {
      await this.markExpiredLazily(invitation);
      throw gone();
    }
    const workspace = await this.invitations.findWorkspace(invitation.workspaceId);
    if (!workspace || workspace.status === "ARCHIVED") {
      throw new AppError(ErrorMessages[ErrorCode.INV_005], 409, ErrorCode.INV_005);
    }
    const inviter = await this.invitations.findUserById(invitation.invitedBy);
    const channels =
      invitation.role === "GUEST"
        ? (await this.invitations.listChannels(invitation.workspaceId, invitation.guestChannelIds))
            .filter((c) => c.status === "ACTIVE")
            .map((c) => ({ name: c.name }))
        : undefined;
    return {
      workspace: { name: workspace.name, avatarUrl: avatarUrlOf(workspace.avatarAssetId) },
      invitedBy: { name: inviter?.name ?? "?" },
      role: invitation.role,
      ...(channels && { channels }),
      guestDays: invitation.guestDays,
      expiresAt: invitation.expiresAt,
      emailHint: maskEmail(invitation.email),
      status: invitation.status,
    };
  }

  /** `POST /invitations/by-token/:token/accept` (be.md §5.3). */
  async accept(user: AuthUser, token: string): Promise<AcceptInvitationResult> {
    const invitation = await this.invitations.findByTokenHash(hashInviteToken(token));
    if (!invitation) throw new NotFoundError();
    return this.acceptInvitation(user, invitation);
  }

  /**
   * `POST /me/invitations/:id/accept` — chấp nhận KHÔNG cần token: danh tính đã chứng minh bằng email ĐÃ XÁC MINH khớp
   * lời mời (cùng kiểm tra `checkEmailAccess`). Người khác/không khớp → 404 trung tính (không lộ lời mời tồn tại).
   */
  async acceptMine(user: AuthUser, invitationId: string): Promise<AcceptInvitationResult> {
    const [invitation, account] = await Promise.all([this.invitations.findById(invitationId), this.invitations.findUserById(user.id)]);
    // So với email TRONG DB (không tin claim email của JWT).
    if (!invitation || !account || normalizeEmail(account.email) !== invitation.normalizedEmail) throw new NotFoundError();
    return this.acceptInvitation(user, invitation);
  }

  /** `GET /me/invitations` — chỉ khi tài khoản đã xác minh email; lời mời PENDING còn hạn khớp email. */
  async listMine(user: AuthUser): Promise<MyInvitationDto[]> {
    const account = await this.invitations.findUserById(user.id);
    if (!account?.emailVerified) return [];
    const rows = await this.invitations.listPendingByEmail(normalizeEmail(account.email), new Date());
    const out: MyInvitationDto[] = [];
    for (const row of rows) {
      const [workspace, inviter] = await Promise.all([
        this.invitations.findWorkspace(row.workspaceId),
        this.invitations.findUserById(row.invitedBy),
      ]);
      if (!workspace || workspace.status === "ARCHIVED") continue;
      out.push({
        ...toInvitationDto(row),
        workspace: { name: workspace.name, avatarUrl: avatarUrlOf(workspace.avatarAssetId) },
        inviter: { name: inviter?.name ?? "?" },
      });
    }
    return out;
  }

  // ── lõi chấp nhận ─────────────────────────────────────────────────────────

  private async acceptInvitation(user: AuthUser, invitation: WorkspaceInvitation): Promise<AcceptInvitationResult> {
    const now = new Date();
    if (!isInvitationUsable(invitation, now)) {
      await this.markExpiredLazily(invitation);
      throw gone();
    }

    const account = await this.invitations.findUserById(user.id);
    if (!account) throw new NotFoundError();
    const mismatch = checkEmailAccess(account, invitation);
    if (mismatch) {
      throw new AppError(ErrorMessages[ErrorCode.INV_008], 403, ErrorCode.INV_008, { reason: mismatch });
    }

    const workspace = await this.invitations.findWorkspace(invitation.workspaceId);
    if (!workspace) throw new NotFoundError();
    if (workspace.status === "ARCHIVED") {
      throw new AppError(ErrorMessages[ErrorCode.INV_005], 409, ErrorCode.INV_005);
    }

    const existing = await this.memberships.findByWorkspaceAndUser(invitation.workspaceId, user.id);
    if (existing?.status === "BANNED") {
      throw new AppError(ErrorMessages[ErrorCode.INV_004], 403, ErrorCode.INV_004);
    }
    if (existing?.status !== "ACTIVE") {
      const activeCount = await this.memberships.countActiveByUser(user.id);
      if (activeCount >= LIMITS.workspace.perUserMax) {
        throw new AppError(ErrorMessages[ErrorCode.WS_006], 409, ErrorCode.WS_006);
      }
    }
    if (invitation.role === "GUEST" && existing?.status !== "ACTIVE") await this.assertGuestCapacity(workspace);

    let outcome: AcceptTxResult;
    try {
      outcome = await withTransaction((tx) => this.acceptInTx(tx, invitation, workspace, user.id, now));
    } catch (err) {
      // Đua tạo membership mới với một đường khác (link mời…) → P2002; tx đã hỏng nên chạy lại NGOÀI transaction:
      // lần sau thấy membership ACTIVE và trả kết quả idempotent.
      if (isUniqueViolation(err)) return this.acceptInvitation(user, invitation);
      throw err;
    }

    if (outcome.becameMember) {
      await permissionService.bumpVersion({ type: "WORKSPACE", id: invitation.workspaceId });
      if (outcome.joinedAsMember) joinRooms([user.id], [ROOM.workspace(invitation.workspaceId)]);
      if (outcome.grantChange) await this.channelGrant.afterCommit(outcome.grantChange);
      await auditService.record({
        actorId: user.id,
        action: "invitation.accept",
        targetType: "WorkspaceInvitation",
        targetId: invitation.id,
        workspaceId: invitation.workspaceId,
        metadata: { role: invitation.role },
      });
    }
    return outcome.result;
  }

  private async acceptInTx(
    tx: Prisma.TransactionClient,
    invitation: WorkspaceInvitation,
    workspace: WorkspaceBrief,
    userId: string,
    now: Date
  ): Promise<AcceptTxResult> {
    // CAS ĐẦU TIÊN: hai lượt chấp nhận đồng thời chỉ một thắng (kẻ thua thấy count 0 → 410) trước khi đụng membership.
    const claim = await tx.workspaceInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", acceptedBy: userId, acceptedAt: now, pendingKey: doneKeyFor(invitation.id) },
    });
    if (claim.count === 0) throw gone();

    const current = await tx.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
    });
    if (current?.status === "ACTIVE") {
      // Đã là thành viên (vd vào bằng link mời) → không đổi vai trò; chỉ đóng lời mời.
      return {
        result: { workspaceId: invitation.workspaceId, membership: { role: current.role, status: "ACTIVE", expiresAt: current.expiresAt } },
        grantChange: null,
        joinedAsMember: false,
        becameMember: false,
      };
    }

    const isGuest = invitation.role === "GUEST";
    const expiresAt = isGuest ? guestExpiryFrom(now, invitation.guestDays ?? LIMITS.guest.defaultDays) : null;
    const shared = {
      role: invitation.role,
      status: "ACTIVE" as const,
      joinedAt: now,
      leftAt: null,
      leftReason: null,
      removedBy: null,
      banReason: null,
      expiresAt,
      invitedBy: invitation.invitedBy,
      invitationId: invitation.id,
      requestMessage: null,
      requestedAt: null,
      decidedBy: null,
      decidedAt: null,
    };
    const membership = await tx.workspaceMembership.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      create: { workspaceId: invitation.workspaceId, userId, expiryVersion: isGuest ? 1 : 0, ...shared },
      update: { ...shared, ...(isGuest && { expiryVersion: { increment: 1 } }) },
    });

    let grantChange: ChannelGrantChange | null = null;
    if (isGuest) {
      grantChange = await this.channelGrant.grantMemberInTx(tx, {
        workspaceId: invitation.workspaceId,
        userId,
        channelIds: invitation.guestChannelIds,
        actorId: invitation.invitedBy,
      });
      await scheduleGuestExpiryInTx(tx, {
        membershipId: membership.id,
        workspaceId: invitation.workspaceId,
        userId,
        expiresAt: expiresAt as Date,
        expiryVersion: membership.expiryVersion,
        noticeHours: (await this.guestConfig.load()).expiringNoticeHours,
        now,
      });
    } else if (workspace.defaultChannelId) {
      // MEMBER: kênh mặc định (+ kênh riêng tư cấp theo vai trò — `joinDefault` đã gọi reconcile). Khách KHÔNG vào kênh mặc định.
      await this.channelBootstrap.joinDefault(tx, workspace.defaultChannelId, userId);
    }

    await tx.workspace.update({
      where: { id: invitation.workspaceId },
      data: { memberCount: { increment: 1 }, lastActivityAt: now },
    });
    await outbox.add(tx, {
      type: "membership.joined",
      aggregateType: "WorkspaceMembership",
      aggregateId: `${invitation.workspaceId}:${userId}`,
      queue: "notifications",
      jobName: "membership.events",
      dedupeKey: `membership.joined:${invitation.workspaceId}:${userId}:${invitation.id}:${now.getTime()}`,
      payload: { event: "joined", workspaceId: invitation.workspaceId, userId, role: invitation.role, via: "EMAIL_INVITE" },
    });
    await notify(tx, {
      type: "workspace.invite-accepted",
      actorId: userId,
      scope: { type: "WORKSPACE", id: invitation.workspaceId },
      workspaceId: invitation.workspaceId,
      source: { type: "WorkspaceInvitation", id: invitation.id },
      refs: { workspaceId: invitation.workspaceId, invitationId: invitation.id },
      recipients: [{ userId: invitation.invitedBy }],
      dedupeKey: `workspace.invite-accepted:${invitation.id}:${userId}`,
    });

    return {
      result: {
        workspaceId: invitation.workspaceId,
        membership: { role: invitation.role, status: "ACTIVE", expiresAt },
        ...(grantChange && grantChange.skipped.length > 0 && { skippedChannels: grantChange.skipped }),
      },
      grantChange,
      joinedAsMember: !isGuest,
      becameMember: true,
    };
  }

  /** Nhóm đã tắt mời khách / đã đủ khách (kiểm lại lúc chấp nhận — chính sách có thể đổi sau khi mời). */
  private async assertGuestCapacity(workspace: WorkspaceBrief): Promise<void> {
    const policy = resolveGuestPolicy(workspace.guestPolicy, await this.guestConfig.load());
    const active = await this.invitations.countActiveGuests(workspace.id);
    if (!policy.enabled || active >= policy.maxGuests) {
      throw new AppError(ErrorMessages[ErrorCode.WS_018], 409, ErrorCode.WS_018);
    }
  }

  /** PENDING đã quá hạn → đặt EXPIRED (lười) và giải phóng `pendingKey`; trạng thái khác giữ nguyên. Best-effort. */
  private async markExpiredLazily(invitation: WorkspaceInvitation): Promise<void> {
    if (invitation.status !== "PENDING" || invitation.expiresAt > new Date()) return;
    try {
      await withTransaction(async (tx) => {
        await tx.workspaceInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING", expiresAt: { lte: new Date() } },
          data: { status: "EXPIRED", pendingKey: doneKeyFor(invitation.id) },
        });
      });
    } catch {
      // Bỏ qua — trạng thái chỉ để hiển thị; mọi đường đọc đều kiểm `expiresAt` độc lập.
    }
  }
}
