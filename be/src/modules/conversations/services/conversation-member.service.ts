import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { normalizeSearch } from "../../../core/utils/normalize";
import { AppError, ConflictError, NotFoundError, ScopeForbiddenError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import { avatarUrlOf } from "../../../shared/media";
import { getStates } from "../../presence/presence.service";
import type { ISystemMessagePort } from "../../messages/public";
import { assertNotBlockedByAny } from "./block-guard";
import { RANK, toDetail, buildLastMessagePreview } from "./conversation-presenter";
import { invalidateConversationMetaCache, invalidateConversationMembersCache } from "../permission/conversation.scope-resolver";
import type { AddMembersDto, ChangeRoleDto, ListMembersQueryDto } from "../dtos";
import type { Conversation, ConversationDetail, ConversationMember } from "../entities/conversation.interface";

export interface AddMembersResult {
  added: string[];
  skipped: Array<{ userId: string; reason: "ALREADY_MEMBER" | "NOT_WORKSPACE_MEMBER" | "BLOCKED" }>;
}

export interface MemberRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: Date;
  presence: string;
}

/** be.md §5.4 — thành viên: list/add/changeRole/remove/transfer/leave, bậc `rank()` từ `conversation-presenter.ts`. */
export class ConversationMemberService {
  constructor(private readonly systemMessage: ISystemMessagePort) {}

