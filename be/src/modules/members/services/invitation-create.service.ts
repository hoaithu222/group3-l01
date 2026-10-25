import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { LIMITS } from "../../../core/constants/limits";
import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ScopeForbiddenError,
  ScopeRateLimitError,
  ValidationError,
} from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { encodeCursor } from "../../../core/utils/cursor";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import type { IInvitationRepository, UserBrief, WorkspaceBrief } from "../repositories/invitation.repository.interface";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type {
  InvitationDto,
  InvitationRoleValue,
  InviteMembersResult,
  InviteSkipReason,
  WorkspaceInvitation,
} from "../entities/invitation.interface";
import type { WorkspaceRoleValue } from "../entities/member.interface";
import type { InviteGuestDto, InviteMembersDto, ListInvitationsQueryDto } from "../dtos";
import type { IGuestConfig } from "./guest-config";
import { generateInviteToken } from "./invite-token.util";
import {
  doneKeyFor,
  invitationExpiryFrom,
  normalizeEmail,
  pendingKeyFor,
  resolveGuestPolicy,
} from "./invitation-rules";
import { INVITATION_MAIL_JOB, invitationMailKey, sealInvitationToken, type InvitationMailPayload } from "./invitation-mail";
import { toInvitationDto } from "./invitation.presenter";
import "./access-notification-types";

const auditService = new AuditService();
const DAY_MS = 24 * 3600_000;

/** Kiểm actor quản lý được 1 kênh (kênh riêng tư: cần grant MANAGER) — tách để unit test khỏi `permissionService`. */
export type ChannelManageCheck = (actor: AuthUser, channelId: string) => Promise<boolean>;

export const defaultChannelManageCheck: ChannelManageCheck = (actor, channelId) =>
  permissionService.can(actor, "channel.manage", { type: "CHANNEL", id: channelId });

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Vai trò của người thao tác trong nhóm (đã qua `requireWorkspaceRole`) + user đăng nhập. */
export interface InvitationActor {
  user: AuthUser;
  role: WorkspaceRoleValue;
}

/** Tạo/liệt kê/thu hồi/gửi lại lời mời đích danh theo email (be.md p3-04 §4–§5.3). Chấp nhận nằm ở `invitation-accept.service.ts`. */
export class InvitationCreateService {
  constructor(
    private readonly invitations: IInvitationRepository,
    private readonly memberships: IMembershipRepository,
    private readonly guestConfig: IGuestConfig,
    private readonly canManageChannel: ChannelManageCheck = defaultChannelManageCheck
  ) {}

  /** `POST /workspaces/:id/guests/invitations` (OWNER/ADMIN). */
  async inviteGuest(actor: InvitationActor, workspaceId: string, dto: InviteGuestDto): Promise<InvitationDto> {
    const workspace = await this.requireActiveWorkspace(workspaceId);
    const config = await this.guestConfig.load();
    const policy = resolveGuestPolicy(workspace.guestPolicy, config);
    const now = new Date();

    if (!policy.enabled) throw this.guestDisabled();
    const committed = (await this.invitations.countActiveGuests(workspaceId)) + (await this.invitations.countPendingGuestInvitations(workspaceId, now));
    if (committed >= policy.maxGuests) throw this.guestDisabled();
    if (dto.days > policy.maxDays) {
      throw new ValidationError(`Khách tối đa ${policy.maxDays} ngày`);
    }

    const channelIds = [...new Set(dto.channelIds)];
    await this.assertDesignatableChannels(actor.user, workspaceId, channelIds);

    const normalizedEmail = normalizeEmail(dto.email);
    const invitee = await this.findInvitee(dto.email, normalizedEmail);
    if (invitee) await this.assertNotMember(workspaceId, invitee.id);
    const pending = await this.invitations.findPendingFor(workspaceId, normalizedEmail);
    if (pending && pending.expiresAt > now) {
      throw new ConflictError("Đã có lời mời đang chờ cho email này — hãy gửi lại hoặc thu hồi lời mời cũ");
    }
    await this.assertWithinDailyQuota(workspaceId, 1);

    const invitation = await this.createOne({
      workspace,
      actorId: actor.user.id,
      email: dto.email.trim(),
      normalizedEmail,
      role: "GUEST",
      guestChannelIds: channelIds,
      guestDays: dto.days,
      message: dto.message ?? null,
      invitee,
      now,
    });
    await auditService.record({
      actorId: actor.user.id,
      action: "invitation.create",
      targetType: "WorkspaceInvitation",
      targetId: invitation.id,
      workspaceId,
      metadata: { role: "GUEST", channels: channelIds.length, days: dto.days },
    });
    return toInvitationDto(invitation);
  }

