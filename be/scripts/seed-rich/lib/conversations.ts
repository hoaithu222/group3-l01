import { normalizeSearch } from "../../../src/core/utils/normalize";
import { newObjectId } from "../../../src/core/utils/object-id";
import { buildDirectKey } from "../../../src/modules/conversations/services/conversation-presenter";
import type { DmSpec, GroupChatSpec, PersonKey } from "../types";
import { DAY_MS, Directory, prisma, rngFrom } from "./core";
import { postScript, postSystemMessage, type PostedMessage, type ScopeRef } from "./messages";
import type { WorkspaceCtx } from "./workspace";

export interface SeededConversation {
  id: string;
  title: string;
  kind: "DIRECT" | "GROUP";
  posted: PostedMessage[];
  unreadForThu: number;
}

const THU = "thu";

/** Tin cuối của người khác sau mốc đọc: tìm `lastReadSeq` để đúng `unread` tin người khác chưa đọc. */
function readMarkerFor(posted: readonly PostedMessage[], viewer: PersonKey, unread: number): { lastReadSeq: number; unreadCount: number; mentions: number } {
  const lastSeq = Math.max(0, ...posted.map((p) => p.seq));
  if (unread <= 0) return { lastReadSeq: lastSeq, unreadCount: 0, mentions: 0 };
  const others = posted.filter((p) => p.by !== viewer).sort((a, b) => b.seq - a.seq);
  const unreadMsgs = others.slice(0, unread);
  const oldest = unreadMsgs[unreadMsgs.length - 1];
  return {
    lastReadSeq: oldest ? oldest.seq - 1 : lastSeq,
    unreadCount: unreadMsgs.length,
    mentions: unreadMsgs.filter((p) => p.mentionKeys.includes(viewer)).length,
  };
}

/** Hội thoại 1-1 của `thu` với từng người (mỗi cặp một hội thoại, tra theo `directKey`). */
export async function seedDirectMessages(dir: Directory, dms: readonly DmSpec[], now: Date): Promise<SeededConversation[]> {
  const out: SeededConversation[] = [];
  for (const dm of dms) {
    const thuId = dir.id(THU);
    const peerId = dir.id(dm.peer);
    const directKey = buildDirectKey(thuId, peerId);
    const rng = rngFrom(`dm:${dm.peer}`);
    const startedAt = new Date(now.getTime() - Math.floor((4 + rng() * 6) * DAY_MS));

    let conv = await prisma.conversation.findUnique({ where: { directKey } });
    if (!conv) {
      const id = newObjectId();
      conv = await prisma.conversation.create({
        data: {
          id,
          kind: "DIRECT",
          workspaceId: null,
          meetingId: null,
          meetingKey: `none:${id}`,
          directKey,
          title: null,
          avatarAssetId: null,
          ownerId: null,
          createdBy: thuId,
          status: "ACTIVE",
          settings: { membersCanAdd: false, memberCanPin: true, mentionAllRole: "ADMIN" },
          lastSeq: 0,
          lastMessageAt: null,
          lastMessageId: null,
          activityAt: startedAt,
          memberCount: 2,
          archivedAt: null,
          dissolvedAt: null,
          dissolvedBy: null,
          dissolveReason: null,
          createdAt: startedAt,
        },
      });
      for (const [userId, peerOf, otherKey] of [[thuId, peerId, dm.peer], [peerId, thuId, THU]] as const) {
        await prisma.conversationMember.create({
          data: {
            conversationId: id,
            userId,
            kind: "DIRECT",
            workspaceId: null,
            role: "MEMBER",
            status: "ACTIVE",
            peerUserId: peerOf,
            joinedAt: startedAt,
            leftAt: null,
            addedBy: null,
            lastReadAt: null,
            notifyMode: "INHERIT",
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            activityAt: startedAt,
            searchText: normalizeSearch(dir.name(otherKey)),
          },
        });
      }
    }

    const scope: ScopeRef = { type: "CONVERSATION", id: conv.id, workspaceId: null };
    const last = await prisma.message.findFirst({ where: { scopeType: "CONVERSATION", scopeId: conv.id, threadKey: "root" }, orderBy: { seq: "desc" }, select: { createdAt: true } });
    const from = new Date(Math.max(startedAt.getTime() + 3_600_000, (last?.createdAt.getTime() ?? 0) + 60_000));
    const tailGap = rng() < 0.5 ? rng() * 4 * 3_600_000 : rng() * 2 * DAY_MS;
    const posted = await postScript({ dir, scope, baseKey: `dm:${dm.peer}`, lines: dm.lines, from, to: new Date(now.getTime() - tailGap - 600_000), now });
    await finishConversation(dir, conv.id, posted, [{ key: THU, unread: dm.unreadForThu ?? 0, pinned: Boolean(dm.pinned) }, { key: dm.peer, unread: 0, pinned: false }]);
    out.push({ id: conv.id, title: dir.name(dm.peer), kind: "DIRECT", posted, unreadForThu: dm.unreadForThu ?? 0 });
  }
  return out;
}

