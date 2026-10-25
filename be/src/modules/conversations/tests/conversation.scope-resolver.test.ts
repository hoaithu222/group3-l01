/**
 * Unit — `permission/conversation.scope-resolver.ts#resolve()` (be.md §5.7,
 * README §6 ma trận quyền) — mirror
 * `channels/tests/channel-permission.resolver.test.ts`. Mock
 * `prisma.conversationMember.findUnique`/`prisma.conversation.findUnique`
 * (dùng bởi `loadConversationMeta`) + `checkDirectEligibility` — `redis` đã bị
 * mock rỗng bởi `src/tests/setup.ts` (fail-open → luôn đọc DB, không cần cấu
 * hình cache riêng cho unit test này).
 */
const mockMemberFindUnique = jest.fn();
const mockConversationFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    conversationMember: { findUnique: (...args: unknown[]) => mockMemberFindUnique(...args) },
    conversation: { findUnique: (...args: unknown[]) => mockConversationFindUnique(...args) },
  },
}));

const mockCheckDirectEligibility = jest.fn();
jest.mock("../services/eligibility.service", () => ({
  checkDirectEligibility: (...args: unknown[]) => mockCheckDirectEligibility(...args),
}));

import { getResolver, clearScopeRegistry, type ResolveContext } from "../../../core/permission";
import { registerConversationPermissionResolver } from "../permission/conversation.scope-resolver";
import type { ConversationKindValue, ConversationSettings } from "../entities/conversation.interface";

const user = { id: "u1", email: "u1@example.com" };

interface MemberRowLike {
  role: "OWNER" | "ADMIN" | "MEMBER";
  status: "ACTIVE" | "LEFT" | "REMOVED";
  peerUserId: string | null;
}

function member(overrides: Partial<MemberRowLike> = {}): MemberRowLike {
  return { role: "MEMBER", status: "ACTIVE", peerUserId: null, ...overrides };
}

function meta(overrides: Partial<{ kind: ConversationKindValue; status: string; workspaceId: string | null; settings: ConversationSettings }> = {}) {
  return {
    id: "conv1",
    kind: "GROUP" as ConversationKindValue,
    status: "ACTIVE",
    workspaceId: "ws1",
    settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" } as ConversationSettings,
    ...overrides,
  };
}

function ctx(): ResolveContext {
  return { now: new Date(), resolve: jest.fn() };
}

