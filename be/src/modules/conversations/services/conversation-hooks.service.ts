import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService, invalidateSharesActiveWorkspaceCache, type ConversationHooks, type EnsureMeetingConversationInput, type SyncMeetingAttendeesInput } from "../../../core/permission";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";
import type { ISystemMessagePort } from "../../messages/public";
import { checkDirectEligibility } from "./eligibility.service";
import { buildDirectKey } from "./conversation-presenter";
import type { DirectConversationService } from "./direct-conversation.service";
import {
  invalidateConversationMetaCache,
  invalidateConversationMembersCache,
  listActiveMemberIds,
} from "../permission/conversation.scope-resolver";
import type { ConversationRoleValue } from "../entities/conversation.interface";

/**
 * `ConversationHooks` (core/permission/conversation-hooks.port.ts) — be.md
 * §5.9. Đăng ký qua `registerConversationHooks()` lúc `modules/conversations/index.ts#registerConversationModule()`
 * chạy (giống `registerChannelModule()`). Xem báo cáo cuối tác vụ p1-05 cho
 * từng hook CHƯA có nơi gọi thật (p1-01/p1-02/p1-08/p2-04 hoặc chưa build
 * xong, hoặc yêu cầu sửa module khác ngoài phạm vi "chỉ đụng messages/" của
 * tác vụ này) — implement ĐÚNG, chỉ chưa được kích hoạt tự động.
 */
export class ConversationHooksService implements ConversationHooks {
  constructor(
    private readonly directService: DirectConversationService,
    private readonly systemMessage: ISystemMessagePort
  ) {}

  /** be.md §5.2/§5.9 — dùng bởi `message-forward.service.ts` (p1-04) và (sau này) p2-01. */
  async getOrCreateDirect(meId: string, otherId: string): Promise<{ conversationId: string }> {
    const conversationId = await this.directService.getOrCreateDirectId(meId, otherId);
    return { conversationId };
  }

  /**
   * be.md §5.9/§3.3 — CHƯA có nơi gọi tự động (`modules/members/services/membership-lifecycle.service.ts`
   * chưa emit outbox event cho case này, và sửa module đó nằm NGOÀI phạm vi
   * "chỉ đụng `modules/messages/`" mà tác vụ này cho phép — xem báo cáo cuối
   * tác vụ). Job `jobs/workspace-member-removed.job.ts` đã đăng ký processor
   * sẵn sàng tiêu thụ payload `{workspaceId, userId}` ngay khi có nơi enqueue.
   */
  async onWorkspaceMemberRemoved(workspaceId: string, userId: string): Promise<void> {
    const groupMemberships = await prisma.conversationMember.findMany({
      where: { workspaceId, userId, status: "ACTIVE", kind: "GROUP" },
    });
    for (const membership of groupMemberships) {
      await this.removeGroupMemberBySystem(membership.conversationId, userId, membership.role);
    }

    const directMemberships = await prisma.conversationMember.findMany({
      where: { userId, status: "ACTIVE", kind: "DIRECT" },
      select: { conversationId: true, peerUserId: true },
    });
    for (const dm of directMemberships) {
      if (!dm.peerUserId) continue;
      await invalidateSharesActiveWorkspaceCache(userId, dm.peerUserId);
      await invalidateConversationMetaCache(dm.conversationId);
      const eligibility = await checkDirectEligibility(userId, dm.peerUserId);
      emitToUsers([userId, dm.peerUserId], SocketEvent.CONVERSATION_UPDATED, {
        id: dm.conversationId,
        readOnly: !eligibility.canMessage,
        readOnlyReason: eligibility.canMessage ? null : eligibility.reason === "BLOCKED" ? "BLOCKED" : "NO_SHARED_WORKSPACE",
      });
    }
  }

