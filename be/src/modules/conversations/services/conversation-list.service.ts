import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { normalizeSearch } from "../../../core/utils/normalize";
import { encodeCursor, decodeCursor } from "../../../core/utils/cursor";
import { LIMITS } from "../../../core/constants/limits";
import { classifyContactQuery } from "../../../core/utils/contact-query";
import type { AuthUser } from "../../../core/types/express";
import type { UserContactLookupPort } from "../../../shared/ports/user-contact-lookup.port";
import { avatarUrlOf } from "../../../shared/media";
import { getStates } from "../../presence/presence.service";
import { checkDirectEligibility, type DirectEligibility } from "./eligibility.service";
import { buildDirectKey, buildLastMessagePreview, toListItem } from "./conversation-presenter";
import type { ListConversationsQueryDto, PeopleQueryDto } from "../dtos";
import type { Conversation, ConversationListItem, ConversationListItemPeer, ConversationMember } from "../entities/conversation.interface";

export interface PeopleResultItem {
  userId: string;
  name: string;
  avatarUrl: string | null;
  presence: string;
  sharedWorkspaceIds: string[];
  directConversationId?: string;
  /** Chỉ khi `q` là email/SĐT ĐẦY ĐỦ và khớp người này (khớp CHÍNH XÁC, không phải tìm tên). */
  matchedBy?: "EMAIL" | "PHONE";
  /** Gợi ý CHE của liên hệ còn lại (email che khi khớp SĐT; SĐT che khi khớp email) — `null` khi không có/không cho tìm. */
  contactHint?: string | null;
}

/** be.md §5.6 — danh sách hội thoại: filter/q/cursor/preview/unread/presence. */
export class ConversationListService {
  /** `contacts`: tra email/SĐT đầy đủ TRONG tập người đã chung nhóm (`people`) — không có thì `people` chỉ tìm theo tên như trước. */
  constructor(private readonly contacts?: UserContactLookupPort) {}

