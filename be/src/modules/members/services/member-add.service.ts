import { Prisma } from "@prisma/client";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { ROOM } from "../../../infrastructure/socket";
import { joinRooms } from "../../../infrastructure/socket/socket.emit";
import { permissionService } from "../../../core/permission";
import { LIMITS } from "../../../core/constants/limits";
import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { AppError, NotFoundError, ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { classifyContactQuery } from "../../../core/utils/contact-query";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { BlockPort } from "../../../shared/ports/block.port";
import type { ChannelBootstrapPort } from "../../../shared/ports/channel-bootstrap.port";
import type { ContactMatch, UserContactLookupPort } from "../../../shared/ports/user-contact-lookup.port";
import { AuditService } from "../../audit-log/audit-log.service";
import { notify } from "../../notifications/public";
import type { IInvitationRepository, WorkspaceBrief } from "../repositories/invitation.repository.interface";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import "./access-notification-types";

const auditService = new AuditService();

/** `AVAILABLE` = thêm được ngay; `BANNED` = đang bị chặn khỏi nhóm (phải bỏ chặn trước). */
export type MemberLookupState = "AVAILABLE" | "ALREADY_MEMBER" | "BANNED";

export interface MemberLookupItem extends ContactMatch {
  state: MemberLookupState;
}

export interface AddMemberResult {
  userId: string;
  /** `ADDED` (201) hoặc `ALREADY_MEMBER` (200, idempotent — không đổi gì). */
  state: "ADDED" | "ALREADY_MEMBER";
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Tra người theo email/SĐT rồi THÊM THẲNG vào nhóm làm việc (OWNER/ADMIN). Đường dành cho trường hợp lời mời email không hoàn tất
 * được (người nhận chưa xác minh email — `INV_008`) hoặc quản trị viên đã biết số điện thoại của người cần thêm.
 *
 * Luật: chỉ tra KHỚP CHÍNH XÁC (cổng `UserContactLookupPort`); người đã chặn/bị chặn với người thêm coi như không tồn tại (trung tính);
 * người thêm KHÔNG thấy email/SĐT đầy đủ, chỉ gợi ý che. Thêm xong người đó nhận thông báo hộp thư `workspace.member-added`.
 */
export class MemberAddService {
  constructor(
    private readonly memberships: IMembershipRepository,
    private readonly invitations: IInvitationRepository,
    private readonly contacts: UserContactLookupPort,
    private readonly channelBootstrap: ChannelBootstrapPort,
    private readonly blocks: Pick<BlockPort, "isBlockedEitherWay">
  ) {}

  /** `GET /workspaces/:id/member-lookup?q=` — `q` phải là email đầy đủ hoặc SĐT hợp lệ, ngược lại 400 `VAL_001`. */
  async lookup(actor: AuthUser, workspaceId: string, rawQuery: string): Promise<MemberLookupItem[]> {
    const query = classifyContactQuery(rawQuery);
    if (query.kind === "TEXT") throw new ValidationError("Nhập đầy đủ email hoặc số điện thoại của người cần thêm");
    await this.requireActiveWorkspace(workspaceId);

    const matches = await this.contacts.findByContact(query, actor.id);
    const items: MemberLookupItem[] = [];
    for (const match of matches) {
      if (await this.blocks.isBlockedEitherWay(actor.id, match.userId)) continue;
      const membership = await this.memberships.findByWorkspaceAndUser(workspaceId, match.userId);
      const state: MemberLookupState =
        membership?.status === "ACTIVE" ? "ALREADY_MEMBER" : membership?.status === "BANNED" ? "BANNED" : "AVAILABLE";
      items.push({ ...match, state });
    }
    return items;
  }

  /** `POST /workspaces/:id/members` — idempotent: đã là thành viên → `ALREADY_MEMBER`. Vai trò luôn `MEMBER` (khách đi qua lời mời riêng). */
  async add(actor: AuthUser, workspaceId: string, targetUserId: string, retried = false): Promise<AddMemberResult> {
    const workspace = await this.requireActiveWorkspace(workspaceId);
    const target = await this.contacts.findActiveUser(targetUserId);
    if (!target) throw new NotFoundError();

    const existing = await this.memberships.findByWorkspaceAndUser(workspaceId, targetUserId);
    if (existing?.status === "ACTIVE") return { userId: targetUserId, state: "ALREADY_MEMBER" };
    if (existing?.status === "BANNED") {
      throw new AppError("Người này đang bị chặn khỏi nhóm — hãy bỏ chặn trước khi thêm", 403, ErrorCode.INV_004);
    }
    if (await this.blocks.isBlockedEitherWay(actor.id, targetUserId)) {
      throw new AppError(ErrorMessages[ErrorCode.BLOCK_003], 403, ErrorCode.BLOCK_003);
    }
    if ((await this.memberships.countActiveByUser(targetUserId)) >= LIMITS.workspace.perUserMax) {
      throw new AppError("Người này đã tham gia số nhóm tối đa", 409, ErrorCode.WS_006);
    }

    let added: boolean;
    try {
      added = await withTransaction((tx) => this.addInTx(tx, actor.id, workspace, targetUserId));
    } catch (err) {
      // Đua với một đường thêm/vào nhóm khác cùng tạo membership mới → P2002 (tx đã hỏng): chạy lại NGOÀI transaction,
      // lần sau thấy membership ACTIVE và trả `ALREADY_MEMBER`. Chỉ thử lại MỘT lần (P2002 vì lý do khác thì báo lỗi thật, không lặp vô hạn).
      if (isUniqueViolation(err) && !retried) return this.add(actor, workspaceId, targetUserId, true);
      throw err;
    }
    // Thua cuộc đua (người khác vừa thêm xong): không có hiệu ứng phụ nào để làm — trả kết quả idempotent.
    if (!added) return { userId: targetUserId, state: "ALREADY_MEMBER" };

    await permissionService.bumpVersion({ type: "WORKSPACE", id: workspaceId });
    joinRooms([targetUserId], [ROOM.workspace(workspaceId)]);
    await auditService.record({
      actorId: actor.id,
      action: "member.add",
      targetType: "WorkspaceMembership",
      targetId: `${workspaceId}:${targetUserId}`,
      workspaceId,
      metadata: { via: "CONTACT_LOOKUP" },
    });
    return { userId: targetUserId, state: "ADDED" };
  }

  /**
   * Trả `true` khi CHÍNH lượt này biến người đó thành thành viên (đã ghi kênh mặc định/đếm/outbox/thông báo), `false` khi họ đã ACTIVE.
   *
   * ⚠ IDEMPOTENT theo trạng thái hàng membership, không theo "chạy lần đầu": `withTransaction` tự chạy lại toàn bộ hàm này khi gặp
   * write-conflict (`P2034`), và lượt thua cuộc đua sẽ thấy hàng đã ACTIVE — nếu cứ `upsert` rồi cộng `memberCount` thì đếm/thông báo bị
   * nhân đôi. Vì vậy CHIẾM hàng bằng `updateMany` có điều kiện (chưa ACTIVE/BANNED) rồi mới ghi hiệu ứng phụ.
   */
  private async addInTx(tx: Prisma.TransactionClient, actorId: string, workspace: WorkspaceBrief, userId: string): Promise<boolean> {
    const now = new Date();
    // Bộ trường ghi đè mọi trạng thái cũ chưa ACTIVE (LEFT / REMOVED / PENDING chờ duyệt / khách đã hết hạn) — cùng bộ trường với nhánh
    // chấp nhận lời mời (`InvitationAcceptService`) để hàng membership luôn sạch (không sót hạn khách/lý do rời cũ).
    const shared = {
      role: "MEMBER" as const,
      status: "ACTIVE" as const,
      joinedAt: now,
      leftAt: null,
      leftReason: null,
      removedBy: null,
      banReason: null,
      expiresAt: null,
      invitedBy: actorId,
      requestMessage: null,
      requestedAt: null,
      decidedBy: actorId,
      decidedAt: now,
    };
    const claimed = await tx.workspaceMembership.updateMany({
      where: { workspaceId: workspace.id, userId, status: { notIn: ["ACTIVE", "BANNED"] } },
      data: shared,
    });
    if (claimed.count === 0) {
      const current = await tx.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } } });
      if (current?.status === "ACTIVE") return false;
      if (current?.status === "BANNED") {
        throw new AppError("Người này đang bị chặn khỏi nhóm — hãy bỏ chặn trước khi thêm", 403, ErrorCode.INV_004);
      }
      // Chưa từng có hàng: tạo mới. Hai lượt cùng tạo → lượt sau P2002 (tx hỏng) → `add()` chạy lại NGOÀI transaction và thấy ACTIVE.
      await tx.workspaceMembership.create({ data: { workspaceId: workspace.id, userId, expiryVersion: 0, ...shared } });
    }
    if (workspace.defaultChannelId) await this.channelBootstrap.joinDefault(tx, workspace.defaultChannelId, userId);
    await tx.workspace.update({ where: { id: workspace.id }, data: { memberCount: { increment: 1 }, lastActivityAt: now } });

    await outbox.add(tx, {
      type: "membership.joined",
      aggregateType: "WorkspaceMembership",
      aggregateId: `${workspace.id}:${userId}`,
      queue: "notifications",
      jobName: "membership.events",
      dedupeKey: `membership.joined:${workspace.id}:${userId}:added:${now.getTime()}`,
      payload: { event: "joined", workspaceId: workspace.id, userId, role: "MEMBER", via: "DIRECT_ADD" },
    });
    await notify(tx, {
      type: PHASE3_NOTIFICATION_TYPES.MEMBER_ADDED,
      actorId,
      scope: { type: "WORKSPACE", id: workspace.id },
      workspaceId: workspace.id,
      source: { type: "WorkspaceMembership", id: `member-added:${workspace.id}:${userId}:${now.getTime()}` },
      refs: { workspaceId: workspace.id, workspaceName: workspace.name },
      recipients: [{ userId }],
      dedupeKey: `workspace.member-added:${workspace.id}:${userId}:${now.getTime()}`,
    });
    return true;
  }

  private async requireActiveWorkspace(workspaceId: string): Promise<WorkspaceBrief> {
    const workspace = await this.invitations.findWorkspace(workspaceId);
    if (!workspace) throw new NotFoundError();
    if (workspace.status === "ARCHIVED") throw new AppError(ErrorMessages[ErrorCode.WS_002], 409, ErrorCode.WS_002);
    return workspace;
  }
}