  /**
   * be.md §3.3/§5.9 — OWNER bị gỡ → chuyển ADMIN sớm nhất, không có → MEMBER sớm nhất, không còn ai → DISSOLVED.
   * (p6-03) Công khai để `adapters/conversation.port.impl.ts#removeMember` dùng lại — caller tự kiểm thành viên ACTIVE trước.
   */
  async removeGroupMemberBySystem(conversationId: string, userId: string, role: ConversationRoleValue): Promise<void> {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.status !== "ACTIVE") return;

    let newOwnerId: string | null = null;
    if (role === "OWNER") {
      const nextAdmin = await prisma.conversationMember.findFirst({
        where: { conversationId, status: "ACTIVE", role: "ADMIN", userId: { not: userId } },
        orderBy: { joinedAt: "asc" },
      });
      const nextMember =
        nextAdmin ??
        (await prisma.conversationMember.findFirst({
          where: { conversationId, status: "ACTIVE", role: "MEMBER", userId: { not: userId } },
          orderBy: { joinedAt: "asc" },
        }));
      newOwnerId = nextMember?.userId ?? null;
    }

    let dissolved = false;
    await withTransaction(async (tx) => {
      await tx.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { status: "REMOVED", leftAt: new Date() },
      });
      const updated = await tx.conversation.update({ where: { id: conversationId }, data: { memberCount: { decrement: 1 } } });