  /** `POST /workspaces/:id/invitations` — OWNER/ADMIN, hoặc MEMBER khi `guestPolicy.memberCanInvite`. */
  async inviteMembers(actor: InvitationActor, workspaceId: string, dto: InviteMembersDto): Promise<InviteMembersResult> {
    const workspace = await this.requireActiveWorkspace(workspaceId);
    const config = await this.guestConfig.load();
    const policy = resolveGuestPolicy(workspace.guestPolicy, config);
    const privileged = actor.role === "OWNER" || actor.role === "ADMIN";
    if (!privileged && !(actor.role === "MEMBER" && policy.memberCanInvite)) {
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    }

    const now = new Date();
    const seen = new Set<string>();
    const targets: Array<{ email: string; normalizedEmail: string }> = [];
    for (const raw of dto.emails) {
      const normalizedEmail = normalizeEmail(raw);
      if (seen.has(normalizedEmail)) continue;
      seen.add(normalizedEmail);
      targets.push({ email: raw.trim(), normalizedEmail });
    }

    const invitees = await this.invitations.findUsersByEmails([...new Set(targets.flatMap((t) => [t.email, t.normalizedEmail]))]);
    const byEmail = new Map(invitees.map((u) => [normalizeEmail(u.email), u]));

    const result: InviteMembersResult = { created: [], skipped: [] };
    const toCreate: Array<{ email: string; normalizedEmail: string; invitee: UserBrief | null }> = [];
    for (const target of targets) {
      const invitee = byEmail.get(target.normalizedEmail) ?? null;
      const skip = await this.classifySkip(workspaceId, target.normalizedEmail, invitee, now);
      if (skip) result.skipped.push({ email: target.email, reason: skip });
      else toCreate.push({ ...target, invitee });
    }

    await this.assertWithinDailyQuota(workspaceId, toCreate.length);
    for (const target of toCreate) {
      try {
        const invitation = await this.createOne({
          workspace,
          actorId: actor.user.id,
          email: target.email,
          normalizedEmail: target.normalizedEmail,
          role: "MEMBER",
          guestChannelIds: [],
          guestDays: null,
          message: dto.message ?? null,
          invitee: target.invitee,
          now,
        });
        result.created.push(toInvitationDto(invitation));
      } catch (err) {
        // Đua với một lời mời PENDING vừa được tạo cho cùng email → coi như đã có (không làm hỏng cả lô).
        if (err instanceof ConflictError) result.skipped.push({ email: target.email, reason: "PENDING_EXISTS" });
        else throw err;
      }
    }
    if (result.created.length > 0) {
      await auditService.record({
        actorId: actor.user.id,
        action: "invitation.create",
        targetType: "Workspace",
        targetId: workspaceId,
        workspaceId,
        metadata: { role: "MEMBER", created: result.created.length, skipped: result.skipped.length },
      });
    }
    return result;
  }

