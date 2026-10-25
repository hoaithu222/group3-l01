/**
 * ACL-06, ACL-07 (be.md §10) — ⚠️ BẢN ĐƠN GIẢN HƠN yêu cầu gốc. be.md muốn
 * dựng 2 instance Socket.IO + Redis Adapter thật + 2 client cùng user để xác
 * nhận cả hai rời room và nhận `permission:revoked` ≤ 2s (ACL-06), và một
 * workspace GROUP/CHANNEL/MEETING con mất quyền theo sau khi rời WORKSPACE
 * (ACL-07). Việc đó cần hạ tầng nặng (2 server thật, Redis thật) không hợp
 * lý trong ngân sách của module này.
 *
 * File này kiểm ĐÚNG LOGIC của `revokeScope()` — bumpVersion mọi scope liên
 * quan (qua `children()`), gọi đúng `RealtimePort.leaveRooms`/`emitToUsers`
 * với danh sách room + payload đúng be.md §5.4/§6, và `OutboxPort.enqueueNow`
 * đúng job — bằng port GIẢ (`jest.fn()`), KHÔNG dùng Socket.IO/Redis thật.
 * Test thiết bị/tích hợp thật (2 socket thật rời room + nhận event) CẦN LÀM
 * SAU, ghi rõ ở `docs/plans/phase-0-common/p0-02-access-control/be.md`.
 */
import { registerScopeResolver, clearScopeRegistry } from "../../scope-registry";
import { revokeScope } from "../../revoke-scope";
import { setPermissionPorts, resetPermissionPorts, type PermissionPorts } from "../../ports";
import { installFakeRedis, type FakeRedisMock } from "../fixtures/fake-redis";
import type { ScopeResolver, ResolvedAccess, ScopeRef } from "../../scope.types";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../fixtures/fake-redis");
  return createFakeRedisModule();
});

import { redis } from "../../../../infrastructure/redis";

const EMPTY_ACCESS: ResolvedAccess = { visible: true, role: null, actions: new Set() };

class TestWorkspaceResolver implements ScopeResolver {
  readonly type = "WORKSPACE" as const;
  resolve(): Promise<ResolvedAccess> {
    return Promise.resolve(EMPTY_ACCESS);
  }
  children(scopeId: string): Promise<ScopeRef[]> {
    void scopeId;
    return Promise.resolve([
      { type: "CHANNEL", id: "ch1" },
      { type: "CONVERSATION", id: "conv1" },
    ]);
  }
  roomsFor(scopeId: string): string[] {
    return [`ws:${scopeId}`];
  }
}

class TestChannelResolver implements ScopeResolver {
  readonly type = "CHANNEL" as const;
  resolve(): Promise<ResolvedAccess> {
    return Promise.resolve(EMPTY_ACCESS);
  }
  roomsFor(scopeId: string): string[] {
    return [`ch:${scopeId}`];
  }
}

class TestConversationResolver implements ScopeResolver {
  readonly type = "CONVERSATION" as const;
  resolve(): Promise<ResolvedAccess> {
    return Promise.resolve(EMPTY_ACCESS);
  }
  roomsFor(scopeId: string): string[] {
    return [`conv:${scopeId}`];
  }
}