describe("conversation.scope-resolver#resolve() (be.md §5.7)", () => {
  beforeEach(() => {
    clearScopeRegistry();
    registerConversationPermissionResolver();
  });

  afterEach(() => {
    mockMemberFindUnique.mockReset();
    mockConversationFindUnique.mockReset();
    mockCheckDirectEligibility.mockReset();
  });

  it("không phải member (null) → invisible, không action", async () => {
    mockMemberFindUnique.mockResolvedValue(null);
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.visible).toBe(false);
    expect(access.actions.size).toBe(0);
  });

  it("member LEFT/REMOVED (không ACTIVE) → invisible dù bản ghi còn tồn tại", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ status: "LEFT" }));
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.visible).toBe(false);
  });

  it("member ACTIVE nhưng Conversation không còn tồn tại (meta null) → invisible", async () => {
    mockMemberFindUnique.mockResolvedValue(member());
    mockConversationFindUnique.mockResolvedValue(null);
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.visible).toBe(false);
  });

  it("member ACTIVE, conversation DISSOLVED → VẪN visible + conversation.read (canRead bỏ qua status — be.md §5.7)", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER" }));
    mockConversationFindUnique.mockResolvedValue(meta({ status: "DISSOLVED" }));
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.visible).toBe(true);
    expect(access.actions.has("conversation.read")).toBe(true);
    expect(access.actions.has("conversation.message.send")).toBe(false);
  });

  it("GROUP ACTIVE, role MEMBER → có send/call/react ngầm (write); không add/remove/dissolve", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER" }));
    mockConversationFindUnique.mockResolvedValue(meta());
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.actions.has("conversation.message.send")).toBe(true);
    expect(access.actions.has("conversation.call.start")).toBe(true);
    expect(access.actions.has("conversation.member.add")).toBe(false);
    expect(access.actions.has("conversation.member.remove")).toBe(false);
    expect(access.actions.has("conversation.dissolve")).toBe(false);
    expect(access.actions.has("conversation.message.pin")).toBe(false); // memberCanPin=false, rank MEMBER
  });

  it("GROUP ACTIVE, role MEMBER, settings.membersCanAdd=true → conversation.member.add xuất hiện cho MEMBER", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER" }));
    mockConversationFindUnique.mockResolvedValue(meta({ settings: { membersCanAdd: true, memberCanPin: false, mentionAllRole: "ADMIN" } }));
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.actions.has("conversation.member.add")).toBe(true);
  });

  it("GROUP ACTIVE, role MEMBER, settings.memberCanPin=true → conversation.message.pin xuất hiện", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER" }));
    mockConversationFindUnique.mockResolvedValue(meta({ settings: { membersCanAdd: false, memberCanPin: true, mentionAllRole: "ADMIN" } }));
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.actions.has("conversation.message.pin")).toBe(true);
  });

  it("GROUP ACTIVE, role ADMIN → update/member.add/member.remove; KHÔNG dissolve/member.role/transfer (be.md §5.4 — rank ADMIN)", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "ADMIN" }));
    mockConversationFindUnique.mockResolvedValue(meta());
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.actions.has("conversation.update")).toBe(true);
    expect(access.actions.has("conversation.member.add")).toBe(true);
    expect(access.actions.has("conversation.member.remove")).toBe(true);
    expect(access.actions.has("conversation.message.pin")).toBe(true); // rank>=ADMIN luôn pin được
    expect(access.actions.has("conversation.dissolve")).toBe(false);
    expect(access.actions.has("conversation.member.role")).toBe(false);
    expect(access.actions.has("conversation.transfer")).toBe(false);
  });

  it("GROUP ACTIVE, role OWNER → có đủ mọi action quản trị (be.md §5.4 — rank OWNER)", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "OWNER" }));
    mockConversationFindUnique.mockResolvedValue(meta());
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    for (const a of [
      "conversation.read",
      "conversation.message.send",
      "conversation.call.start",
      "conversation.message.pin",
      "conversation.update",
      "conversation.member.add",
      "conversation.member.remove",
      "conversation.dissolve",
      "conversation.member.role",
      "conversation.transfer",
    ]) {
      expect(access.actions.has(a as never)).toBe(true);
    }
    expect(access.role).toBe("OWNER");
  });

  it("DIRECT, ACTIVE, đủ điều kiện nhắn (eligibility.canMessage=true) → send/call/pin (DIRECT luôn pin được khi canMessage)", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER", peerUserId: "u2" }));
    mockConversationFindUnique.mockResolvedValue(meta({ kind: "DIRECT", workspaceId: null }));
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.actions.has("conversation.message.send")).toBe(true);
    expect(access.actions.has("conversation.call.start")).toBe(true);
    expect(access.actions.has("conversation.message.pin")).toBe(true);
    expect(mockCheckDirectEligibility).toHaveBeenCalledWith("u1", "u2");
  });

  it("DIRECT, ACTIVE, KHÔNG đủ điều kiện nhắn (blocked/không chung workspace) → chỉ conversation.read, không send/call/pin", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER", peerUserId: "u2" }));
    mockConversationFindUnique.mockResolvedValue(meta({ kind: "DIRECT", workspaceId: null }));
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: false, reason: "BLOCKED" });
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.visible).toBe(true);
    expect(access.actions).toEqual(new Set(["conversation.read"]));
  });

  it("workspaceId có giá trị (GROUP) → parent + versionDeps trỏ WORKSPACE cha (bump WORKSPACE tự vô hiệu cache)", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER" }));
    mockConversationFindUnique.mockResolvedValue(meta({ workspaceId: "ws-xyz" }));
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.parent).toEqual({ type: "WORKSPACE", id: "ws-xyz" });
    expect(access.versionDeps).toEqual([{ type: "WORKSPACE", id: "ws-xyz" }]);
  });

  it("DIRECT (workspaceId null) → không có parent/versionDeps", async () => {
    mockMemberFindUnique.mockResolvedValue(member({ role: "MEMBER", peerUserId: "u2" }));
    mockConversationFindUnique.mockResolvedValue(meta({ kind: "DIRECT", workspaceId: null }));
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
    const access = await getResolver("CONVERSATION")!.resolve(user, "conv1", ctx());
    expect(access.parent).toBeUndefined();
    expect(access.versionDeps).toBeUndefined();
  });

  it("roomsFor(id) → conv:<id>", () => {
    expect(getResolver("CONVERSATION")!.roomsFor?.("conv1")).toEqual(["conv:conv1"]);
  });
});
