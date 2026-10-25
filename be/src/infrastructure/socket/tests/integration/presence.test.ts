/**
 * RT-03..06 (be.md p0-03 §10/README §8) — luồng dây thật: client A gửi
 * `presence:heartbeat`/`presence:set` → client B (đăng ký làm audience của A
 * qua `registerPresenceAudience`) nhận `presence:updated` đúng trạng thái,
 * kể cả `HIDDEN` khi `showPresence=false`. Bảng chân lý đầy đủ của
 * `computeState` đã có unit test riêng (`modules/presence/tests/presence.service.test.ts`)
 * — file này chỉ xác nhận dây nối Socket.IO thật (ack, room, envelope `v`/`serverNow`).
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
import { ROOM } from "../../socket.rooms";
import { registerPresenceAudience, clearPresenceAudience } from "../../../../modules/presence/presence.service";
import { startHarness, stopHarness, connectClient, tokenFor, emitWithAck, type Harness } from "./test-helpers";

interface PresenceUpdatedPayload {
  v: number;
  serverNow: string;
  userId: string;
  state: string;
}

function waitForEvent<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

describe("RT-03..06 — presence:heartbeat/presence:set (integration, socket.io-client thật)", () => {
  let h: Harness;
  let a: ClientSocket;
  let b: ClientSocket;

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
    clearPresenceAudience();
    // B là "audience" của A (README §2: vd cùng workspace/DM — ở đây giả lập
    // trực tiếp bằng room riêng của B, tương đương `user:{peerId}` DIRECT).
    registerPresenceAudience(async (userId) => (userId === "user-a" ? [ROOM.user("user-b")] : []));

    a = await connectClient(h.port, { token: tokenFor("user-a", "a@example.com") });
    b = await connectClient(h.port, { token: tokenFor("user-b", "b@example.com") });
  });

  afterEach(() => {
    clearPresenceAudience();
    if (a.connected) a.disconnect();
    if (b.connected) b.disconnect();
  });

  it("presence:heartbeat {active:true} → ack ok, audience nhận presence:updated ONLINE có v/serverNow", async () => {
    const updated = waitForEvent<PresenceUpdatedPayload>(b, "presence:updated");
    const ack = await emitWithAck<{ ok: boolean }>(a, "presence:heartbeat", { active: true });
    expect(ack).toEqual({ ok: true });

    const payload = await updated;
    expect(payload).toMatchObject({ v: 1, userId: "user-a", state: "ONLINE" });
    expect(typeof payload.serverNow).toBe("string");
  });

  it("presence:set {dnd:true} → audience nhận state DND", async () => {
    await emitWithAck(a, "presence:heartbeat", { active: true }); // thiết bị 1 beat → ONLINE

    // Bucket `presence:*` (heartbeat + set dùng CHUNG, be.md §5.7) chỉ 1 token/10s
    // theo socket — dùng 1 kết nối KHÁC (thiết bị 2 của cùng user) để gọi
    // `presence:set` không bị chính `presence:heartbeat` vừa rồi ăn hết token.
    // DND là cờ theo user (không theo thiết bị) nên vẫn hợp lệ tính chung.
    const aDevice2 = await connectClient(h.port, {
      token: tokenFor("user-a", "a@example.com"),
      deviceId: "dev-2",
    });

    const updated = waitForEvent<PresenceUpdatedPayload>(b, "presence:updated");
    const ack = await emitWithAck<{ ok: boolean }>(aDevice2, "presence:set", { dnd: true });
    expect(ack).toEqual({ ok: true });

    const payload = await updated;
    expect(payload).toMatchObject({ userId: "user-a", state: "DND" });
    aDevice2.disconnect();
  });

  it("RT-06: showPresence=false → audience nhận HIDDEN thay vì trạng thái thật", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({
      status: "ACTIVE",
      sessionVersion: 1,
      showPresence: false,
    });

    const updated = waitForEvent<PresenceUpdatedPayload>(b, "presence:updated");
    await emitWithAck(a, "presence:heartbeat", { active: true });

    const payload = await updated;
    expect(payload).toMatchObject({ userId: "user-a", state: "HIDDEN" });
  });

  it("payload không hợp lệ (active không phải boolean) → ack RT_400", async () => {
    const ack = await emitWithAck<{ ok: boolean; code?: string }>(a, "presence:heartbeat", {
      active: "yes",
    });
    expect(ack).toEqual({ ok: false, code: "RT_400" });
  });

  it("GET /presence trả trạng thái thật cho chính chủ ngay sau heartbeat", async () => {
    await emitWithAck(a, "presence:heartbeat", { active: true });
    const { getStates } = await import("../../../../modules/presence/presence.service");
    const states = await getStates("user-a", ["user-a"]);
    expect(states["user-a"]).toEqual({ state: "ONLINE" });
  });
});