function fakePorts(): PermissionPorts {
  return {
    realtime: {
      leaveRooms: jest.fn().mockResolvedValue(undefined),
      emitToUsers: jest.fn().mockResolvedValue(undefined),
    },
    outbox: {
      enqueueNow: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe("revokeScope — logic pipeline (be.md §5.4) qua port giả", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    clearScopeRegistry();
    registerScopeResolver(new TestWorkspaceResolver());
    registerScopeResolver(new TestChannelResolver());
    registerScopeResolver(new TestConversationResolver());
  });

  afterEach(() => {
    clearScopeRegistry();
    resetPermissionPorts();
  });

  it("ACL-07 — rời WORKSPACE (cascade mặc định true) → bump version + leaveRooms + emit cho CẢ scope con qua children()", async () => {
    const ports = fakePorts();
    setPermissionPorts(ports);

    await revokeScope({
      scope: { type: "WORKSPACE", id: "ws1" },
      userIds: ["u1", "u2"],
      reason: "LEFT",
    });

    // bumpVersion gọi cho scope gốc + 2 scope con (children()).
    expect(redis.incr).toHaveBeenCalledWith("permver:WORKSPACE:ws1");
    expect(redis.incr).toHaveBeenCalledWith("permver:CHANNEL:ch1");
    expect(redis.incr).toHaveBeenCalledWith("permver:CONVERSATION:conv1");

    // Đá khỏi room của CẢ scope gốc lẫn scope con.
    expect(ports.realtime.leaveRooms).toHaveBeenCalledWith(
      ["u1", "u2"],
      ["ws:ws1", "ch:ch1", "conv:conv1"]
    );

    // Chỉ 1 sự kiện cho scope GỐC, cascade:true để client tự hiểu scope con.
    expect(ports.realtime.emitToUsers).toHaveBeenCalledTimes(1);
    expect(ports.realtime.emitToUsers).toHaveBeenCalledWith(["u1", "u2"], "permission:revoked", {
      v: 1,
      scopeType: "WORKSPACE",
      scopeId: "ws1",
      version: 1,
      reason: "LEFT",
      cascade: true,
    });

    expect(ports.outbox.enqueueNow).toHaveBeenCalledWith("push.cancel-scope", {
      userIds: ["u1", "u2"],
      scopeType: "WORKSPACE",
      scopeId: "ws1",
      version: 1,
    });
  });

  it("cascade:false → chỉ scope gốc, KHÔNG đụng scope con", async () => {
    const ports = fakePorts();
    setPermissionPorts(ports);

    await revokeScope({
      scope: { type: "CHANNEL", id: "ch1" },
      userIds: ["u1"],
      reason: "GRANT_REVOKED",
      cascade: false,
    });

    expect(redis.incr).toHaveBeenCalledWith("permver:CHANNEL:ch1");
    expect(redis.incr).not.toHaveBeenCalledWith("permver:CONVERSATION:conv1");
    expect(ports.realtime.leaveRooms).toHaveBeenCalledWith(["u1"], ["ch:ch1"]);
    expect(ports.realtime.emitToUsers).toHaveBeenCalledWith(
      ["u1"],
      "permission:revoked",
      expect.objectContaining({ scopeType: "CHANNEL", scopeId: "ch1", cascade: false })
    );
  });

  it("resolver không có children() → cascade mặc định vẫn không throw, chỉ xử lý scope gốc", async () => {
    clearScopeRegistry();
    registerScopeResolver(new TestChannelResolver()); // không có children()
    const ports = fakePorts();
    setPermissionPorts(ports);

    await expect(
      revokeScope({ scope: { type: "CHANNEL", id: "ch1" }, userIds: ["u1"], reason: "ARCHIVED" })
    ).resolves.toBeUndefined();
    expect(ports.realtime.leaveRooms).toHaveBeenCalledWith(["u1"], ["ch:ch1"]);
  });

  it("userIds rỗng → không gọi leaveRooms/emitToUsers, vẫn gọi outbox.enqueueNow", async () => {
    const ports = fakePorts();
    setPermissionPorts(ports);

    await revokeScope({ scope: { type: "CHANNEL", id: "ch1" }, userIds: [], reason: "DISSOLVED" });

    expect(ports.realtime.leaveRooms).not.toHaveBeenCalled();
    expect(ports.realtime.emitToUsers).not.toHaveBeenCalled();
    expect(ports.outbox.enqueueNow).toHaveBeenCalledWith(
      "push.cancel-scope",
      expect.objectContaining({ userIds: [] })
    );
  });
});
