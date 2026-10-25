/**
 * RT-CR — race trong handler `connection` (`socket.server.ts`): phần CHẬM của kết nối (join room theo
 * `presenceJoinRooms` = đọc DB, ghi registry) KHÔNG được làm rớt sự kiện C→S đến sớm, và client ngắt giữa chừng
 * không được để rò gauge `socketConnections` / thành viên room "ma" trong adapter / bản ghi registry.
 *
 * Cổng `makeGate()` giữ `presenceJoinRooms` lại ĐÚNG lúc cần ⇒ test tất định (không dựa vào thời gian ngủ): khi cổng đóng,
 * bootstrap của server đang kẹt ở đó, nên ack về được chỉ khi listener đã đăng ký TRƯỚC phần chậm.
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
} from "../../../../core/permission";
import { socketConnections } from "../../../metrics";
import { registerPresenceJoinRooms, clearPresenceJoinRooms } from "../../../../modules/presence/presence.service";
import { registryList } from "../../socket.registry";
import { ROOM } from "../../socket.rooms";
import { startHarness, stopHarness, connectClient, tokenFor, emitWithAck, type Harness } from "./test-helpers";

const OBJECT_ID = "507f1f77bcf86cd799439011";
const ACK_TIMEOUT_MS = 1500;

/** Cổng thủ công: `presenceJoinRooms` chờ tới khi test gọi `open()`; `entered` báo server đã kẹt ở đó. */
function makeGate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  return { opened, open, entered, markEntered };
}

/** Ack không về (listener chưa đăng ký ⇒ sự kiện bị rớt) → test đỏ nhanh thay vì treo tới timeout của jest. */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ACK_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor: quá thời gian chờ");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function gaugeValue(): Promise<number> {
  const { values } = await socketConnections.get();
  return values[0]?.value ?? 0;
}

class VisibleChannelResolver implements ScopeResolver {
  readonly type = "CHANNEL" as const;
  resolve(): Promise<ResolvedAccess> {
    return Promise.resolve({ visible: true, role: "MEMBER", actions: new Set(["channel.read" as const]) });
  }
}

describe("RT-CR — race của handler connection (integration, socket.io-client thật)", () => {
  let h: Harness;
  let client: ClientSocket | undefined;
  let gate: ReturnType<typeof makeGate>;

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
    clearScopeRegistry();
    registerScopeResolver(new VisibleChannelResolver());
    gate = makeGate();
  });

  afterEach(async () => {
    gate.open(); // nhả bootstrap còn kẹt (nếu test đỏ giữa chừng)
    client?.disconnect();
    client = undefined;
    // `disconnect` chạy đồng bộ ngay khi socket rời `nsp.sockets` — chờ tới đó để gauge/registry của test sau sạch.
    await waitFor(() => h.io.of("/").sockets.size === 0);
    clearPresenceJoinRooms();
    clearScopeRegistry();
  });

  /** Giữ bootstrap ở `presenceJoinRooms`; trả về danh sách room "đọc từ DB" khi cổng mở. */
  function holdBootstrap(extraRooms: string[] = []): void {
    registerPresenceJoinRooms(async () => {
      gate.markEntered();
      await gate.opened;
      return extraRooms;
    });
  }

  it("RT-CR-01: presence:heartbeat gửi NGAY khi vừa connect (bootstrap còn kẹt ở presenceJoinRooms) vẫn có ack ok", async () => {
    holdBootstrap();
    client = await connectClient(h.port, { token: tokenFor("cr-user-1", "cr1@example.com") });
    await gate.entered;

    const ack = await withTimeout(
      emitWithAck<{ ok: boolean }>(client, "presence:heartbeat", { active: true }),
      "presence:heartbeat không có ack — listener đăng ký SAU phần chậm của connection nên sự kiện bị rớt"
    );
    expect(ack).toEqual({ ok: true });
  });

  it("RT-CR-02: room:join gửi NGAY khi vừa connect (bootstrap còn kẹt) → ack ok và socket thật sự nằm trong room", async () => {
    holdBootstrap();
    client = await connectClient(h.port, { token: tokenFor("cr-user-2", "cr2@example.com") });
    await gate.entered;

    const ack = await withTimeout(
      emitWithAck<{ ok: boolean; code?: string }>(client, "room:join", { kind: "ch", id: OBJECT_ID }),
      "room:join không có ack — listener đăng ký SAU phần chậm của connection nên sự kiện bị rớt"
    );
    expect(ack).toEqual({ ok: true });
    const members = await h.io.in(ROOM.channel(OBJECT_ID)).fetchSockets();
    expect(members).toHaveLength(1);
  });

  it("RT-CR-03: client ngắt lúc bootstrap còn kẹt → gauge socketConnections về mức cũ, không room ma, không bản ghi registry", async () => {
    const userId = "cr-user-3";
    const ghostRoom = ROOM.workspace(OBJECT_ID);
    holdBootstrap([ghostRoom]);
    const baseline = await gaugeValue();

    client = await connectClient(h.port, { token: tokenFor(userId, "cr3@example.com") });
    await gate.entered;
    client.disconnect();
    await waitFor(() => h.io.of("/").sockets.size === 0); // server đã xử lý ngắt TRƯỚC khi bootstrap đi tiếp

    gate.open();
    await new Promise((resolve) => setTimeout(resolve, 100)); // để phần còn lại của bootstrap (nếu có) chạy xong

    expect(await gaugeValue()).toBe(baseline);
    const adapter = h.io.of("/").adapter;
    expect(adapter.rooms.has(ghostRoom)).toBe(false); // không để thành viên "ma" của socket đã đóng trong room ws:*
    expect(adapter.sids.size).toBe(0);
    expect(await registryList(userId)).toEqual({}); // registryAdd không chạy sau registryRemove của disconnect
  });
});