      if (updated.memberCount <= 0) {
        await tx.conversation.update({
          where: { id: conversationId },
          data: { status: "DISSOLVED", dissolvedAt: new Date(), dissolvedBy: null, dissolveReason: "WORKSPACE_MEMBER_REMOVED" },
        });
        dissolved = true;
      } else if (newOwnerId) {
        await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: newOwnerId } }, data: { role: "OWNER" } });
        await tx.conversation.update({ where: { id: conversationId }, data: { ownerId: newOwnerId } });
        await this.systemMessage.post(
          {
            scopeType: "CONVERSATION",
            scopeId: conversationId,
            workspaceId: conversation.workspaceId,
            systemType: "OWNER_TRANSFERRED",
            payload: { actorId: userId, fromUserId: userId, toUserId: newOwnerId },
            dedupeKey: `conv-owner-transferred:${conversationId}:system:${Date.now()}`,
          },
          tx
        );
      }

      // schema thật `MEMBER_REMOVED` (system-payload.schemas.ts) đòi
      // `actorId: objectIdSchema` KHÔNG nullable — khác pseudocode be.md
      // "actorId: null" cho actor hệ thống; dùng chính người bị gỡ làm actorId
      // (ngữ nghĩa: "rời do mất quyền workspace", không vi phạm schema thật).
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "MEMBER_REMOVED",
          payload: { actorId: userId, userIds: [userId] },
          dedupeKey: `conv-member-removed:${conversationId}:${userId}:system`,
        },
        tx
      );

      await outbox.add(tx, {
        type: "conversation.member-removed",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.member-removed:conversation:${conversationId}:${userId}:system`,
        payload: { event: "member-removed", conversationId, userId, reason: "WORKSPACE_REMOVED", dissolved },
      });
    });

    await invalidateConversationMetaCache(conversationId);
    await invalidateConversationMembersCache(conversationId);
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversationId });
    await permissionService.revokeScope({ scope: { type: "CONVERSATION", id: conversationId }, userIds: [userId], reason: "REMOVED" });
    emitToUsers([userId], SocketEvent.CONVERSATION_REMOVED, { conversationId, reason: "WORKSPACE_REMOVED" });
  }

  /**
   * be.md §5.9 — GROUP ACTIVE → ARCHIVED (read-only). CHƯA có nơi gọi tự
   * động (`modules/workspaces/services/workspace-lifecycle.service.ts` chưa
   * gọi hook này — sửa module đó nằm ngoài phạm vi cho phép của tác vụ này,
   * xem báo cáo cuối tác vụ).
   */
  async onWorkspaceArchived(workspaceId: string): Promise<void> {
    const groups = await prisma.conversation.findMany({ where: { workspaceId, kind: "GROUP", status: "ACTIVE" }, select: { id: true } });
    for (const g of groups) {
      await prisma.conversation.update({ where: { id: g.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
      await this.broadcastStatusChange(g.id, "ARCHIVED");
    }
  }

  /** be.md §5.9 — GROUP ARCHIVED (do workspace) → ACTIVE (không mở lại DISSOLVED). */
  async onWorkspaceRestored(workspaceId: string): Promise<void> {
    const groups = await prisma.conversation.findMany({
      where: { workspaceId, kind: "GROUP", status: "ARCHIVED" },
      select: { id: true },
    });
    for (const g of groups) {
      await prisma.conversation.update({ where: { id: g.id }, data: { status: "ACTIVE", archivedAt: null } });
      await this.broadcastStatusChange(g.id, "ACTIVE");
    }
  }

  private async broadcastStatusChange(conversationId: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
    await invalidateConversationMetaCache(conversationId);
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversationId });
    const memberIds = await listActiveMemberIds(conversationId);
    const payload = { id: conversationId, status };
    emitToRoom(ROOM.conversation(conversationId), SocketEvent.CONVERSATION_UPDATED, payload);
    emitToUsers(memberIds, SocketEvent.CONVERSATION_UPDATED, payload);
  }

  /** be.md §5.9 — idempotent theo `meetingKey`. CHƯA có nơi gọi (p2-04 chưa tồn tại) — implement đầy đủ, sẵn sàng khi p2-04 build. */
  async ensureMeetingConversation(input: EnsureMeetingConversationInput): Promise<{ conversationId: string }> {
    const meetingKey = `m:${input.meetingId}`;
    const existing = await prisma.conversation.findUnique({ where: { meetingKey } });
    if (existing) return { conversationId: existing.id };

    const activeRows = await prisma.workspaceMembership.findMany({
      where: { workspaceId: input.workspaceId, userId: { in: input.attendeeIds }, status: "ACTIVE" },
      select: { userId: true },
    });
    const activeSet = new Set(activeRows.map((r) => r.userId));
    const attendees = input.attendeeIds.filter((id) => activeSet.has(id) && id !== input.hostId);

    const newId = newObjectId();
    const title = (input.title.trim() || "Nhóm chat cuộc họp").slice(0, LIMITS.conversation.titleMax);
    const normalizedTitle = normalizeSearch(title);

    await withTransaction(async (tx) => {
      await tx.conversation.create({
        data: {
          id: newId,
          kind: "GROUP",
          workspaceId: input.workspaceId,
          meetingId: input.meetingId,
          meetingKey,
          directKey: `g:${newId}`,
          title,
          normalizedTitle,
          avatarAssetId: null,
          ownerId: input.hostId,
          createdBy: input.hostId,
          status: "ACTIVE",
          // be.md §5.9 — `settings.membersCanAdd=false` (thành viên do cuộc họp đồng bộ, không tự thêm).
          settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" },
          lastSeq: 0,
          lastMessageAt: null,
          lastMessageId: null,
          memberCount: attendees.length + 1,
          archivedAt: null,
          dissolvedAt: null,
          dissolvedBy: null,
          dissolveReason: null,
        },
      });
      await tx.conversationMember.create({
        data: {
          conversationId: newId,
          userId: input.hostId,
          kind: "GROUP",
          workspaceId: input.workspaceId,
          role: "OWNER",
          status: "ACTIVE",
          peerUserId: null,
          leftAt: null,
          addedBy: null,
          lastReadAt: null,
          notifyMode: "INHERIT",
          mutedUntil: null,
          pinnedAt: null,
          archivedAt: null,
          hiddenBeforeSeq: 0,
          searchText: normalizedTitle,
        },
      });
      if (attendees.length > 0) {
        await tx.conversationMember.createMany({
          data: attendees.map((userId) => ({
            conversationId: newId,
            userId,
            kind: "GROUP" as const,
            workspaceId: input.workspaceId,
            role: "MEMBER" as const,
            status: "ACTIVE" as const,
            peerUserId: null,
            leftAt: null,
            addedBy: input.hostId,
            lastReadAt: null,
            notifyMode: "INHERIT" as const,
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            searchText: normalizedTitle,
          })),
        });
      }
      await this.systemMessage.post(
        { scopeType: "CONVERSATION", scopeId: newId, workspaceId: input.workspaceId, systemType: "CONVERSATION_CREATED", payload: { actorId: input.hostId }, dedupeKey: `conv-created:${newId}` },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.created",
        aggregateType: "Conversation",
        aggregateId: newId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.created:conversation:${newId}:v1`,
        payload: { event: "created", conversationId: newId, memberIds: [input.hostId, ...attendees] },
      });
    });

    return { conversationId: newId };
  }

  /** be.md §5.9 — diff thêm/tái kích hoạt/xoá, co-host → ADMIN, host → OWNER, 1 tin hệ thống gộp/lần sync. */
  async syncMeetingAttendees(input: SyncMeetingAttendeesInput): Promise<void> {
    const conversation = await prisma.conversation.findUnique({ where: { meetingKey: `m:${input.meetingId}` } });
    if (!conversation) return; // `ensureMeetingConversation` chưa gọi — không có gì để đồng bộ

    const desiredRoles = new Map<string, ConversationRoleValue>();
    desiredRoles.set(input.hostId, "OWNER");
    for (const id of input.coHostIds) if (id !== input.hostId) desiredRoles.set(id, "ADMIN");
    for (const id of input.attendeeIds) if (!desiredRoles.has(id)) desiredRoles.set(id, "MEMBER");

    const currentMembers = await prisma.conversationMember.findMany({ where: { conversationId: conversation.id } });
    const currentByUser = new Map(currentMembers.map((m) => [m.userId, m]));

    const toAdd: string[] = [];
    const toReactivate: string[] = [];
    const toUpdateRole: Array<{ userId: string; role: ConversationRoleValue }> = [];
    for (const [userId, role] of desiredRoles) {
      const current = currentByUser.get(userId);
      if (!current) {
        toAdd.push(userId);
        continue;
      }
      if (current.status !== "ACTIVE") {
        toReactivate.push(userId);
      } else if (current.role !== role) {
        toUpdateRole.push({ userId, role });
      }
    }
    const toRemove = currentMembers.filter((m) => m.status === "ACTIVE" && !desiredRoles.has(m.userId)).map((m) => m.userId);

    await withTransaction(async (tx) => {
      if (toAdd.length > 0) {
        await tx.conversationMember.createMany({
          data: toAdd.map((userId) => ({
            conversationId: conversation.id,
            userId,
            kind: "GROUP" as const,
            workspaceId: conversation.workspaceId,
            role: desiredRoles.get(userId) as ConversationRoleValue,
            status: "ACTIVE" as const,
            peerUserId: null,
            leftAt: null,
            addedBy: input.hostId,
            lastReadAt: null,
            notifyMode: "INHERIT" as const,
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            searchText: conversation.normalizedTitle ?? "",
          })),
        });
      }
      for (const userId of toReactivate) {
        await tx.conversationMember.updateMany({
          where: { conversationId: conversation.id, userId },
          data: { status: "ACTIVE", role: desiredRoles.get(userId) as ConversationRoleValue, joinedAt: new Date(), leftAt: null, lastReadSeq: conversation.lastSeq, unreadCount: 0 },
        });
      }
      for (const { userId, role } of toUpdateRole) {
        await tx.conversationMember.updateMany({ where: { conversationId: conversation.id, userId, status: "ACTIVE" }, data: { role } });
      }
      if (toRemove.length > 0) {
        await tx.conversationMember.updateMany({ where: { conversationId: conversation.id, userId: { in: toRemove } }, data: { status: "REMOVED", leftAt: new Date() } });
      }
      await tx.conversation.update({ where: { id: conversation.id }, data: { ownerId: input.hostId } });

      const addedIds = [...toAdd, ...toReactivate];
      if (addedIds.length > 0) {
        await this.systemMessage.post(
          {
            scopeType: "CONVERSATION",
            scopeId: conversation.id,
            workspaceId: conversation.workspaceId,
            systemType: "MEMBER_ADDED",
            payload: { actorId: input.hostId, userIds: addedIds },
            dedupeKey: `conv-member-added:${conversation.id}:sync:${Date.now()}`,
          },
          tx
        );
      }
      if (toRemove.length > 0) {
        await this.systemMessage.post(
          {
            scopeType: "CONVERSATION",
            scopeId: conversation.id,
            workspaceId: conversation.workspaceId,
            systemType: "MEMBER_REMOVED",
            payload: { actorId: input.hostId, userIds: toRemove },
            dedupeKey: `conv-member-removed:${conversation.id}:sync:${Date.now()}`,
          },
          tx
        );
      }
    });

    const finalCount = await prisma.conversationMember.count({ where: { conversationId: conversation.id, status: "ACTIVE" } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { memberCount: finalCount } });

    await invalidateConversationMetaCache(conversation.id);
    await invalidateConversationMembersCache(conversation.id);
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversation.id });
    if (toRemove.length > 0) {
      await permissionService.revokeScope({ scope: { type: "CONVERSATION", id: conversation.id }, userIds: toRemove, reason: "REMOVED" });
    }
  }

  /** (p2-04) Cuộc họp huỷ/xoá → nhóm chat họp ACTIVE → ARCHIVED (chỉ đọc). Idempotent; không có nhóm chat / đã đóng → no-op. */
  async archiveMeetingConversation(meetingId: string): Promise<void> {
    const conversation = await prisma.conversation.findUnique({ where: { meetingKey: `m:${meetingId}` } });
    if (!conversation || conversation.status !== "ACTIVE") return;
    await prisma.conversation.update({ where: { id: conversation.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await this.broadcastStatusChange(conversation.id, "ARCHIVED");
  }

  /**
   * be.md §5.9 — gọi bởi `modules/blocks` (p1-08) SAU KHI trạng thái chặn giữa 2 người ĐỔI (chặn
   * HOẶC bỏ chặn): xoá cache eligibility, BUMP version quyền hội thoại DIRECT (resolver cache 60 s —
   * không bump thì người bị chặn vẫn gửi được tới hết TTL, BLOCK-01), rồi tính lại `readOnly` từ
   * `checkDirectEligibility` (đọc DB tươi) và phát `conversation:updated` tới 2 bên.
   */
  async onUserBlocked(userIdA: string, userIdB: string): Promise<void> {
    await invalidateSharesActiveWorkspaceCache(userIdA, userIdB);
    const directKey = buildDirectKey(userIdA, userIdB);
    const conversation = await prisma.conversation.findUnique({ where: { directKey } });
    if (!conversation) return;
    await invalidateConversationMetaCache(conversation.id);
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversation.id });
    const eligibility = await checkDirectEligibility(userIdA, userIdB);
    emitToUsers([userIdA, userIdB], SocketEvent.CONVERSATION_UPDATED, {
      id: conversation.id,
      readOnly: !eligibility.canMessage,
      readOnlyReason: eligibility.canMessage ? null : eligibility.reason === "BLOCKED" ? "BLOCKED" : "NO_SHARED_WORKSPACE",
    });
    // be.md §5.9 "outbox conversation.blocked (p2-01 kết thúc cuộc gọi DIRECT
    // đang diễn ra)" — p2-01 CHƯA tồn tại, KHÔNG thêm outbox row không có
    // consumer (mục 9 "critical facts", cùng lý do bỏ qua ở `group-conversation.service.ts#dissolve()`).
  }
}