  /** `GET /workspaces/:id/invitations` (OWNER/ADMIN). */
  async list(
    workspaceId: string,
    query: Pick<ListInvitationsQueryDto, "status" | "cursor" | "limit">
  ): Promise<{ data: InvitationDto[]; nextCursor: string | null; hasMore: boolean }> {
    const { data, hasMore } = await this.invitations.listByWorkspace(workspaceId, {
      status: query.status,
      cursor: query.cursor,
      limit: query.limit,
    });
    const last = data[data.length - 1];
    return {
      data: data.map(toInvitationDto),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
    };
  }

  /** `POST /invitations/:id/revoke` — OWNER/ADMIN hoặc chính người mời. Idempotent-an-toàn: không còn PENDING → 409. */
  async revoke(actor: AuthUser, invitationId: string): Promise<InvitationDto> {
    const invitation = await this.requireManageable(actor.id, invitationId);
    const now = new Date();
    const revoked = await withTransaction(async (tx) => {
      const claim = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "REVOKED", revokedBy: actor.id, revokedAt: now, pendingKey: doneKeyFor(invitation.id) },
      });
      if (claim.count === 0) return null;
      return tx.workspaceInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    });
    if (!revoked) throw new ConflictError("Lời mời không còn ở trạng thái chờ");
    await auditService.record({
      actorId: actor.id,
      action: "invitation.revoke",
      targetType: "WorkspaceInvitation",
      targetId: invitation.id,
      workspaceId: invitation.workspaceId,
    });
    return toInvitationDto({ ...invitation, status: "REVOKED", revokedBy: actor.id, revokedAt: now, pendingKey: doneKeyFor(invitation.id) });
  }

  /** `POST /invitations/:id/resend` — hạn mới +7 ngày, token mới (token cũ → 410), cooldown 12 giờ (`RATE_003`). */
  async resend(actor: AuthUser, invitationId: string): Promise<InvitationDto> {
    const invitation = await this.requireManageable(actor.id, invitationId);
    if (invitation.status !== "PENDING") throw new ConflictError("Lời mời không còn ở trạng thái chờ");
    const workspace = await this.requireActiveWorkspace(invitation.workspaceId);

    const now = new Date();
    const cooldownMs = LIMITS.invitation.resendCooldownHours * 3600_000;
    const elapsed = now.getTime() - invitation.lastSentAt.getTime();
    if (elapsed < cooldownMs) {
      throw new ScopeRateLimitError(Math.ceil((cooldownMs - elapsed) / 1000), ErrorCode.RATE_003);
    }

    const { token, tokenHash } = generateInviteToken();
    const expiresAt = invitationExpiryFrom(now);
    const nextCount = invitation.sendCount + 1;
    const updated = await withTransaction(async (tx) => {
      // CAS theo `sendCount` — hai lần gửi lại đồng thời chỉ một thắng.
      const claim = await tx.workspaceInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING", sendCount: invitation.sendCount },
        data: { tokenHash, expiresAt, lastSentAt: now, sendCount: { increment: 1 } },
      });
      if (claim.count === 0) return null;
      await this.addMailOutbox(tx, invitation.id, nextCount, token, "resent");
      return tx.workspaceInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    });
    if (!updated) throw new ConflictError("Lời mời vừa được thay đổi, hãy tải lại");
    await auditService.record({
      actorId: actor.id,
      action: "invitation.resend",
      targetType: "WorkspaceInvitation",
      targetId: invitation.id,
      workspaceId: workspace.id,
      metadata: { sendCount: nextCount },
    });
    return toInvitationDto({ ...invitation, tokenHash, expiresAt, lastSentAt: now, sendCount: nextCount });
  }

  // ── nội bộ ────────────────────────────────────────────────────────────────

  private async createOne(input: {
    workspace: WorkspaceBrief;
    actorId: string;
    email: string;
    normalizedEmail: string;
    role: InvitationRoleValue;
    guestChannelIds: string[];
    guestDays: number | null;
    message: string | null;
    invitee: UserBrief | null;
    now: Date;
  }): Promise<WorkspaceInvitation> {
    const { workspace, now } = input;
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = invitationExpiryFrom(now);
    const pendingKey = pendingKeyFor(workspace.id, input.normalizedEmail);

    try {
      const created = await withTransaction(async (tx) => {
        // Lời mời PENDING cũ đã quá hạn (chưa ai mở nên chưa được set EXPIRED) → đóng lại để giải phóng `pendingKey`.
        const stale = await tx.workspaceInvitation.findUnique({ where: { pendingKey } });
        if (stale && stale.status === "PENDING" && stale.expiresAt <= now) {
          await tx.workspaceInvitation.update({
            where: { id: stale.id },
            data: { status: "EXPIRED", pendingKey: doneKeyFor(stale.id) },
          });
        }

        const row = await tx.workspaceInvitation.create({
          data: {
            workspaceId: workspace.id,
            email: input.email,
            normalizedEmail: input.normalizedEmail,
            role: input.role,
            guestChannelIds: input.guestChannelIds,
            guestDays: input.guestDays,
            message: input.message,
            tokenHash,
            invitedBy: input.actorId,
            status: "PENDING",
            pendingKey,
            expiresAt,
            lastSentAt: now,
            sendCount: 1,
          },
        });
        await this.addMailOutbox(tx, row.id, 1, token, "created");

        // Đã có tài khoản với email ĐÃ XÁC MINH → thêm thông báo trong ứng dụng (người chưa xác minh chỉ nhận email).
        if (input.invitee?.emailVerified) {
          await notify(tx, {
            type: PHASE3_NOTIFICATION_TYPES.WORKSPACE_INVITED,
            actorId: input.actorId,
            scope: null,
            workspaceId: workspace.id,
            source: { type: "WorkspaceInvitation", id: `invitation:${row.id}` },
            refs: { invitationId: row.id, workspaceId: workspace.id, workspaceName: workspace.name, role: input.role },
            recipients: [{ userId: input.invitee.id }],
            dedupeKey: `workspace.invited:${row.id}`,
          });
        }
        return row;
      });
      return {
        id: created.id,
        workspaceId: created.workspaceId,
        email: created.email,
        normalizedEmail: created.normalizedEmail,
        role: input.role,
        guestChannelIds: created.guestChannelIds,
        guestDays: created.guestDays,
        message: created.message,
        tokenHash: created.tokenHash,
        invitedBy: created.invitedBy,
        status: "PENDING",
        pendingKey: created.pendingKey,
        expiresAt: created.expiresAt,
        lastSentAt: created.lastSentAt,
        sendCount: created.sendCount,
        acceptedBy: null,
        acceptedAt: null,
        revokedBy: null,
        revokedAt: null,
        createdAt: created.createdAt,
      };
    } catch (err) {
      // Bắt Ở NGOÀI transaction (tx đã hỏng sau P2002) — đã có lời mời PENDING cho email này.
      if (isUniqueViolation(err)) {
        throw new ConflictError("Đã có lời mời đang chờ cho email này — hãy gửi lại hoặc thu hồi lời mời cũ");
      }
      throw err;
    }
  }

  private async addMailOutbox(
    tx: Prisma.TransactionClient,
    invitationId: string,
    sendCount: number,
    token: string,
    event: InvitationMailPayload["event"]
  ): Promise<void> {
    const payload: InvitationMailPayload = { invitationId, sendCount, tokenSealed: sealInvitationToken(token), event };
    await outbox.add(tx, {
      type: `workspace-invitation.${event}`,
      aggregateType: "WorkspaceInvitation",
      aggregateId: invitationId,
      queue: "notifications",
      jobName: INVITATION_MAIL_JOB,
      dedupeKey: invitationMailKey(invitationId, sendCount),
      payload: { ...payload },
    });
  }

  private async classifySkip(
    workspaceId: string,
    normalizedEmail: string,
    invitee: UserBrief | null,
    now: Date
  ): Promise<InviteSkipReason | null> {
    if (invitee) {
      const membership = await this.memberships.findByWorkspaceAndUser(workspaceId, invitee.id);
      if (membership?.status === "ACTIVE") return "ALREADY_MEMBER";
      if (membership?.status === "BANNED") return "BANNED";
    }
    const pending = await this.invitations.findPendingFor(workspaceId, normalizedEmail);
    if (pending && pending.expiresAt > now) return "PENDING_EXISTS";
    return null;
  }

  private async assertNotMember(workspaceId: string, userId: string): Promise<void> {
    const membership = await this.memberships.findByWorkspaceAndUser(workspaceId, userId);
    if (membership?.status === "ACTIVE") {
      throw new AppError(ErrorMessages[ErrorCode.INV_011], 409, ErrorCode.INV_011);
    }
    if (membership?.status === "BANNED") {
      throw new AppError(ErrorMessages[ErrorCode.INV_004], 403, ErrorCode.INV_004);
    }
  }

  private async findInvitee(rawEmail: string, normalizedEmail: string): Promise<UserBrief | null> {
    const users = await this.invitations.findUsersByEmails([...new Set([rawEmail.trim(), normalizedEmail])]);
    return users.find((u) => normalizeEmail(u.email) === normalizedEmail) ?? null;
  }

  /** Kênh chỉ định: thuộc nhóm, còn hoạt động; kênh RIÊNG TƯ phải do chính người mời quản lý (`CH_013`). */
  private async assertDesignatableChannels(actor: AuthUser, workspaceId: string, channelIds: string[]): Promise<void> {
    const briefs = await this.invitations.listChannels(workspaceId, channelIds);
    const byId = new Map(briefs.map((c) => [c.id, c]));
    for (const channelId of channelIds) {
      const brief = byId.get(channelId);
      if (!brief) throw new ValidationError("Kênh chỉ định không thuộc nhóm này");
      if (brief.status !== "ACTIVE") throw new ValidationError("Kênh chỉ định đã được lưu trữ");
    }
    for (const brief of briefs) {
      if (brief.visibility === "PRIVATE" && !(await this.canManageChannel(actor, brief.id))) {
        throw new AppError(ErrorMessages[ErrorCode.CH_013], 403, ErrorCode.CH_013);
      }
    }
  }

  /** `LIMITS.invitation.perWorkspacePerDayMax` lời mời/nhóm/24 giờ (be.md §4 — tính theo LỜI MỜI, không theo request). */
  private async assertWithinDailyQuota(workspaceId: string, adding: number): Promise<void> {
    if (adding <= 0) return;
    const since = new Date(Date.now() - DAY_MS);
    const used = await this.invitations.countCreatedSince(workspaceId, since);
    if (used + adding > LIMITS.invitation.perWorkspacePerDayMax) {
      throw new ScopeRateLimitError(3600, ErrorCode.RATE_003);
    }
  }

  private async requireActiveWorkspace(workspaceId: string): Promise<WorkspaceBrief> {
    const workspace = await this.invitations.findWorkspace(workspaceId);
    if (!workspace) throw new NotFoundError();
    if (workspace.status === "ARCHIVED") throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);
    return workspace;
  }

  private guestDisabled(): AppError {
    return new AppError(ErrorMessages[ErrorCode.WS_018], 409, ErrorCode.WS_018);
  }

  /** OWNER/ADMIN của nhóm hoặc chính người mời (còn là thành viên ACTIVE); người ngoài → 404 trung tính. */
  private async requireManageable(actorId: string, invitationId: string): Promise<WorkspaceInvitation> {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation) throw new NotFoundError();
    const membership = await this.memberships.findByWorkspaceAndUser(invitation.workspaceId, actorId);
    if (!membership || membership.status !== "ACTIVE") throw new NotFoundError();
    const privileged = membership.role === "OWNER" || membership.role === "ADMIN";
    if (!privileged && invitation.invitedBy !== actorId) throw new NotFoundError();
    return invitation;
  }
}
