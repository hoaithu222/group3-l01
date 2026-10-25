import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";
import type { ISystemMessagePort } from "../../messages/public";
import type {
  ConversationPort,
  CreateGroupConversationInput,
  CreateGroupConversationResult,
} from "../../../shared/ports/conversation-group.port";
import type { ConversationHooksService } from "../services/conversation-hooks.service";

/** Khoá idempotent lưu ở `Conversation.meetingKey` (unique, không null-trùng) — tiền tố `x:` KHÔNG trùng `m:<meetingId>`/`none:<id>`. */
export const externalGroupKey = (dedupeKey: string): string => `x:${dedupeKey}`;

const memberRow = (conversationId: string, workspaceId: string, userId: string, role: "OWNER" | "MEMBER", addedBy: string | null, searchText: string) => ({
  conversationId,
  userId,
  kind: "GROUP" as const,
  workspaceId,
  role,
  status: "ACTIVE" as const,
  peerUserId: null,
  leftAt: null,
  addedBy,
  lastReadAt: null,
  notifyMode: "INHERIT" as const,
  mutedUntil: null,
  pinnedAt: null,
  archivedAt: null,
  hiddenBeforeSeq: 0,
  searchText,
});

/**
 * `ConversationPort` (p6-03) — nhóm chat theo MỤC ĐÍCH do module khác tạo (mentor: "Cố vấn · <bài>"), cùng dạng dữ liệu với
 * `GroupConversationService.create` / `ensureMeetingConversation` (tin hệ thống + outbox `conversation.created`), khác ở chỗ cho
 * phép KHÁCH được chỉ định rõ (`allowGuests=true`, D-16 p3-04). Idempotent theo `meetingKey = x:<dedupeKey>`.
 */
export class ConversationPortImpl implements ConversationPort {
  constructor(
    private readonly systemMessage: ISystemMessagePort,
    private readonly hooks: Pick<ConversationHooksService, "removeGroupMemberBySystem">
  ) {}

  async createGroup(input: CreateGroupConversationInput): Promise<CreateGroupConversationResult> {
    const meetingKey = externalGroupKey(input.dedupeKey);
    const existing = await prisma.conversation.findUnique({ where: { meetingKey } });
    if (existing) return { conversationId: existing.id, created: false, memberIds: await this.activeMemberIds(existing.id) };

    const candidates = [...new Set([input.ownerId, ...input.memberIds, ...input.guestIds])];
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId: input.workspaceId, userId: { in: candidates }, status: "ACTIVE" },
      select: { userId: true, role: true, expiresAt: true },
    });
    const now = Date.now();
    const regular = new Set(rows.filter((r) => r.role !== "GUEST").map((r) => r.userId));
    const guestOk = new Set(rows.filter((r) => r.role === "GUEST" && (!r.expiresAt || r.expiresAt.getTime() > now)).map((r) => r.userId));

    const ownerId = regular.has(input.ownerId) ? input.ownerId : input.memberIds.find((id) => regular.has(id));
    if (!ownerId) throw new Error("[conversation.port] Không còn thành viên hợp lệ làm chủ nhóm chat");
    const members = [...new Set(input.memberIds)].filter((id) => id !== ownerId && regular.has(id));
    const guests = [...new Set(input.guestIds)].filter((id) => guestOk.has(id) && id !== ownerId);
    const all = [ownerId, ...members, ...guests].slice(0, LIMITS.conversation.membersMax);

    const id = newObjectId();
    const title = input.title.trim().slice(0, LIMITS.conversation.titleMax);
    const normalizedTitle = normalizeSearch(title);
    await withTransaction(async (tx) => {
      await tx.conversation.create({
        data: {
          id,
          kind: "GROUP",
          workspaceId: input.workspaceId,
          meetingId: null,
          meetingKey,
          directKey: `g:${id}`,
          title,
          normalizedTitle,
          avatarAssetId: null,
          ownerId,
          createdBy: ownerId,
          status: "ACTIVE",
          settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" },
          allowGuests: guests.length > 0,
          lastSeq: 0,
          lastMessageAt: null,
          lastMessageId: null,
          memberCount: all.length,
          archivedAt: null,
          dissolvedAt: null,
          dissolvedBy: null,
          dissolveReason: null,
        },
      });
      await tx.conversationMember.createMany({
        data: all.map((userId) => memberRow(id, input.workspaceId, userId, userId === ownerId ? "OWNER" : "MEMBER", userId === ownerId ? null : ownerId, normalizedTitle)),
      });
      const post = (systemType: "CONVERSATION_CREATED" | "MEMBER_ADDED", payload: Record<string, unknown>, key: string) =>
        this.systemMessage.post({ scopeType: "CONVERSATION", scopeId: id, workspaceId: input.workspaceId, systemType, payload, dedupeKey: key }, tx);
      await post("CONVERSATION_CREATED", { actorId: ownerId }, `conv-created:${id}`);
      if (members.length > 0) await post("MEMBER_ADDED", { actorId: ownerId, userIds: members }, `conv-member-added:${id}:create`);
      await outbox.add(tx, {
        type: "conversation.created",
        aggregateType: "Conversation",
        aggregateId: id,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.created:conversation:${id}:v1`,
        payload: { event: "created", conversationId: id, memberIds: all },
      });
    });
    return { conversationId: id, created: true, memberIds: all };
  }

  async removeMember(conversationId: string, userId: string): Promise<void> {
    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
    if (!member || member.status !== "ACTIVE" || member.kind !== "GROUP") return;
    await this.hooks.removeGroupMemberBySystem(conversationId, userId, member.role);
  }

  private async activeMemberIds(conversationId: string): Promise<string[]> {
    const rows = await prisma.conversationMember.findMany({ where: { conversationId, status: "ACTIVE" }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
}
