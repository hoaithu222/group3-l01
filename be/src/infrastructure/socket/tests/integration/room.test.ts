/**
 * RT-02 (be.md p0-03 §10/README §8) — `room:join`/`room:leave` qua
 * socket.io-client thật: kind lạ (Zod) → RT_400; `kind:"user"` (server tự
 * join) → RT_404; guard PermissionService (p0-02) false/thiếu action →
 * PERM_404/PERM_001; guard true → ack ok; `room:leave` chưa join → RT_409.
 */
jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../../core/permission/tests/fixtures/fake-redis");
  const mod = createFakeRedisModule();
  mod.redis.connect = jest.fn().mockRejectedValue(new Error("no redis in test"));
  return mod;
});
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
}));

import type { Socket as ClientSocket } from "socket.io-client";
import { installFakeRedis, type FakeRedisMock } from "../../../../core/permission/tests/fixtures/fake-redis";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import {
  registerScopeResolver,
  clearScopeRegistry,
  type ScopeResolver,
  type ResolvedAccess,
  type Action,
} from "../../../../core/permission";
import { startHarness, stopHarness, connectClient, tokenFor, emitWithAck, type Harness } from "./test-helpers";

const OBJECT_ID = "507f1f77bcf86cd799439011";

class StubChannelResolver implements ScopeResolver {
  readonly type = "CHANNEL" as const;
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

describe("RT-02 — room:join/leave (integration, socket.io-client thật)", () => {
  let h: Harness;
  let client: ClientSocket;
  let resolver: StubChannelResolver;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await stopHarness(h);
  });

  beforeEach(async () => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    (redis.connect as jest.Mock).mockRejectedValue(new Error("no redis in test"));
    (getUserStatusCached as jest.Mock).mockResolvedValue({
      status: "ACTIVE",
      sessionVersion: 1,
      showPresence: true,
    });
    clearScopeRegistry();
    resolver = new StubChannelResolver();
    registerScopeResolver(resolver);

    const token = tokenFor(`u-${Date.now()}-${Math.random()}`, "room-test@example.com");
    client = await connectClient(h.port, { token });
  });

  afterEach(() => {
    clearScopeRegistry();
    client.disconnect();
  });

  it("kind ngoài enum (Zod) → ack RT_400", async () => {
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "room:join", {
      kind: "not-a-kind",
      id: OBJECT_ID,
    });
    expect(ack).toEqual({ ok: false, code: "RT_400" });
  });

  it("kind 'user' (server tự join) → ack RT_404", async () => {
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "room:join", {
      kind: "user",
      id: OBJECT_ID,
    });
    expect(ack).toEqual({ ok: false, code: "RT_404" });
  });

  it("guard: user KHÔNG thấy scope (visible=false) → ack PERM_404", async () => {
    resolver.visible = false;
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "room:join", {
      kind: "ch",
      id: OBJECT_ID,
    });
    expect(ack).toEqual({ ok: false, code: "PERM_404" });
  });

  it("guard: user thấy scope nhưng thiếu action channel.read → ack PERM_001", async () => {
    resolver.visible = true;
    resolver.actions = [];
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "room:join", {
      kind: "ch",
      id: OBJECT_ID,
    });
    expect(ack).toEqual({ ok: false, code: "PERM_001" });
  });

  it("guard: user có action channel.read → ack ok, join thành công", async () => {
    resolver.visible = true;
    resolver.actions = ["channel.read"];
    const ack = await emitWithAck<{ ok: boolean }>(client, "room:join", { kind: "ch", id: OBJECT_ID });
    expect(ack).toEqual({ ok: true });
  });

  it("room:leave khi CHƯA join room đó → ack RT_409", async () => {
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "room:leave", {
      kind: "ch",
      id: OBJECT_ID,
    });
    expect(ack).toEqual({ ok: false, code: "RT_409" });
  });

  it("room:leave sau khi đã join → ack ok", async () => {
    resolver.visible = true;
    resolver.actions = ["channel.read"];
    await emitWithAck(client, "room:join", { kind: "ch", id: OBJECT_ID });

    const ack = await emitWithAck<{ ok: boolean }>(client, "room:leave", { kind: "ch", id: OBJECT_ID });
    expect(ack).toEqual({ ok: true });
  });
});