  async list(viewer: AuthUser, conversationId: string, query: ListMembersQueryDto): Promise<{ data: MemberRow[]; nextCursor: string | null }> {
    const rows = await prisma.conversationMember.findMany({
      where: { conversationId, status: "ACTIVE", ...(query.role && { role: query.role }) },
      take: query.limit + 1,
      skip: query.cursor ? Number(query.cursor) || 0 : 0,
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const users = await prisma.user.findMany({ where: { id: { in: page.map((r) => r.userId) } }, select: { id: true, name: true, avatarAssetId: true } });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    const avatarById = new Map(users.map((u) => [u.id, u.avatarAssetId]));
    const presenceMap = await getStates(viewer.id, page.map((r) => r.userId));

    // OWNER → ADMIN → tên (be.md §4) — Mongo không sort theo enum order tự nhiên, sort lại trong bộ nhớ.
    const roleOrder = { OWNER: 0, ADMIN: 1, MEMBER: 2 } as const;
    page.sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || (nameById.get(a.userId) ?? "").localeCompare(nameById.get(b.userId) ?? ""));

    const data = page.map((r) => ({
      userId: r.userId,
      name: nameById.get(r.userId) ?? "",
      avatarUrl: avatarUrlOf(avatarById.get(r.userId)),
      role: r.role,
      joinedAt: r.joinedAt,
      presence: presenceMap[r.userId]?.state ?? "OFFLINE",
    }));
    return { data, nextCursor: hasMore ? String((query.cursor ? Number(query.cursor) || 0 : 0) + query.limit) : null };
  }

  async add(actor: AuthUser, conversationId: string, dto: AddMembersDto): Promise<AddMembersResult> {
    const conversation = await this.requireGroup(conversationId);
    if (conversation.meetingId) throw new AppError(ErrorMessages[ErrorCode.CONV_012], 409, ErrorCode.CONV_012);
    if (conversation.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CONV_007], 409, ErrorCode.CONV_007);

    if (dto.role === "ADMIN") {
      const actorMember = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
      if (actorMember?.role !== "OWNER") throw new AppError(ErrorMessages[ErrorCode.CONV_006], 403, ErrorCode.CONV_006);
    }

    const uniqueUserIds = Array.from(new Set(dto.userIds));
    const [activeWsRows, existingMembers] = await Promise.all([
      prisma.workspaceMembership.findMany({
        where: { workspaceId: conversation.workspaceId as string, userId: { in: uniqueUserIds }, status: "ACTIVE" },
        select: { userId: true, role: true, expiresAt: true },
      }),
      prisma.conversationMember.findMany({ where: { conversationId, userId: { in: uniqueUserIds } } }),
    ]);
    // p3-04 (D-16): KHÁCH chỉ vào nhóm chat khi OWNER/ADMIN của nhóm chat thêm RÕ RÀNG VÀ nhóm bật `allowGuests` (mặc định tắt).
    const nowMs = Date.now();
    const liveRows = activeWsRows.filter((r) => !(r.role === "GUEST" && r.expiresAt && r.expiresAt.getTime() <= nowMs));
    const guestIds = liveRows.filter((r) => r.role === "GUEST").map((r) => r.userId);
    if (guestIds.length > 0) {
      if (!conversation.allowGuests) throw new AppError(ErrorMessages[ErrorCode.CONV_015], 403, ErrorCode.CONV_015);
      const actorRow = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
      if (actorRow?.role !== "OWNER" && actorRow?.role !== "ADMIN") {
        throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_006], ErrorCode.PERM_006);
      }
    }
    const activeWsSet = new Set(liveRows.map((r) => r.userId));
    const existingByUser = new Map(existingMembers.map((m) => [m.userId, m]));

    const skipped: AddMembersResult["skipped"] = [];
    const toAdd: string[] = [];
    const toReactivate: string[] = [];
    for (const userId of uniqueUserIds) {
      const existing = existingByUser.get(userId);
      if (existing?.status === "ACTIVE") {
        skipped.push({ userId, reason: "ALREADY_MEMBER" });
        continue;
      }
      if (!activeWsSet.has(userId)) {
        skipped.push({ userId, reason: "NOT_WORKSPACE_MEMBER" });
        continue;
      }
      if (existing) toReactivate.push(userId);
      else toAdd.push(userId);
    }

    const addedIds = [...toAdd, ...toReactivate];
    // p1-08 BLOCK_003 — người thêm bị target chặn → 403 trung tính cho cả lượt thêm (người thêm đã chặn target vẫn thêm được).
    await assertNotBlockedByAny(actor.id, addedIds);
    if (conversation.memberCount + addedIds.length > LIMITS.conversation.membersMax) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_004], 409, ErrorCode.CONV_004);
    }
    if (addedIds.length === 0) return { added: [], skipped };

    const searchText = normalizeSearch(conversation.title ?? "");
    await withTransaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.conversationMember.createMany({
          data: toAdd.map((userId) => ({
            conversationId,
            userId,
            kind: "GROUP" as const,
            workspaceId: conversation.workspaceId,
            role: dto.role,
            status: "ACTIVE" as const,
            peerUserId: null,
            leftAt: null,
            addedBy: actor.id,
            lastReadAt: null,
            notifyMode: "INHERIT" as const,
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            searchText,
          })),
        });
      }
      for (const userId of toReactivate) {
        // Người LEFT/REMOVED trước đó tái kích hoạt thấy TOÀN BỘ lịch sử như
        // thành viên mới (be.md §5.4 "chốt") — `lastReadSeq = conversation.lastSeq`.
        await tx.conversationMember.updateMany({
          where: { conversationId, userId },
          data: {
            status: "ACTIVE",
            role: dto.role,
            joinedAt: new Date(),
            leftAt: null,
            addedBy: actor.id,
            lastReadSeq: conversation.lastSeq,
            unreadCount: 0,
            mentionsSinceRead: 0,
            hiddenBeforeSeq: 0,
            markedUnread: false,
            archivedAt: null,
          },
        });
      }
      await tx.conversation.update({ where: { id: conversationId }, data: { memberCount: { increment: addedIds.length } } });
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "MEMBER_ADDED",
          payload: { actorId: actor.id, userIds: addedIds },
          dedupeKey: `conv-member-added:${conversationId}:${Date.now()}`,
        },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.member-added",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.member-added:conversation:${conversationId}:${Date.now()}`,
        payload: { event: "member-added", conversationId, userIds: addedIds },
      });
    });

    await this.afterMembershipChange(conversationId);
    return { added: addedIds, skipped };
  }

  async changeRole(actor: AuthUser, conversationId: string, targetUserId: string, dto: ChangeRoleDto): Promise<MemberRow> {
    const conversation = await this.requireGroup(conversationId);
    if (conversation.meetingId) throw new AppError(ErrorMessages[ErrorCode.CONV_012], 409, ErrorCode.CONV_012);
    const target = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: targetUserId } } });
    if (!target || target.status !== "ACTIVE") throw new NotFoundError();
    if (target.role === "OWNER") throw new AppError(ErrorMessages[ErrorCode.CONV_006], 403, ErrorCode.CONV_006);
    if (target.role === dto.role) {
      const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true, avatarAssetId: true } });
      return { userId: targetUserId, name: user?.name ?? "", avatarUrl: avatarUrlOf(user?.avatarAssetId), role: target.role, joinedAt: target.joinedAt, presence: "OFFLINE" };
    }

    await withTransaction(async (tx) => {
      await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: targetUserId } }, data: { role: dto.role } });
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "ROLE_CHANGED",
          payload: { actorId: actor.id, userId: targetUserId, from: target.role, to: dto.role },
          dedupeKey: `conv-role-changed:${conversationId}:${targetUserId}:${Date.now()}`,
        },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.updated",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.role-changed:conversation:${conversationId}:${targetUserId}:${Date.now()}`,
        payload: { event: "member-role-changed", conversationId, userId: targetUserId, role: dto.role },
      });
    });

    await this.afterMembershipChange(conversationId);
    const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true, avatarAssetId: true } });
    return { userId: targetUserId, name: user?.name ?? "", avatarUrl: avatarUrlOf(user?.avatarAssetId), role: dto.role, joinedAt: target.joinedAt, presence: "OFFLINE" };
  }

  async remove(actor: AuthUser, conversationId: string, targetUserId: string): Promise<{ userId: string; status: "REMOVED" }> {
    const conversation = await this.requireGroup(conversationId);
    if (conversation.meetingId) throw new AppError(ErrorMessages[ErrorCode.CONV_012], 409, ErrorCode.CONV_012);

    const [actorMember, target] = await Promise.all([
      prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } }),
      prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: targetUserId } } }),
    ]);
    if (!target || target.status !== "ACTIVE") throw new NotFoundError();
    // be.md §5.4 rank — OWNER xoá mọi người trừ mình; ADMIN chỉ MEMBER; target OWNER → CONV_006.
    if (!actorMember || RANK[target.role] >= RANK[actorMember.role]) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_006], 403, ErrorCode.CONV_006);
    }

    await withTransaction(async (tx) => {
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: targetUserId } },
        data: { status: "REMOVED", leftAt: new Date() },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { memberCount: { decrement: 1 } } });
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "MEMBER_REMOVED",
          payload: { actorId: actor.id, userIds: [targetUserId] },
          dedupeKey: `conv-member-removed:${conversationId}:${targetUserId}:${Date.now()}`,
        },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.member-removed",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.member-removed:conversation:${conversationId}:${targetUserId}:${Date.now()}`,
        payload: { event: "member-removed", conversationId, userId: targetUserId, reason: "REMOVED" },
      });
    });

    await this.afterMembershipChange(conversationId);
    await permissionService.revokeScope({ scope: { type: "CONVERSATION", id: conversationId }, userIds: [targetUserId], reason: "REMOVED" });
    emitToUsers([targetUserId], SocketEvent.CONVERSATION_REMOVED, { conversationId, reason: "REMOVED" });
    return { userId: targetUserId, status: "REMOVED" };
  }

  async transfer(actor: AuthUser, conversationId: string, toUserId: string): Promise<ConversationDetail> {
    const conversation = await this.requireGroup(conversationId);
    if (toUserId === actor.id) throw new ConflictError("Không thể tự chuyển chủ cho chính mình");
    const target = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: toUserId } } });
    if (!target || target.status !== "ACTIVE") throw new NotFoundError();

    await withTransaction(async (tx) => {
      // be.md §5.4 — điều kiện `role: OWNER` trong updateMany của "me" đảm bảo
      // 2 lần transfer đồng thời chỉ 1 lần thành công (CAS).
      const meResult = await tx.conversationMember.updateMany({
        where: { conversationId, userId: actor.id, role: "OWNER" },
        data: { role: "ADMIN" },
      });
      if (meResult.count === 0) throw new AppError(ErrorMessages[ErrorCode.CONV_006], 403, ErrorCode.CONV_006);
      await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: toUserId } }, data: { role: "OWNER" } });
      await tx.conversation.update({ where: { id: conversationId }, data: { ownerId: toUserId, version: { increment: 1 } } });
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "OWNER_TRANSFERRED",
          payload: { actorId: actor.id, fromUserId: actor.id, toUserId },
          dedupeKey: `conv-owner-transferred:${conversationId}:${Date.now()}`,
        },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.updated",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.owner-transferred:conversation:${conversationId}:${Date.now()}`,
        payload: { event: "owner-transferred", conversationId, toUserId },
      });
    });

    await this.afterMembershipChange(conversationId);
    const updated = await prisma.conversation.findUnique({ where: { id: conversationId } });
    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
    if (!updated || !member) throw new NotFoundError();
    const lastMessage = await buildLastMessagePreview(conversationId, actor.id, member.hiddenBeforeSeq);
    return toDetail({
      conversation: updated as unknown as Conversation,
      member: member as unknown as ConversationMember,
      peer: null,
      lastMessage,
      eligibility: null,
      peerLastReadSeq: null,
      peerReadAt: null,
    });
  }

  async leave(actor: AuthUser, conversationId: string): Promise<{ status: "LEFT"; conversationStatus: string }> {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundError();
    if (conversation.kind === "DIRECT") throw new AppError(ErrorMessages[ErrorCode.CONV_008], 400, ErrorCode.CONV_008);

    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
    if (!member || member.status !== "ACTIVE") throw new NotFoundError();
    if (member.role === "OWNER" && conversation.memberCount > 1) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_005], 409, ErrorCode.CONV_005);
    }

    let finalStatus: "ACTIVE" | "DISSOLVED" = "ACTIVE";
    await withTransaction(async (tx) => {
      await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: actor.id } }, data: { status: "LEFT", leftAt: new Date() } });
      const remaining = await tx.conversation.update({ where: { id: conversationId }, data: { memberCount: { decrement: 1 } } });
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "MEMBER_LEFT",
          payload: { userId: actor.id },
          dedupeKey: `conv-member-left:${conversationId}:${actor.id}:${Date.now()}`,
        },
        tx
      );
      if (remaining.memberCount <= 0) {
        await tx.conversation.update({ where: { id: conversationId }, data: { status: "DISSOLVED", dissolvedAt: new Date(), dissolvedBy: actor.id, dissolveReason: "LAST_MEMBER_LEFT" } });
        finalStatus = "DISSOLVED";
      }
      await outbox.add(tx, {
        type: "conversation.member-removed",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.member-left:conversation:${conversationId}:${actor.id}:${Date.now()}`,
        payload: { event: "member-removed", conversationId, userId: actor.id, reason: "LEFT", dissolved: finalStatus === "DISSOLVED" },
      });
    });

    await this.afterMembershipChange(conversationId);
    await permissionService.revokeScope({ scope: { type: "CONVERSATION", id: conversationId }, userIds: [actor.id], reason: "LEFT" });
    emitToUsers([actor.id], SocketEvent.CONVERSATION_REMOVED, { conversationId, reason: "LEFT" });
    return { status: "LEFT", conversationStatus: finalStatus };
  }

  private async requireGroup(conversationId: string): Promise<Conversation> {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.kind !== "GROUP") throw new NotFoundError();
    return conversation as unknown as Conversation;
  }

  private async afterMembershipChange(conversationId: string): Promise<void> {
    await invalidateConversationMetaCache(conversationId);
    await invalidateConversationMembersCache(conversationId);
    // item 3 "critical facts" — bumpVersion CHẠY SAU KHI transaction đã commit.
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversationId });
  }
}
