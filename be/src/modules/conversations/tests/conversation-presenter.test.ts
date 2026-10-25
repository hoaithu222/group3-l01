/**
 * Unit — `services/conversation-presenter.ts` (be.md §5.6/§5.7, README §6 ma
 * trận quyền). Hàm THUẦN (không Prisma/Redis) trừ `buildLastMessagePreview`
 * (cần Prisma — test riêng ở tầng integration qua `GET /conversations`/`GET
 * /conversations/:id`, không lặp lại ở đây).
 */
import { RANK, buildDirectKey, computeMyPermissions, computeReadOnly, toListItem, toDetail } from "../services/conversation-presenter";
import type { Conversation, ConversationMember, ConversationSettings } from "../entities/conversation.interface";
import type { DirectEligibility } from "../services/eligibility.service";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  const settings: ConversationSettings = { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" };
  return {
    id: "conv1",
    kind: "GROUP",
    workspaceId: "ws1",
    meetingId: null,
    meetingKey: "none:conv1",
    directKey: "g:conv1",
    title: "Nhóm test",
    normalizedTitle: "nhom test",
    avatarAssetId: null,
    ownerId: "u1",
    createdBy: "u1",
    status: "ACTIVE",
    settings,
    lastSeq: 0,
    lastMessageAt: null,
    lastMessageId: null,
    activityAt: new Date(),
    memberCount: 3,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    dissolvedAt: null,
    dissolvedBy: null,
    dissolveReason: null,
    ...overrides,
  };
}

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: "mem1",
    conversationId: "conv1",
    userId: "u1",
    kind: "GROUP",
    workspaceId: "ws1",
    role: "MEMBER",
    status: "ACTIVE",
    peerUserId: null,
    joinedAt: new Date(),
    leftAt: null,
    addedBy: null,
    lastReadSeq: 0,
    lastReadAt: null,
    unreadCount: 0,
    mentionsSinceRead: 0,
    notifyMode: "INHERIT",
    mutedUntil: null,
    pinnedAt: null,
    archivedAt: null,
    markedUnread: false,
    hiddenBeforeSeq: 0,
    activityAt: new Date(),
    searchText: "nhom test",
    version: 1,
    ...overrides,
  };
}

const ELIGIBLE: DirectEligibility = { canMessage: true, reason: null };
const BLOCKED: DirectEligibility = { canMessage: false, reason: "BLOCKED" };
const NO_SHARED: DirectEligibility = { canMessage: false, reason: "NO_SHARED_WORKSPACE" };

describe("conversation-presenter#buildDirectKey", () => {
  it("luôn sắp id nhỏ trước — 2 chiều tạo cùng 1 khoá", () => {
    expect(buildDirectKey("a", "b")).toBe("a:b");
    expect(buildDirectKey("b", "a")).toBe("a:b");
  });
});

describe("conversation-presenter#RANK", () => {
  it("OWNER > ADMIN > MEMBER", () => {
    expect(RANK.OWNER).toBeGreaterThan(RANK.ADMIN);
    expect(RANK.ADMIN).toBeGreaterThan(RANK.MEMBER);
  });
});

