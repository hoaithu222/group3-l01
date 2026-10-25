/**
 * ACL-08 (be.md p0-02 §10) — `room:join` bị từ chối đúng mã (`PERM_404`
 * không thấy / `PERM_001` thấy nhưng thiếu action). Test qua `resolveJoinable`
 * trực tiếp (đơn vị) như task hướng dẫn — KHÔNG cần dựng Socket.IO client
 * thật, vì hành vi ack thật (`ok:false, code`) đã được `socket.server.test.ts`
 * xác nhận riêng qua `socket.io-client` cho trường hợp "chưa có guard".
 */
import { resolveJoinable, clearRoomGuards } from "../../socket.rooms";
import { registerPermissionGuards } from "../../socket.guards";
import {
  registerScopeResolver,
  clearScopeRegistry,
  type ScopeResolver,
  type ResolvedAccess,
  type Action,
} from "../../../../core/permission";
import { installFakeRedis, type FakeRedisMock } from "../../../../core/permission/tests/fixtures/fake-redis";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../../core/permission/tests/fixtures/fake-redis");
  return createFakeRedisModule();
});

import { redis } from "../../../../infrastructure/redis";

const OBJECT_ID = "507f1f77bcf86cd799439011";
const socketUser = { id: "u1", email: "u1@example.com" };

class StubConversationResolver implements ScopeResolver {
  readonly type = "CONVERSATION" as const;
  visible = false;
  actions: Action[] = [];

  resolve(): Promise<ResolvedAccess> {
    return Promise.resolve({
      visible: this.visible,
      role: this.visible ? "MEMBER" : null,
      actions: new Set(this.actions),
    });
  }
}

describe("ACL-08 — room:join qua PermissionService (socket.guards)", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    clearRoomGuards();
    clearScopeRegistry();
    registerPermissionGuards();
  });

  afterEach(() => {
    clearRoomGuards();
    clearScopeRegistry();
  });

  it("kind hợp lệ nhưng CHƯA có resolver đăng ký cho scope đó → PERM_404 (mặc định đóng, Phase 0 chưa resolver thật)", async () => {
    const result = await resolveJoinable(socketUser, "conv", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_404" });
  });

  it("resolver đăng ký, user KHÔNG thấy scope (visible=false) → PERM_404", async () => {
    const resolver = new StubConversationResolver();
    resolver.visible = false;
    registerScopeResolver(resolver);

    const result = await resolveJoinable(socketUser, "conv", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_404" });
  });

  it("resolver đăng ký, user thấy scope nhưng thiếu action conversation.read → PERM_001", async () => {
    const resolver = new StubConversationResolver();
    resolver.visible = true;
    resolver.actions = []; // visible nhưng không có conversation.read
    registerScopeResolver(resolver);

    const result = await resolveJoinable(socketUser, "conv", OBJECT_ID);
    expect(result).toEqual({ room: null, code: "PERM_001" });
  });

  it("resolver đăng ký, user có action conversation.read → join thành công", async () => {
    const resolver = new StubConversationResolver();
    resolver.visible = true;
    resolver.actions = ["conversation.read"];
    registerScopeResolver(resolver);

    const result = await resolveJoinable(socketUser, "conv", OBJECT_ID);
    expect(result).toEqual({ room: `conv:${OBJECT_ID}` });
  });

  it("kind 'ch' map đúng action channel.read (không lẫn với 'conv')", async () => {
    const chResolver: ScopeResolver = {
      type: "CHANNEL",
      resolve: () =>
        Promise.resolve({ visible: true, role: "MEMBER", actions: new Set(["channel.read"]) }),
    };
    registerScopeResolver(chResolver);

    const result = await resolveJoinable(socketUser, "ch", OBJECT_ID);
    expect(result).toEqual({ room: `ch:${OBJECT_ID}` });
  });
});
