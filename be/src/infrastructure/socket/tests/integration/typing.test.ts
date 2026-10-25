/**
 * RT-07/RT-08 (be.md p0-03 §5.5/§10) — `typing:start`/`typing:stop` phát vào
 * đúng room scope, KHÔNG lộ cho chính người gửi; phải đã join room + có
 * action `channel.message.send`; spam vượt token bucket → ack RT_429.
 */
jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../../core/permission/tests/fixtures/fake-redis");
  const mod = createFakeRedisModule();
  mod.redis.connect = jest.fn().mockRejectedValue(new Error("no redis in test"));
  return mod;
});
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
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

const CHANNEL_ID = "507f1f77bcf86cd799439011";

class StubChannelResolver implements ScopeResolver {
  readonly type = "CHANNEL" as const;
  actions: Action[] = ["channel.read", "channel.message.send"];

  resolve(): Promise<ResolvedAccess> {
    return Promise.resolve({ visible: true, role: "MEMBER", actions: new Set(this.actions) });
  }
}

describe("RT-07/RT-08 — typing:start/stop (integration, socket.io-client thật)", () => {
  let h: Harness;
  let sender: ClientSocket;
  let listener: ClientSocket;
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

    sender = await connectClient(h.port, { token: tokenFor("sender", "sender@example.com") });
    listener = await connectClient(h.port, { token: tokenFor("listener", "listener@example.com") });

    // Cả 2 phải join `ch:{id}` trước — typing yêu cầu socket.rooms.has(room).
    await emitWithAck(sender, "room:join", { kind: "ch", id: CHANNEL_ID });
    await emitWithAck(listener, "room:join", { kind: "ch", id: CHANNEL_ID });
  });

  afterEach(() => {
    clearScopeRegistry();
    if (sender.connected) sender.disconnect();
    if (listener.connected) listener.disconnect();
  });

  it("typing:start → người khác trong room nhận được, KHÔNG lộ nội dung, người gửi KHÔNG nhận lại", async () => {
    const received: unknown[] = [];
    listener.on("typing", (payload) => received.push(payload));
    let senderReceived = false;
    sender.on("typing", () => {
      senderReceived = true;
    });

    const ack = await emitWithAck<{ ok: boolean }>(sender, "typing:start", {
      scopeType: "CHANNEL",
      scopeId: CHANNEL_ID,
    });
    expect(ack).toEqual({ ok: true });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      v: 1,
      scopeType: "CHANNEL",
      scopeId: CHANNEL_ID,
      userId: "sender",
      state: "start",
    });
    expect(senderReceived).toBe(false);
  });

  it("typing:stop → phát state 'stop' tới room", async () => {
    const received: Array<{ state: string }> = [];
    listener.on("typing", (payload: { state: string }) => received.push(payload));

    await emitWithAck(sender, "typing:stop", { scopeType: "CHANNEL", scopeId: CHANNEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0].state).toBe("stop");
  });

  it("chưa join room scope → ack RT_409", async () => {
    const other = await connectClient(h.port, { token: tokenFor("outsider", "outsider@example.com") });
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(other, "typing:start", {
      scopeType: "CHANNEL",
      scopeId: CHANNEL_ID,
    });
    expect(ack).toEqual({ ok: false, code: "RT_409" });
    other.disconnect();
  });

  it("đã join nhưng thiếu action channel.message.send → ack mã lỗi permission tương ứng (PERM_002)", async () => {
    // Kênh RIÊNG cho ca này — `PermissionService` cache theo `{user, scope, version}`
    // (p0-02), đổi `resolver.actions` SAU khi đã resolve CHANNEL_ID ở `beforeEach`
    // (dùng cho join) sẽ đọc trúng cache cũ. Đặt actions hạn chế TRƯỚC khi join
    // 1 scope id khác để lần resolve đầu tiên (và duy nhất) đã đúng theo test này.
    const restrictedChannelId = "507f1f77bcf86cd799439012";
    resolver.actions = ["channel.read"]; // còn channel.read (đủ để join) nhưng KHÔNG có message.send
    await emitWithAck(sender, "room:join", { kind: "ch", id: restrictedChannelId });

    const ack = await emitWithAck<{ ok: boolean; code?: string }>(sender, "typing:start", {
      scopeType: "CHANNEL",
      scopeId: restrictedChannelId,
    });
    expect(ack).toEqual({ ok: false, code: "PERM_002" });
  });

  it("RT-08: spam typing:start vượt token bucket → ack RT_429 từ lần thứ 3", async () => {
    const acks: Array<{ ok: boolean; code?: string }> = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const ack = await emitWithAck<{ ok: boolean; code?: string }>(sender, "typing:start", {
        scopeType: "CHANNEL",
        scopeId: CHANNEL_ID,
      });
      acks.push(ack);
    }

    const okCount = acks.filter((a) => a.ok).length;
    const rateLimited = acks.filter((a) => !a.ok && a.code === "RT_429").length;
    // capacity=2 (LIMITS.realtime.rateLimit.typing) — tối đa 2 lần đầu qua trong cùng khoảnh khắc.
    expect(okCount).toBeLessThanOrEqual(2);
    expect(rateLimited).toBeGreaterThanOrEqual(3);
  });
});