/** Nhóm chat gắn với nhóm làm việc (conversation GROUP có `workspaceId`). Tra theo (chủ, tiêu đề chuẩn hoá, nhóm làm việc). */
export async function seedGroupChats(
  dir: Directory,
  chats: readonly GroupChatSpec[],
  workspaces: ReadonlyMap<string, WorkspaceCtx>,
  now: Date
): Promise<SeededConversation[]> {
  const out: SeededConversation[] = [];
  for (const chat of chats) {
    const ws = workspaces.get(chat.workspace);
    if (!ws) throw new Error(`Nhóm chat "${chat.title}": không có nhóm làm việc "${chat.workspace}"`);
    const ownerId = dir.id(chat.owner);
    const normalizedTitle = normalizeSearch(chat.title);
    const rng = rngFrom(`group:${chat.workspace}:${normalizedTitle}`);
    const startedAt = new Date(now.getTime() - Math.floor((3 + rng() * 6) * DAY_MS));
    const memberKeys = [chat.owner, ...chat.members];
    for (const key of memberKeys) {
      if (!ws.roles.has(key)) throw new Error(`Nhóm chat "${chat.title}": "${key}" không thuộc nhóm làm việc "${chat.workspace}"`);
    }

    let conv = await prisma.conversation.findFirst({ where: { kind: "GROUP", workspaceId: ws.id, ownerId, normalizedTitle } });
    if (!conv) {
      const id = newObjectId();
      conv = await prisma.conversation.create({
        data: {
          id,
          kind: "GROUP",
          workspaceId: ws.id,
          meetingId: null,
          meetingKey: `none:${id}`,
          directKey: `g:${id}`,
          title: chat.title,
          normalizedTitle,
          avatarAssetId: null,
          ownerId,
          createdBy: ownerId,
          status: "ACTIVE",
          settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" },
          lastSeq: 0,
          lastMessageAt: null,
          lastMessageId: null,
          activityAt: startedAt,
          memberCount: memberKeys.length,
          archivedAt: null,
          dissolvedAt: null,
          dissolvedBy: null,
          dissolveReason: null,
          createdAt: startedAt,
        },
      });
      await prisma.conversationMember.createMany({
        data: memberKeys.map((key) => ({
          conversationId: id,
          userId: dir.id(key),
          kind: "GROUP" as const,
          workspaceId: ws.id,
          role: key === chat.owner ? ("OWNER" as const) : ("MEMBER" as const),
          status: "ACTIVE" as const,
          peerUserId: null,
          joinedAt: startedAt,
          leftAt: null,
          addedBy: key === chat.owner ? null : ownerId,
          lastReadAt: null,
          notifyMode: "INHERIT" as const,
          mutedUntil: null,
          pinnedAt: null,
          archivedAt: null,
          hiddenBeforeSeq: 0,
          activityAt: startedAt,
          searchText: normalizedTitle,
        })),
      });
    }

    const scope: ScopeRef = { type: "CONVERSATION", id: conv.id, workspaceId: ws.id };
    await postSystemMessage(scope, "CONVERSATION_CREATED", { actorId: ownerId }, `conv-created:${conv.id}`, startedAt);
    if (chat.members.length > 0) {
      await postSystemMessage(scope, "MEMBER_ADDED", { actorId: ownerId, userIds: chat.members.map((k) => dir.id(k)) }, `conv-member-added:${conv.id}:create`, new Date(startedAt.getTime() + 1000));
    }
    const last = await prisma.message.findFirst({ where: { scopeType: "CONVERSATION", scopeId: conv.id, threadKey: "root" }, orderBy: { seq: "desc" }, select: { createdAt: true } });
    const from = new Date(Math.max(startedAt.getTime() + 3_600_000, (last?.createdAt.getTime() ?? 0) + 60_000));
    const tailGap = rng() < 0.5 ? rng() * 3 * 3_600_000 : rng() * 1.5 * DAY_MS;
    const posted = await postScript({ dir, scope, baseKey: `group:${chat.workspace}:${normalizedTitle}`, lines: chat.lines, from, to: new Date(now.getTime() - tailGap - 600_000), now });
    await finishConversation(
      dir,
      conv.id,
      posted,
      memberKeys.map((key) => ({ key, unread: key === THU ? (chat.unreadForThu ?? 0) : 0, pinned: false }))
    );
    out.push({ id: conv.id, title: chat.title, kind: "GROUP", posted, unreadForThu: chat.unreadForThu ?? 0 });
  }
  return out;
}

/** Mốc đọc + số chưa đọc + thời điểm hoạt động của từng thành viên — chỉ ghi khi lần chạy này thực sự thêm tin mới. */
async function finishConversation(
  dir: Directory,
  conversationId: string,
  posted: readonly PostedMessage[],
  members: ReadonlyArray<{ key: PersonKey; unread: number; pinned: boolean }>
): Promise<void> {
  if (!posted.some((p) => p.fresh)) return;
  const lastAt = posted.reduce((max, p) => (p.createdAt > max ? p.createdAt : max), posted[0].createdAt);
  for (const m of members) {
    const marker = readMarkerFor(posted, m.key, m.unread);
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId: dir.id(m.key) },
      data: {
        lastReadSeq: marker.lastReadSeq,
        lastReadAt: marker.unreadCount === 0 ? lastAt : new Date(lastAt.getTime() - 3_600_000),
        unreadCount: marker.unreadCount,
        mentionsSinceRead: marker.mentions,
        activityAt: lastAt,
        ...(m.pinned ? { pinnedAt: lastAt } : {}),
      },
    });
  }
}
