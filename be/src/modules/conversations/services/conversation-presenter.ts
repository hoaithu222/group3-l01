import { prisma } from "../../../infrastructure/database";
import { avatarUrlOf } from "../../../shared/media";
import { excerptOf } from "../../messages/public";
import type { Message } from "../../messages/public";
import { getStates } from "../../presence/presence.service";
import { checkDirectEligibility, type DirectEligibility } from "./eligibility.service";
import type {
  Conversation,
  ConversationDetail,
  ConversationListItem,
  ConversationListItemLastMessage,
  ConversationListItemPeer,
  ConversationMember,
  ConversationMyPermissions,
  ReadOnlyReason,
} from "../entities/conversation.interface";

export const RANK: Record<"OWNER" | "ADMIN" | "MEMBER", number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

/** be.md §2 — `directKey = "<idNhỏ>:<idLớn>"`, luôn tính từ 2 id đã sort để 2 chiều tạo ra cùng 1 khoá. */
export function buildDirectKey(userIdA: string, userIdB: string): string {
  return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}

/**
 * be.md §5 ma trận quyền (README §6) — snapshot năng lực CỦA request hiện tại
 * (không đổi theo tin, khác `MessagePermissions`). `eligibility` chỉ cần cho
 * DIRECT (GROUP bỏ qua tham số này).
 */
export function computeMyPermissions(
  conversation: Conversation,
  member: ConversationMember,
  eligibility: DirectEligibility | null
): ConversationMyPermissions {
  const isGroup = conversation.kind === "GROUP";
  const rank = RANK[member.role];
  const conversationActive = conversation.status === "ACTIVE";
  const canMessage = conversationActive && (isGroup || (eligibility?.canMessage ?? false));
  const isOwnerAlone = rank === RANK.OWNER && conversation.memberCount <= 1;

  return {
    canSend: canMessage,
    canCall: canMessage,
    canRename: isGroup && conversationActive && rank >= RANK.ADMIN,
    canAddMembers: isGroup && conversationActive && (rank >= RANK.ADMIN || (rank === RANK.MEMBER && conversation.settings.membersCanAdd)),
    canRemoveMembers: isGroup && conversationActive && rank >= RANK.ADMIN,
    canChangeRoles: isGroup && conversationActive && rank === RANK.OWNER,
    canTransfer: isGroup && conversationActive && rank === RANK.OWNER,
    // DIRECT không bao giờ rời được (CONV_008); GROUP OWNER chỉ rời được sau
    // khi chuyển chủ hoặc là người cuối (be.md README §6) — xấp xỉ ở đây bằng
    // `memberCount<=1`, quyết định chính xác vẫn ở service.
    canLeave: isGroup && (rank !== RANK.OWNER || isOwnerAlone),
    canDissolve: isGroup && rank === RANK.OWNER,
    canPin: canMessage && (!isGroup || rank >= RANK.ADMIN || conversation.settings.memberCanPin),
    canMentionAll: isGroup && (rank >= RANK.ADMIN || conversation.settings.mentionAllRole === "MEMBER"),
  };
}

export function computeReadOnly(
  conversation: Conversation,
  eligibility: DirectEligibility | null
): { readOnly: boolean; readOnlyReason: ReadOnlyReason | null } {
  if (conversation.status === "DISSOLVED") return { readOnly: true, readOnlyReason: "DISSOLVED" };
  if (conversation.status === "ARCHIVED") return { readOnly: true, readOnlyReason: "ARCHIVED" };
  if (conversation.kind === "DIRECT" && eligibility && !eligibility.canMessage) {
    return { readOnly: true, readOnlyReason: eligibility.reason === "BLOCKED" ? "BLOCKED" : "NO_SHARED_WORKSPACE" };
  }
  return { readOnly: false, readOnlyReason: null };
}

