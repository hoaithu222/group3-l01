/**
 * p0-03 `admin:ops` (integration, socket.io-client thật): admin/manager (`dashboard:view`) join được và khoá "có người xem" của cron `ops.stats-broadcast` được đặt;
 * user thường bị từ chối (PERM_001) và KHÔNG đặt khoá; sự kiện `ops:stats` phát vào room tới đúng người trong room, kèm `v:1`/`serverNow`.
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
import { JwtUtils } from "../../../../core/utils/jwt";
import { emitToRoom } from "../../socket.emit";
import { SocketEvent } from "../../socket.events";
import { OPS_WATCH_KEY } from "../../socket.ops-watch";
import { ROOM } from "../../socket.rooms";
import { startHarness, stopHarness, connectClient, emitWithAck, type Harness } from "./test-helpers";

type Ack = { ok: boolean; code?: string };
const tokenAs = (role: string, tag: string): string => JwtUtils.generateAccessToken({ userId: `u-${tag}-${Date.now()}-${Math.random()}`, email: `${tag}@example.com`, role, sv: 1 });

describe("p0-03 — room admin:ops + ops:stats (integration)", () => {
  let h: Harness;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await stopHarness(h);
  });
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    (redis.connect as jest.Mock).mockRejectedValue(new Error("no redis in test"));
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  });
  afterEach(() => {
    for (const c of clients.splice(0)) c.disconnect();
  });

  const connectAs = async (role: string, tag: string): Promise<ClientSocket> => {
    const c = await connectClient(h.port, { token: tokenAs(role, tag) });
    clients.push(c);
    return c;
  };
  const joinOps = (c: ClientSocket) => emitWithAck<Ack>(c, "room:join", { kind: "admin", id: "ops" });

  it("admin join được → ack ok và khoá ops:stats:watch được đặt; rời room → ack ok", async () => {
    const admin = await connectAs("admin", "ops-admin");
    expect(await redis.exists(OPS_WATCH_KEY)).toBe(false);
    expect(await joinOps(admin)).toEqual({ ok: true });
    expect(await redis.exists(OPS_WATCH_KEY)).toBe(true);
    expect(await emitWithAck<Ack>(admin, "room:leave", { kind: "admin", id: "ops" })).toEqual({ ok: true });
  });

  it("manager (có dashboard:view) join được; user thường → PERM_001 và KHÔNG đặt khoá", async () => {
    const user = await connectAs("user", "ops-user");
    expect(await joinOps(user)).toEqual({ ok: false, code: "PERM_001" });
    expect(await redis.exists(OPS_WATCH_KEY)).toBe(false);

    const manager = await connectAs("manager", "ops-manager");
    expect(await joinOps(manager)).toEqual({ ok: true });
  });

  it("ops:stats phát vào admin:ops tới người trong room (kèm v/serverNow), người ngoài room không nhận", async () => {
    const admin = await connectAs("admin", "ops-recv");
    const outsider = await connectAs("user", "ops-outsider");
    await joinOps(admin);

    const received = new Promise<Record<string, unknown>>((resolve) => admin.once(SocketEvent.OPS_STATS, resolve));
    let leaked = false;
    outsider.once(SocketEvent.OPS_STATS, () => {
      leaked = true;
    });
    emitToRoom(ROOM.admin("ops"), SocketEvent.OPS_STATS, { socketConnections: 3, onlineUsers: 2 });

    const payload = await received;
    expect(payload).toMatchObject({ v: 1, socketConnections: 3, onlineUsers: 2 });
    expect(payload.serverNow).toEqual(expect.any(String));
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);
  });
});