describe("conversation-presenter#computeReadOnly", () => {
  it("DISSOLVED → readOnly true, reason DISSOLVED (bất kể kind)", () => {
    expect(computeReadOnly(makeConversation({ status: "DISSOLVED" }), null)).toEqual({ readOnly: true, readOnlyReason: "DISSOLVED" });
  });

  it("ARCHIVED → readOnly true, reason ARCHIVED", () => {
    expect(computeReadOnly(makeConversation({ status: "ARCHIVED" }), null)).toEqual({ readOnly: true, readOnlyReason: "ARCHIVED" });
  });

  it("GROUP ACTIVE → readOnly false dù eligibility null (GROUP bỏ qua eligibility)", () => {
    expect(computeReadOnly(makeConversation({ status: "ACTIVE" }), null)).toEqual({ readOnly: false, readOnlyReason: null });
  });

  it("DIRECT ACTIVE, eligibility BLOCKED → readOnly true, reason BLOCKED", () => {
    const conv = makeConversation({ kind: "DIRECT", status: "ACTIVE" });
    expect(computeReadOnly(conv, BLOCKED)).toEqual({ readOnly: true, readOnlyReason: "BLOCKED" });
  });

  it("DIRECT ACTIVE, eligibility NO_SHARED_WORKSPACE → readOnly true, reason NO_SHARED_WORKSPACE", () => {
    const conv = makeConversation({ kind: "DIRECT", status: "ACTIVE" });
    expect(computeReadOnly(conv, NO_SHARED)).toEqual({ readOnly: true, readOnlyReason: "NO_SHARED_WORKSPACE" });
  });

  it("DIRECT ACTIVE, eligibility canMessage true → readOnly false", () => {
    const conv = makeConversation({ kind: "DIRECT", status: "ACTIVE" });
    expect(computeReadOnly(conv, ELIGIBLE)).toEqual({ readOnly: false, readOnlyReason: null });
  });
});