/**
 * be.md §5.6 — tin cuối "an toàn" cho viewer: nếu `Conversation.lastMessageId`
 * bị viewer ẩn (`MessageHide`) hoặc `seq <= hiddenBeforeSeq` ("xoá phía tôi"),
 * lùi về tin USER/SYSTEM gần nhất còn thấy được (tối đa 5 ứng viên) — tin đã
 * thu hồi (`deletedAt`) KHÔNG bị lùi qua, chỉ đổi `preview`/`deleted:true`.
 */
export async function buildLastMessagePreview(
  conversationId: string,
  viewerId: string,
  hiddenBeforeSeq: number
): Promise<ConversationListItemLastMessage | null> {
  const candidates = await prisma.message.findMany({
    where: { scopeType: "CONVERSATION", scopeId: conversationId, threadKey: "root", seq: { gt: hiddenBeforeSeq } },
    orderBy: { seq: "desc" },
    take: 5,
  });
  if (candidates.length === 0) return null;

  const hiddenRows = await prisma.messageHide.findMany({
    where: { userId: viewerId, scopeType: "CONVERSATION", scopeId: conversationId, messageId: { in: candidates.map((c) => c.id) } },
    select: { messageId: true },
  });
  const hiddenIds = new Set(hiddenRows.map((h) => h.messageId));
  const visible = candidates.find((c) => !hiddenIds.has(c.id));
  if (!visible) return null;

  const deleted = visible.deletedAt !== null;
  const attachmentKind = !deleted && visible.attachments.length > 0 ? visible.attachments[0].kind : null;
  let authorName: string | null = null;
  if (visible.authorId) {
    const author = await prisma.user.findUnique({ where: { id: visible.authorId }, select: { name: true } });
    authorName = author?.name ?? null;
  }

  return {
    id: visible.id,
    seq: visible.seq,
    authorId: visible.authorId,
    authorName,
    kind: visible.kind,
    systemType: visible.systemType,
    systemPayload: !deleted && visible.kind === "SYSTEM" ? ((visible.systemPayload as Record<string, unknown> | null) ?? null) : null,
    preview: deleted ? "Tin nhắn đã được thu hồi" : excerptOf(visible as unknown as Message, 120),
    attachmentKind,
    deleted,
    createdAt: visible.createdAt,
  };
}

/**
 * BUG FIX (viết trong lúc soạn test tích hợp CV-02/CV-03) —
 * `GroupConversationService#getDetail()` (dùng chung cho CẢ `GET
 * /conversations/:id`, mọi `kind`) luôn truyền `eligibility: null`/`peer:
 * null` xuống `toDetail()`, kể cả khi `conversation.kind === "DIRECT"` — hệ
 * quả: mở lại 1 hội thoại DIRECT đã có sẵn bằng ID (đường thật app dùng sau
 * khi điều hướng từ danh sách, không phải luôn qua `GET
 * /conversations/direct/:userId`) không BAO GIỜ trả `readOnly`/`readOnlyReason`
 * đúng khi hết chung workspace hoặc bị chặn (CONV_002/`NO_SHARED_WORKSPACE`),
 * và không có `peer` (tên/avatar/presence) — `ConversationListService.list()`
 * KHÔNG bị lỗi này (đã tự tính `eligibility`/`peer` đúng cho từng dòng DIRECT).
 * Factor logic tính peer/eligibility DÙNG CHUNG ở đây (thay vì chép lại y hệt
 * `DirectConversationService`'s private `toDetail()`) để `getDetail()` gọi.
 */
