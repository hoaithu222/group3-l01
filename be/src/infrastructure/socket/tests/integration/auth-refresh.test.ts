/**
 * RT-11 (be.md p0-03 §5.2/§10) — `auth:refresh` cập nhật `socket.data.user/exp`
 * KHÔNG cần reconnect; token của user KHÁC → ack RT_401 + socket bị ngắt.
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
import { startHarness, stopHarness, connectClient, tokenFor, emitWithAck, type Harness } from "./test-helpers";

describe("RT-11 — auth:refresh (integration, socket.io-client thật)", () => {
  let h: Harness;
  let client: ClientSocket;

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

    const token = tokenFor("user-a", "a@example.com");
    client = await connectClient(h.port, { token });
  });

  afterEach(() => {
    if (client.connected) client.disconnect();
  });

  it("token hợp lệ CÙNG user → ack ok, socket vẫn kết nối", async () => {
    const newToken = tokenFor("user-a", "a@example.com");
    const ack = await emitWithAck<{ ok: boolean }>(client, "auth:refresh", { token: newToken });
    expect(ack).toEqual({ ok: true });
    expect(client.connected).toBe(true);
  });

  it("token của user KHÁC → ack { ok:false, code: RT_401 }, socket bị ngắt", async () => {
    const otherToken = tokenFor("user-b", "b@example.com");
    const disconnected = new Promise<void>((resolve) => client.on("disconnect", () => resolve()));

    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "auth:refresh", { token: otherToken });
    expect(ack).toEqual({ ok: false, code: "RT_401" });

    await disconnected;
    expect(client.connected).toBe(false);
  });

  it("payload không hợp lệ (token quá ngắn) → ack RT_400", async () => {
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "auth:refresh", { token: "short" });
    expect(ack).toEqual({ ok: false, code: "RT_400" });
    expect(client.connected).toBe(true);
  });

  it("token hết hạn/không hợp lệ → ack RT_401 (không ép ngắt kết nối)", async () => {
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(client, "auth:refresh", {
      token: "a".repeat(40),
    });
    expect(ack).toEqual({ ok: false, code: "RT_401" });
    expect(client.connected).toBe(true);
  });
});