describe("conversation-presenter#computeMyPermissions (README §6 ma trận)", () => {
  it("GROUP OWNER, ACTIVE, memberCount>1 → canDissolve/canTransfer/canChangeRoles true, canLeave false (chưa chuyển chủ)", () => {
    const conv = makeConversation({ memberCount: 3 });
    const member = makeMember({ role: "OWNER" });
    const perms = computeMyPermissions(conv, member, null);
    expect(perms.canDissolve).toBe(true);
    expect(perms.canTransfer).toBe(true);
    expect(perms.canChangeRoles).toBe(true);
    expect(perms.canRename).toBe(true);
    expect(perms.canAddMembers).toBe(true);
    expect(perms.canRemoveMembers).toBe(true);
    expect(perms.canLeave).toBe(false);
    expect(perms.canSend).toBe(true);
  });

  it("GROUP OWNER là người cuối (memberCount<=1) → canLeave true (xấp xỉ, quyết định chính xác ở service)", () => {
    const conv = makeConversation({ memberCount: 1 });
    const member = makeMember({ role: "OWNER" });
    expect(computeMyPermissions(conv, member, null).canLeave).toBe(true);
  });

  it("GROUP ADMIN → không dissolve/transfer/changeRoles, có rename/add/remove", () => {
    const conv = makeConversation();
    const member = makeMember({ role: "ADMIN" });
    const perms = computeMyPermissions(conv, member, null);
    expect(perms.canDissolve).toBe(false);
    expect(perms.canTransfer).toBe(false);
    expect(perms.canChangeRoles).toBe(false);
    expect(perms.canRename).toBe(true);
    expect(perms.canAddMembers).toBe(true);
    expect(perms.canRemoveMembers).toBe(true);
    expect(perms.canLeave).toBe(true);
  });

  it("GROUP MEMBER, settings.membersCanAdd=false → canAddMembers false", () => {
    const conv = makeConversation();
    const member = makeMember({ role: "MEMBER" });
    expect(computeMyPermissions(conv, member, null).canAddMembers).toBe(false);
  });

  it("GROUP MEMBER, settings.membersCanAdd=true → canAddMembers true", () => {
    const conv = makeConversation({ settings: { membersCanAdd: true, memberCanPin: false, mentionAllRole: "ADMIN" } });
    const member = makeMember({ role: "MEMBER" });
    expect(computeMyPermissions(conv, member, null).canAddMembers).toBe(true);
  });

  it("GROUP MEMBER, settings.memberCanPin=true → canPin true; false → chỉ ADMIN+ mới pin", () => {
    const convPinOn = makeConversation({ settings: { membersCanAdd: false, memberCanPin: true, mentionAllRole: "ADMIN" } });
    const convPinOff = makeConversation({ settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" } });
    const member = makeMember({ role: "MEMBER" });
    expect(computeMyPermissions(convPinOn, member, null).canPin).toBe(true);
    expect(computeMyPermissions(convPinOff, member, null).canPin).toBe(false);
    expect(computeMyPermissions(convPinOff, makeMember({ role: "ADMIN" }), null).canPin).toBe(true);
  });

  it("GROUP mentionAllRole=MEMBER → canMentionAll true cho MEMBER; mặc định ADMIN → false", () => {
    const convAllowAll = makeConversation({ settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "MEMBER" } });
    const convDefault = makeConversation();
    const member = makeMember({ role: "MEMBER" });
    expect(computeMyPermissions(convAllowAll, member, null).canMentionAll).toBe(true);
    expect(computeMyPermissions(convDefault, member, null).canMentionAll).toBe(false);
  });

  it("GROUP DISSOLVED → canSend/canCall/canRename/canAddMembers/canPin false (read-only lịch sử)", () => {
    const conv = makeConversation({ status: "DISSOLVED" });
    const member = makeMember({ role: "OWNER" });
    const perms = computeMyPermissions(conv, member, null);
    expect(perms.canSend).toBe(false);
    expect(perms.canCall).toBe(false);
    expect(perms.canRename).toBe(false);
    expect(perms.canAddMembers).toBe(false);
    expect(perms.canPin).toBe(false);
  });

  it("DIRECT eligible → canSend/canCall/canPin true, canAddMembers/canDissolve/canLeave false (không phải GROUP)", () => {
    const conv = makeConversation({ kind: "DIRECT" });
    const member = makeMember({ kind: "DIRECT", role: "MEMBER", peerUserId: "u2" });
    const perms = computeMyPermissions(conv, member, ELIGIBLE);
    expect(perms.canSend).toBe(true);
    expect(perms.canCall).toBe(true);
    expect(perms.canPin).toBe(true);
    expect(perms.canAddMembers).toBe(false);
    expect(perms.canDissolve).toBe(false);
    expect(perms.canLeave).toBe(false); // CONV_008 — DIRECT không rời được
  });

  it("DIRECT không đủ điều kiện nhắn (BLOCKED/NO_SHARED_WORKSPACE) → canSend/canCall/canPin false", () => {
    const conv = makeConversation({ kind: "DIRECT" });
    const member = makeMember({ kind: "DIRECT", role: "MEMBER", peerUserId: "u2" });
    expect(computeMyPermissions(conv, member, BLOCKED).canSend).toBe(false);
    expect(computeMyPermissions(conv, member, NO_SHARED).canPin).toBe(false);
  });
});

describe("conversation-presenter#toListItem", () => {
  it("DIRECT → title luôn null (kể cả nếu Conversation.title có giá trị)", () => {
    const conv = makeConversation({ kind: "DIRECT", title: "không nên hiện" });
    const member = makeMember({ kind: "DIRECT" });
    const item = toListItem({ conversation: conv, member, peer: null, lastMessage: null, eligibility: null });
    expect(item.title).toBeNull();
  });

  it("GROUP → title lấy từ Conversation.title", () => {
    const conv = makeConversation({ title: "Nhóm ABC" });
    const member = makeMember();
    const item = toListItem({ conversation: conv, member, peer: null, lastMessage: null, eligibility: null });
    expect(item.title).toBe("Nhóm ABC");
  });

  it("GROUP có ảnh → avatarUrl là URL ảnh ký sẵn (THUMB) từ Conversation.avatarAssetId; chưa có ảnh → null", () => {
    const assetId = "65f0000000000000000000b1";
    const withAvatar = toListItem({ conversation: makeConversation({ avatarAssetId: assetId }), member: makeMember(), peer: null, lastMessage: null, eligibility: null });
    expect(withAvatar.avatarUrl).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);
    const detail = toDetail({ conversation: makeConversation({ avatarAssetId: assetId }), member: makeMember(), peer: null, lastMessage: null, eligibility: null, peerLastReadSeq: null, peerReadAt: null });
    expect(detail.avatarUrl).toBe(withAvatar.avatarUrl);
    expect(toListItem({ conversation: makeConversation(), member: makeMember(), peer: null, lastMessage: null, eligibility: null }).avatarUrl).toBeNull();
  });

  it("DIRECT → avatarUrl luôn null (ảnh của hàng là peer.avatarUrl của người kia)", () => {
    const conv = makeConversation({ kind: "DIRECT", avatarAssetId: "65f0000000000000000000b2" });
    const item = toListItem({ conversation: conv, member: makeMember({ kind: "DIRECT" }), peer: null, lastMessage: null, eligibility: ELIGIBLE });
    expect(item.avatarUrl).toBeNull();
  });

  it("muted=true khi notifyMode=MUTED", () => {
    const member = makeMember({ notifyMode: "MUTED" });
    const item = toListItem({ conversation: makeConversation(), member, peer: null, lastMessage: null, eligibility: null });
    expect(item.muted).toBe(true);
  });

  it("muted=true khi mutedUntil còn hiệu lực (tương lai)", () => {
    const member = makeMember({ notifyMode: "INHERIT", mutedUntil: new Date(Date.now() + 60_000) });
    const item = toListItem({ conversation: makeConversation(), member, peer: null, lastMessage: null, eligibility: null });
    expect(item.muted).toBe(true);
  });

  it("muted=false khi mutedUntil đã qua (hết hạn)", () => {
    const member = makeMember({ notifyMode: "INHERIT", mutedUntil: new Date(Date.now() - 60_000) });
    const item = toListItem({ conversation: makeConversation(), member, peer: null, lastMessage: null, eligibility: null });
    expect(item.muted).toBe(false);
  });

  it("isMeetingGroup=true khi Conversation.meetingId != null", () => {
    const item = toListItem({
      conversation: makeConversation({ meetingId: "meet1" }),
      member: makeMember(),
      peer: null,
      lastMessage: null,
      eligibility: null,
    });
    expect(item.isMeetingGroup).toBe(true);
  });

  it("hasMention=true khi mentionsSinceRead > 0", () => {
    const item = toListItem({
      conversation: makeConversation(),
      member: makeMember({ mentionsSinceRead: 2 }),
      peer: null,
      lastMessage: null,
      eligibility: null,
    });
    expect(item.hasMention).toBe(true);
  });
});