export async function buildDirectPeerContext(
  conversation: Conversation,
  viewerId: string
): Promise<{
  peer: ConversationListItemPeer | null;
  eligibility: DirectEligibility | null;
  peerLastReadSeq: number | null;
  peerReadAt: Date | null;
}> {
  if (conversation.kind !== "DIRECT") {
    return { peer: null, eligibility: null, peerLastReadSeq: null, peerReadAt: null };
  }

  const peerMemberRow = await prisma.conversationMember.findFirst({
    where: { conversationId: conversation.id, userId: { not: viewerId } },
  });
  if (!peerMemberRow) return { peer: null, eligibility: null, peerLastReadSeq: null, peerReadAt: null };
  const peerId = peerMemberRow.userId;

  const [eligibility, peerUser, presenceMap, myUser] = await Promise.all([
    checkDirectEligibility(viewerId, peerId),
    prisma.user.findUnique({ where: { id: peerId }, select: { name: true, privacy: true, avatarAssetId: true } }),
    getStates(viewerId, [peerId]),
    prisma.user.findUnique({ where: { id: viewerId }, select: { privacy: true } }),
  ]);

  const showPresence = peerUser?.privacy?.showPresence !== false;
  const peer: ConversationListItemPeer = {
    userId: peerId,
    name: peerUser?.name ?? "",
    avatarUrl: avatarUrlOf(peerUser?.avatarAssetId),
    presence: showPresence ? presenceMap[peerId]?.state ?? "OFFLINE" : "HIDDEN",
  };

  // be.md §5.8 — `peerLastReadSeq/peerReadAt` chỉ khi CẢ HAI bật `privacy.readReceipts`.
  const bothEnabled = myUser?.privacy?.readReceipts !== false && peerUser?.privacy?.readReceipts !== false;
  return {
    peer,
    eligibility,
    peerLastReadSeq: bothEnabled ? peerMemberRow.lastReadSeq : null,
    peerReadAt: bothEnabled ? peerMemberRow.lastReadAt : null,
  };
}

export interface ListItemBuildInput {
  conversation: Conversation;
  member: ConversationMember;
  peer: ConversationListItemPeer | null;
  lastMessage: ConversationListItemLastMessage | null;
  eligibility: DirectEligibility | null;
}

/**
 * `avatarUrl` — GROUP: ảnh nhóm chat (`Conversation.avatarAssetId`) dưới dạng URL ký sẵn (`avatarUrlOf`, bản THUMB,
 * client dùng thẳng làm nguồn ảnh, không cần Bearer); DIRECT: luôn `null` — ảnh là `peer.avatarUrl` của người kia.
 */
export function toListItem(input: ListItemBuildInput): ConversationListItem {
  const { conversation, member, peer, lastMessage, eligibility } = input;
  const { readOnly, readOnlyReason } = computeReadOnly(conversation, eligibility);
  const muted = member.notifyMode === "MUTED" || (member.mutedUntil !== null && member.mutedUntil.getTime() > Date.now());

  return {
    id: conversation.id,
    kind: conversation.kind,
    status: conversation.status,
    workspaceId: conversation.workspaceId,
    title: conversation.kind === "DIRECT" ? null : conversation.title,
    avatarUrl: conversation.kind === "DIRECT" ? null : avatarUrlOf(conversation.avatarAssetId),
    peer,
    memberCount: conversation.memberCount,
    lastMessage,
    unreadCount: member.unreadCount,
    hasMention: member.mentionsSinceRead > 0,
    markedUnread: member.markedUnread,
    pinnedAt: member.pinnedAt,
    archivedAt: member.archivedAt,
    muted,
    notifyMode: member.notifyMode,
    readOnly,
    readOnlyReason,
    activityAt: member.activityAt,
    isMeetingGroup: conversation.meetingId !== null,
  };
}

export function toDetail(
  input: ListItemBuildInput & {
    peerLastReadSeq: number | null;
    peerReadAt: Date | null;
  }
): ConversationDetail {
  const listItem = toListItem(input);
  return {
    ...listItem,
    settings: input.conversation.settings,
    myRole: input.member.role,
    lastReadSeq: input.member.lastReadSeq,
    hiddenBeforeSeq: input.member.hiddenBeforeSeq,
    ownerId: input.conversation.ownerId,
    meetingId: input.conversation.meetingId,
    peerLastReadSeq: input.peerLastReadSeq,
    peerReadAt: input.peerReadAt,
    myPermissions: computeMyPermissions(input.conversation, input.member, input.eligibility),
  };
}
