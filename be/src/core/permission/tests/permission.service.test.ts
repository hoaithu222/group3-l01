/**
 * ACL-01, ACL-02 (be.md §10) — 404 trung tính khi không thấy scope, 403 với
 * mã lỗi đúng theo loại scope khi thấy nhưng thiếu action.
 */
import { registerScopeResolver, clearScopeRegistry } from "../scope-registry";
import { permissionService } from "../permission.service";
import { ErrorCode } from "../../utils/error.codes";
import {
  FakeWorkspaceResolver,
  FakeChannelResolver,
  FakeConversationResolver,
  FakeMeetingResolver,
  FakeCallResolver,
} from "./fixtures/fake-resolvers";
import { installFakeRedis, type FakeRedisMock } from "./fixtures/fake-redis";

jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("./fixtures/fake-redis");
  return createFakeRedisModule();
});

import { redis } from "../../../infrastructure/redis";

const stranger = { id: "stranger", email: "stranger@example.com" };

describe("PermissionService", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    clearScopeRegistry();
  });

  afterEach(() => {
    clearScopeRegistry();
  });

  it("ACL-01 — resolver chưa đăng ký cho scope → ném lỗi lập trình (test bắt)", async () => {
    await expect(
      permissionService.resolve(stranger, { type: "WORKSPACE", id: "ws1" })
    ).rejects.toThrow(/Chưa đăng ký resolver/);
  });

  it("ACL-01 — người ngoài scope (không thấy) → assert ném 404 message trung tính, không lộ tên scope", async () => {
    const ws = new FakeWorkspaceResolver();
    ws.members.set("ws1", new Map([["owner", "OWNER"]]));
    registerScopeResolver(ws);

    await expect(permissionService.can(stranger, "workspace.read", { type: "WORKSPACE", id: "ws1" })).resolves.toBe(
      false
    );

    await expect(
      permissionService.assert(stranger, "workspace.read", { type: "WORKSPACE", id: "ws1" })
    ).rejects.toMatchObject({
      statusCode: 404,
      errorCode: ErrorCode.PERM_404,
    });

    try {
      await permissionService.assert(stranger, "workspace.read", { type: "WORKSPACE", id: "ws1" });
      throw new Error("phải ném lỗi");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).not.toContain("ws1");
      expect(message).not.toMatch(/workspace/i);
    }
  });

  it("ACL-02 — WORKSPACE: thấy nhưng thiếu action → 403 PERM_001", async () => {
    const ws = new FakeWorkspaceResolver();
    ws.members.set("ws1", new Map([["guest", "GUEST"]]));
    registerScopeResolver(ws);

    const guest = { id: "guest", email: "guest@example.com" };
    await expect(
      permissionService.assert(guest, "workspace.archive", { type: "WORKSPACE", id: "ws1" })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_001 });
  });

  it("Phase 3 (D-28) — GUEST thiếu action thuộc GUEST_HIDDEN_ACTIONS → 404 PERM_404 (không 403); không-GUEST vẫn 403", async () => {
    const ws = new FakeWorkspaceResolver();
    ws.members.set(
      "ws1",
      new Map([
        ["guest", "GUEST"],
        ["member", "MEMBER"],
      ])
    );
    registerScopeResolver(ws);
    const guest = { id: "guest", email: "guest@example.com" };
    const member = { id: "member", email: "member@example.com" };
    const scope = { type: "WORKSPACE", id: "ws1" } as const;

    await expect(permissionService.assert(guest, "workspace.board.read", scope)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: ErrorCode.PERM_404,
    });
    await expect(permissionService.assert(guest, "workspace.resource.read", scope)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: ErrorCode.PERM_404,
    });
    // Action ngoài tập ẩn → GUEST vẫn nhận 403 như trước (không đổi hành vi hiện có).
    await expect(permissionService.assert(guest, "workspace.archive", scope)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: ErrorCode.PERM_001,
    });
    // Không phải GUEST thiếu action Phase 3 → 403 (fake MEMBER không có `resource.delete`), không bị ẩn thành 404.
    await expect(permissionService.assert(member, "workspace.resource.delete", scope)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: ErrorCode.PERM_001,
    });
    // `can()` chỉ trả boolean — không đổi.
    await expect(permissionService.can(guest, "workspace.board.read", scope)).resolves.toBe(false);
  });

  it("ACL-02 — CHANNEL: thấy nhưng thiếu action → 403 PERM_002", async () => {
    const ch = new FakeChannelResolver();
    ch.channels.set("ch1", {
      workspaceId: "ws1",
      visibility: "PRIVATE",
      grants: new Map([["member", "MEMBER"]]),
    });
    registerScopeResolver(ch);

    const member = { id: "member", email: "member@example.com" };
    await expect(
      permissionService.assert(member, "channel.manage", { type: "CHANNEL", id: "ch1" })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_002 });
  });

  it("ACL-02 — CONVERSATION: thấy nhưng thiếu action → 403 PERM_003", async () => {
    const conv = new FakeConversationResolver();
    conv.conversations.set("conv1", { kind: "GROUP", members: new Map([["member", "MEMBER"]]) });
    registerScopeResolver(conv);

    const member = { id: "member", email: "member@example.com" };
    await expect(
      permissionService.assert(member, "conversation.dissolve", { type: "CONVERSATION", id: "conv1" })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_003 });
  });

  it("ACL-02 — MEETING: thấy nhưng thiếu action → 403 PERM_004", async () => {
    const meet = new FakeMeetingResolver();
    meet.meetings.set("meet1", { workspaceId: "ws1", attendees: new Map([["attendee", "ATTENDEE"]]) });
    registerScopeResolver(meet);

    const attendee = { id: "attendee", email: "attendee@example.com" };
    await expect(
      permissionService.assert(attendee, "meeting.delete", { type: "MEETING", id: "meet1" })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_004 });
  });

  it("ACL-02 — CALL: thấy nhưng thiếu action → 403 PERM_005", async () => {
    const call = new FakeCallResolver();
    call.participants.set("call1", new Map([["participant", "PARTICIPANT"]]));
    registerScopeResolver(call);

    const participant = { id: "participant", email: "participant@example.com" };
    await expect(
      permissionService.assert(participant, "call.end", { type: "CALL", id: "call1" })
    ).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.PERM_005 });
  });

  it("assert() trả về ResolvedAccess khi hợp lệ", async () => {
    const ws = new FakeWorkspaceResolver();
    ws.members.set("ws1", new Map([["owner", "OWNER"]]));
    registerScopeResolver(ws);

    const owner = { id: "owner", email: "owner@example.com" };
    const access = await permissionService.assert(owner, "workspace.read", { type: "WORKSPACE", id: "ws1" });
    expect(access.visible).toBe(true);
    expect(access.role).toBe("OWNER");
    expect(access.actions.has("workspace.read")).toBe(true);
  });

  describe("resolveMany", () => {
    it("resolver không cài resolveMany() → fallback resolve() từng id, không throw", async () => {
      const call = new FakeCallResolver();
      call.participants.set("call1", new Map([["host", "HOST"]]));
      call.participants.set("call2", new Map([["host", "HOST"]]));
      registerScopeResolver(call);

      const host = { id: "host", email: "host@example.com" };
      const result = await permissionService.resolveMany(host, "CALL", ["call1", "call2"]);
      expect(result.get("call1")?.visible).toBe(true);
      expect(result.get("call2")?.visible).toBe(true);
    });

    it("scope không tồn tại trong danh sách → visible=false, không throw", async () => {
      const call = new FakeCallResolver();
      call.participants.set("call1", new Map([["host", "HOST"]]));
      registerScopeResolver(call);

      const host = { id: "host", email: "host@example.com" };
      const result = await permissionService.resolveMany(host, "CALL", ["call1", "call-unknown"]);
      expect(result.get("call1")?.visible).toBe(true);
      expect(result.get("call-unknown")?.visible).toBe(false);
    });
  });
});