  async list(viewer: AuthUser, query: ListConversationsQueryDto): Promise<{ data: ConversationListItem[]; nextCursor: string | null }> {
    const and: Prisma.ConversationMemberWhereInput[] = [{ userId: viewer.id, status: "ACTIVE" }];

    if (query.filter === "pinned") {
      and.push({ pinnedAt: { not: null } });
    } else if (query.filter === "archived") {
      and.push({ archivedAt: { not: null } });
    } else if (query.filter === "unread") {
      and.push({ archivedAt: null }, { OR: [{ markedUnread: true }, { unreadCount: { gt: 0 } }] });
    } else {
      and.push({ archivedAt: null });
    }

    if (query.filter === "direct") and.push({ kind: "DIRECT" });
    if (query.filter === "group") and.push({ kind: "GROUP" });
    if (query.workspaceId) and.push({ workspaceId: query.workspaceId });

    if (query.q) {
      const tokens = normalizeSearch(query.q).split(" ").filter(Boolean);
      for (const token of tokens) and.push({ searchText: { contains: token } });
    }

    let members: Awaited<ReturnType<typeof prisma.conversationMember.findMany>>;
    let nextCursor: string | null = null;

    if (query.filter === "pinned") {
      members = await prisma.conversationMember.findMany({
        where: { AND: and },
        orderBy: { pinnedAt: "desc" },
        take: LIMITS.conversation.memberPinnedMax,
      });
    } else {
      const cursor = query.cursor ? decodeCursor(query.cursor) : null;
      if (cursor) {
        and.push({ OR: [{ activityAt: { lt: cursor.at } }, { AND: [{ activityAt: cursor.at }, { id: { lt: cursor.id } }] }] });
      }
      const rows = await prisma.conversationMember.findMany({
        where: { AND: and },
        orderBy: [{ activityAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      members = rows.slice(0, query.limit);
      if (hasMore && members.length > 0) {
        const last = members[members.length - 1];
        nextCursor = encodeCursor(last.activityAt, last.id);
      }
    }

    if (members.length === 0) return { data: [], nextCursor: null };

    const conversations = await prisma.conversation.findMany({ where: { id: { in: members.map((m) => m.conversationId) } } });
    const conversationById = new Map(conversations.map((c) => [c.id, c]));

    const data = (
      await Promise.all(
        members.map(async (member) => {
          const conversation = conversationById.get(member.conversationId);
          if (!conversation) return null;

          let peer: ConversationListItemPeer | null = null;
          let eligibility: DirectEligibility | null = null;
          if (conversation.kind === "DIRECT" && member.peerUserId) {
            const peerId = member.peerUserId;
            const [eligibilityResult, peerUser, presenceMap] = await Promise.all([
              checkDirectEligibility(viewer.id, peerId),
              prisma.user.findUnique({ where: { id: peerId }, select: { name: true, privacy: true, avatarAssetId: true } }),
              getStates(viewer.id, [peerId]),
            ]);
            eligibility = eligibilityResult;
            const showPresence = peerUser?.privacy?.showPresence !== false;
            peer = {
              userId: peerId,
              name: peerUser?.name ?? "",
              avatarUrl: avatarUrlOf(peerUser?.avatarAssetId),
              presence: showPresence ? presenceMap[peerId]?.state ?? "OFFLINE" : "HIDDEN",
            };
          }

          const lastMessage = await buildLastMessagePreview(conversation.id, viewer.id, member.hiddenBeforeSeq);
          return toListItem({
            conversation: conversation as unknown as Conversation,
            member: member as unknown as ConversationMember,
            peer,
            lastMessage,
            eligibility,
          });
        })
      )
    ).filter((item): item is ConversationListItem => item !== null);

    return { data, nextCursor: query.filter === "pinned" ? null : nextCursor };
  }

  /** `GET /conversations/people` — người chung ≥1 workspace ACTIVE (không GUEST), kèm DM có sẵn (be.md §4). */
  async people(viewer: AuthUser, query: PeopleQueryDto): Promise<PeopleResultItem[]> {
    const myWorkspaceIds = (
      await prisma.workspaceMembership.findMany({
        where: { userId: viewer.id, status: "ACTIVE", ...(query.workspaceId && { workspaceId: query.workspaceId }) },
        select: { workspaceId: true },
      })
    ).map((r) => r.workspaceId);
    if (myWorkspaceIds.length === 0) return [];

    const memberships = await prisma.workspaceMembership.findMany({
      where: { workspaceId: { in: myWorkspaceIds }, userId: { not: viewer.id }, status: "ACTIVE", role: { not: "GUEST" } },
      select: { userId: true, workspaceId: true },
    });
    const workspacesByUser = new Map<string, Set<string>>();
    for (const m of memberships) {
      if (!workspacesByUser.has(m.userId)) workspacesByUser.set(m.userId, new Set());
      workspacesByUser.get(m.userId)?.add(m.workspaceId);
    }
    const candidateIds = Array.from(workspacesByUser.keys());
    if (candidateIds.length === 0) return [];

    // Email/SĐT ĐẦY ĐỦ → tra khớp CHÍNH XÁC (cổng `UserContactLookupPort`, tôn trọng "cho tìm thấy") rồi giao với tập đã chung nhóm;
    // còn lại (rỗng/tên/chuỗi số dở dang) → lọc theo tên như trước. Không bao giờ khớp tiền tố email/SĐT (chống dò danh bạ).
    const contact = classifyContactQuery(query.q);
    const contactMatches = new Map<string, { matchedBy: "EMAIL" | "PHONE"; hint: string | null }>();
    if (contact.kind !== "TEXT" && this.contacts) {
      const candidateSet = new Set(candidateIds);
      for (const match of await this.contacts.findByContact(contact, viewer.id)) {
        if (candidateSet.has(match.userId)) contactMatches.set(match.userId, { matchedBy: match.matchedBy, hint: match.hint });
      }
      if (contactMatches.size === 0) return [];
    }
    const byContact = contactMatches.size > 0;

    const needle = normalizeSearch(query.q);
    const users = await prisma.user.findMany({
      where: {
        id: { in: byContact ? Array.from(contactMatches.keys()) : candidateIds },
        status: "ACTIVE",
        ...(!byContact && needle && { normalizedName: { contains: needle } }),
      },
      select: { id: true, name: true, privacy: true, avatarAssetId: true },
      take: LIMITS.conversation.peopleSearchLimit,
    });
    if (users.length === 0) return [];

    const [presenceMap, directConvos] = await Promise.all([
      getStates(viewer.id, users.map((u) => u.id)),
      prisma.conversation.findMany({
        where: { directKey: { in: users.map((u) => buildDirectKey(viewer.id, u.id)) } },
        select: { id: true, directKey: true },
      }),
    ]);
    const convoByDirectKey = new Map(directConvos.map((c) => [c.directKey, c.id]));

    return users.map((u) => {
      const matched = contactMatches.get(u.id);
      return {
        userId: u.id,
        name: u.name,
        avatarUrl: avatarUrlOf(u.avatarAssetId),
        presence: u.privacy?.showPresence === false ? "HIDDEN" : presenceMap[u.id]?.state ?? "OFFLINE",
        sharedWorkspaceIds: Array.from(workspacesByUser.get(u.id) ?? []),
        directConversationId: convoByDirectKey.get(buildDirectKey(viewer.id, u.id)),
        ...(matched && { matchedBy: matched.matchedBy, contactHint: matched.hint }),
      };
    });
  }
}