describe("conversation-presenter#toDetail", () => {
  it("gộp đủ myRole/lastReadSeq/hiddenBeforeSeq/ownerId/meetingId/myPermissions từ ListItem", () => {
    const conv = makeConversation({ ownerId: "u1", meetingId: null });
    const member = makeMember({ role: "OWNER", lastReadSeq: 5, hiddenBeforeSeq: 2 });
    const detail = toDetail({
      conversation: conv,
      member,
      peer: null,
      lastMessage: null,
      eligibility: null,
      peerLastReadSeq: null,
      peerReadAt: null,
    });
    expect(detail.myRole).toBe("OWNER");
    expect(detail.lastReadSeq).toBe(5);
    expect(detail.hiddenBeforeSeq).toBe(2);
    expect(detail.ownerId).toBe("u1");
    expect(detail.meetingId).toBeNull();
    expect(detail.myPermissions.canDissolve).toBe(true);
    expect(detail.settings).toEqual(conv.settings);
  });

  it("DIRECT — mang theo peerLastReadSeq/peerReadAt khi cả 2 bật readReceipts", () => {
    const conv = makeConversation({ kind: "DIRECT" });
    const member = makeMember({ kind: "DIRECT", peerUserId: "u2" });
    const readAt = new Date();
    const detail = toDetail({
      conversation: conv,
      member,
      peer: { userId: "u2", name: "B", avatarUrl: null, presence: "ONLINE" },
      lastMessage: null,
      eligibility: ELIGIBLE,
      peerLastReadSeq: 7,
      peerReadAt: readAt,
    });
    expect(detail.peerLastReadSeq).toBe(7);
    expect(detail.peerReadAt).toBe(readAt);
    expect(detail.peer).toEqual({ userId: "u2", name: "B", avatarUrl: null, presence: "ONLINE" });
  });
});
