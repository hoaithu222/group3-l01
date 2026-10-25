/**
 * Integration — cầu nối worker → socket trên REDIS THẬT với HAI instance API thật (mỗi instance: `http.Server` + `Server` Socket.IO +
 * `@socket.io/redis-adapter`) và một "worker" (tiến trình KHÔNG có `Server`: `tryGetIO()` = null, chỉ có cầu nối `@socket.io/redis-emitter`).
 * Chứng minh: mọi `emitTo*`/`leaveRooms`/`joinRooms`/`disconnectUserSockets` chạy từ worker tới đúng client ở CẢ HAI instance, MỖI socket nhận
 * ĐÚNG MỘT lần (không trùng dù N instance), `exceptUserIds`/`excludeUserId`/`recheck`/envelope `v`+`serverNow` giữ nguyên, thứ tự được giữ,
 * và Redis mất kết nối không làm treo/ném lời gọi emit.
 *
 * Chạy khi có Redis: CI (`CI=true`, service `redis:7`) hoặc cục bộ `TEST_REDIS=1 REDIS_URL=redis://127.0.0.1:6391` (Memurai/Redis cục bộ);
 * không có → SKIP (CI luôn chạy). ⛔ Cục bộ CHỈ chạy với Redis loopback: test publish `emitToAll` — nhưng dùng khoá kênh RIÊNG mỗi lần chạy nên không
 * lẫn vào Socket.IO của API đang chạy trên cùng Redis; vẫn từ chối host không phải loopback (trừ CI).
 */
const mockCan = jest.fn<Promise<boolean>, [unknown, unknown, unknown]>();
jest.mock("../../socket.server", () => ({
  tryGetIO: (): null => null, // "worker": tiến trình này KHÔNG có Server
  getIO: (): never => {
    throw new Error("[Socket] Socket.IO chưa được khởi tạo. Gọi initSocketServer() trước.");
  },
}));
jest.mock("../../../../core/permission", () => ({
  permissionService: { can: (user: unknown, action: unknown, scope: unknown): Promise<boolean> => mockCan(user, action, scope) },
}));

import http from "http";
import type { AddressInfo } from "net";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { env } from "../../../../core/config";
import { redis } from "../../../redis";
import { closeSocketBridge, getSocketBridge, initSocketBridge, setSocketBridgeForTests } from "../../socket.bridge";
import { registerSocketBridgeListeners } from "../../socket.bridge.listener";
import { emitToAll, emitToRoom, emitToScope, emitToUsers, joinRooms, leaveRooms } from "../../socket.emit";
import { ROOM } from "../../socket.rooms";
import { disconnectUserSockets } from "../../socket.sessions";

const enabled = process.env.CI === "true" || process.env.TEST_REDIS === "1";
const describeRedis = enabled ? describe : describe.skip;
jest.setTimeout(30_000);

// Khoá kênh RIÊNG cho lần chạy này (adapter + emitter phải cùng khoá) — không đụng Socket.IO của API khác dùng chung Redis.
const KEY = `test-bridge-${process.pid}-${Date.now()}`;

interface Received {
  event: string;
  payload: Record<string, unknown>;
}
interface TestClient {
  userId: string;
  instance: "A" | "B";
  socket: ClientSocket;
  received: Received[];
  of(event: string): Received[];
}
interface ApiInstance {
  name: "A" | "B";
  io: Server;
  http: http.Server;
  port: number;
  clients: Array<ReturnType<typeof createClient>>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await sleep(15);
  }
  throw new Error("Quá thời gian chờ điều kiện");
}
/**
 * Đợi cả hai adapter SUBSCRIBE xong (adapter không `await` việc đăng ký trong constructor): PUBLISH lên kênh của một room không ai có — adapter bỏ qua
 * gói TRƯỚC khi giải mã — và đọc số subscriber. Chắc hơn ngủ cố định trên máy tải nặng.
 */
async function waitForAdapters(count: number): Promise<void> {
  const client = redis.getClient();
  if (!client) throw new Error("redis chưa kết nối");
  const end = Date.now() + 10_000;
  while (Date.now() < end) {
    if ((await client.publish(`${KEY}#/#probe-khong-ai-co#`, "x")) >= count) return;
    await sleep(25);
  }
  throw new Error("Adapter chưa SUBSCRIBE kịp");
}

/** Đợi socket của `userId` (CỤC BỘ ở instance `api`) vào/rời `room` — lệnh join/leave từ worker được adapter xử lý bất đồng bộ. */
async function inRoom(api: ApiInstance, room: string, userId: string, expected: boolean): Promise<void> {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    const sockets = await api.io.in(room).local.fetchSockets();
    const present = sockets.some((socket) => (socket.data as { user?: { id: string } }).user?.id === userId);
    if (present === expected) return;
    await sleep(15);
  }
  throw new Error(`Socket của ${userId} chưa ${expected ? "vào" : "rời"} ${room} ở instance ${api.name}`);
}

/** Đợi đủ `min` bản nhận rồi CHỜ THÊM để bắt bản trùng (nếu có) — thứ chỉ lộ ra khi có N instance. */
async function settle(check: () => number, min: number, extraMs = 250): Promise<void> {
  await until(() => check() >= min);
  await sleep(extraMs);
}

const users = { x: "user-x", y: "user-y", z: "user-z" };
const CH = "ch:c1";

async function startApi(name: "A" | "B"): Promise<ApiInstance> {
  const server = http.createServer();
  const io = new Server(server, { transports: ["websocket"] });
  const pub = createClient({ url: env.REDIS_URL, password: env.REDIS_PASSWORD || undefined });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub, { key: KEY }));
  registerSocketBridgeListeners(io);
  io.on("connection", (socket) => {
    const { userId, rooms } = socket.handshake.auth as { userId: string; rooms: string[] };
    (socket.data as Record<string, unknown>).user = { id: userId };
    void socket.join([ROOM.user(userId), ...rooms]);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return { name, io, http: server, port: (server.address() as AddressInfo).port, clients: [pub, sub] };
}

function connect(api: ApiInstance, userId: string, rooms: string[] = []): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://127.0.0.1:${api.port}`, { auth: { userId, rooms }, transports: ["websocket"], reconnection: false });
    const received: Received[] = [];
    socket.onAny((event: string, payload: Record<string, unknown>) => received.push({ event, payload }));
    socket.on("connect", () => resolve({ userId, instance: api.name, socket, received, of: (event) => received.filter((r) => r.event === event) }));
    socket.on("connect_error", reject);
  });
}

describeRedis("Redis thật — worker → 2 instance API", () => {
  let a: ApiInstance;
  let b: ApiInstance;
  let xA: TestClient; // user X, thiết bị 1 ở instance A
  let xB: TestClient; // user X, thiết bị 2 ở instance B
  let yA: TestClient; // user Y ở A
  let zB: TestClient; // user Z ở B (chưa ở room kênh)
  let all: TestClient[];

  beforeAll(async () => {
    const host = new URL(env.REDIS_URL).hostname;
    if (process.env.CI !== "true" && !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
      throw new Error(`Từ chối chạy test Redis với host không phải loopback: ${host}`);
    }
    await redis.connect(); // "worker": client `redis` dùng chung — cầu nối mặc định publish trên đó
    [a, b] = await Promise.all([startApi("A"), startApi("B")]);
    xA = await connect(a, users.x, [CH]);
    xB = await connect(b, users.x, [CH]);
    yA = await connect(a, users.y, [CH]);
    zB = await connect(b, users.z, []);
    all = [xA, xB, yA, zB];
    initSocketBridge({ key: KEY });
    await waitForAdapters(2); // adapter phải SUBSCRIBE xong trước khi worker publish
  });

  afterAll(async () => {
    for (const c of all ?? []) c.socket.disconnect();
    await closeSocketBridge();
    setSocketBridgeForTests(null);
    for (const api of [a, b]) {
      if (!api) continue;
      await api.io.close();
    }
    // Lệnh (P)UNSUBSCRIBE của adapter còn dở phải xong TRƯỚC khi đóng client (nếu không: DisconnectsClientError chưa được bắt → sập tiến trình test).
    await sleep(300);
    for (const api of [a, b]) {
      if (!api) continue;
      await Promise.all(
        api.clients.map((c) =>
          Promise.race([c.quit(), sleep(2000).then(() => c.disconnect())]).catch(() => undefined)
        )
      );
    }
    await redis.disconnect();
  });

  beforeEach(() => {
    mockCan.mockImplementation((user) => Promise.resolve((user as { id: string }).id !== users.y));
  });

  it("emitToUsers từ worker: MỌI thiết bị của user ở CẢ HAI instance nhận ĐÚNG MỘT lần (không trùng), user khác không nhận; có `v`/`serverNow`", async () => {
    emitToUsers([users.x], "t:users", { hello: "world" });
    await settle(() => xA.of("t:users").length + xB.of("t:users").length, 2);

    for (const c of [xA, xB]) {
      expect(c.of("t:users")).toHaveLength(1);
      const payload = c.of("t:users")[0]?.payload;
      expect(payload).toMatchObject({ v: 1, hello: "world" });
      expect(String(payload?.serverNow)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(yA.of("t:users")).toHaveLength(0);
    expect(zB.of("t:users")).toHaveLength(0);
  });

  it("emitToUsers nhiều user (một gói, nhiều room) → mỗi thiết bị ở mỗi instance đúng một lần", async () => {
    emitToUsers([users.x, users.y, users.z], "t:many", { n: 1 });
    await settle(() => all.reduce((n, c) => n + c.of("t:many").length, 0), 4);

    for (const c of all) expect(c.of("t:many")).toHaveLength(1);
  });

  it("emitToRoom: mọi socket trong room ở cả hai instance; exceptUserIds loại đúng user (mọi thiết bị của họ)", async () => {
    emitToRoom(CH, "t:room", { a: 1 });
    await settle(() => xA.of("t:room").length + xB.of("t:room").length + yA.of("t:room").length, 3);
    expect([xA, xB, yA].map((c) => c.of("t:room").length)).toEqual([1, 1, 1]);
    expect(zB.of("t:room")).toHaveLength(0);

    emitToRoom(CH, "t:room-except", { a: 2 }, [users.y]);
    await settle(() => xA.of("t:room-except").length + xB.of("t:room-except").length, 2);
    expect([xA, xB].map((c) => c.of("t:room-except").length)).toEqual([1, 1]);
    expect(yA.of("t:room-except")).toHaveLength(0);
  });

  it("emitToAll: MỌI kết nối của MỌI instance nhận đúng một lần", async () => {
    emitToAll("t:all", { keys: [] });
    await settle(() => all.reduce((n, c) => n + c.of("t:all").length, 0), 4);

    for (const c of all) expect(c.of("t:all")).toHaveLength(1);
  });

  it("emitToScope: room theo scope; excludeUserId loại MỌI thiết bị của người gửi ở cả hai instance", async () => {
    await emitToScope({ type: "CHANNEL", id: "c1" }, "t:scope", { id: "m1" }, { excludeUserId: users.x });
    await settle(() => yA.of("t:scope").length, 1);

    expect(yA.of("t:scope")).toHaveLength(1);
    expect(xA.of("t:scope")).toHaveLength(0);
    expect(xB.of("t:scope")).toHaveLength(0);
    expect(zB.of("t:scope")).toHaveLength(0);
  });

  it("emitToScope({ recheck }): mỗi instance kiểm quyền socket CỤC BỘ của nó — người bị thu hồi không nhận, người còn quyền nhận đúng một lần", async () => {
    await emitToScope({ type: "CHANNEL", id: "c1" }, "t:recheck", { id: "secret" }, { recheck: "channel.read" });
    await settle(() => xA.of("t:recheck").length + xB.of("t:recheck").length, 2);

    expect(xA.of("t:recheck")).toHaveLength(1); // instance A
    expect(xB.of("t:recheck")).toHaveLength(1); // instance B
    expect(yA.of("t:recheck")).toHaveLength(0); // bị thu hồi (mockCan → false)
    expect(zB.of("t:recheck")).toHaveLength(0); // không ở room
    expect(mockCan).toHaveBeenCalledWith({ id: users.x }, "channel.read", { type: "CHANNEL", id: "c1" });
    expect(xA.of("t:recheck")[0]?.payload).toMatchObject({ v: 1, id: "secret" });
  });

  it("joinRooms rồi leaveRooms từ worker: socket của user ở cả hai instance vào/rời room, KHÔNG bị ngắt kết nối", async () => {
    joinRooms([users.z], [CH]);
    await inRoom(b, CH, users.z, true); // lệnh REMOTE_JOIN chạy bất đồng bộ ở instance B
    emitToRoom(CH, "t:after-join", {});
    await settle(() => zB.of("t:after-join").length, 1);
    expect(zB.of("t:after-join")).toHaveLength(1);

    leaveRooms([users.x], [CH]); // X có socket ở CẢ HAI instance
    await Promise.all([inRoom(a, CH, users.x, false), inRoom(b, CH, users.x, false)]);
    emitToRoom(CH, "t:after-leave", {});
    await settle(() => yA.of("t:after-leave").length + zB.of("t:after-leave").length, 2);

    expect(yA.of("t:after-leave")).toHaveLength(1);
    expect(zB.of("t:after-leave")).toHaveLength(1);
    expect(xA.of("t:after-leave")).toHaveLength(0);
    expect(xB.of("t:after-leave")).toHaveLength(0);
    expect(xA.socket.connected && xB.socket.connected).toBe(true);
  });

  it("thứ tự được giữ và không mất/trùng: 300 sự kiện liên tiếp từ vòng lặp đồng bộ", async () => {
    for (let i = 0; i < 300; i += 1) emitToUsers([users.y], "t:seq", { i });
    await settle(() => yA.of("t:seq").length, 300);

    expect(yA.of("t:seq").map((r) => r.payload.i)).toEqual(Array.from({ length: 300 }, (_, i) => i));
  });

  it("disconnectUserSockets từ worker: mọi socket của user (ở instance nào) bị ngắt, user khác giữ kết nối", async () => {
    disconnectUserSockets(users.x, "test");
    await until(() => !xA.socket.connected && !xB.socket.connected);

    expect(yA.socket.connected).toBe(true);
    expect(zB.socket.connected).toBe(true);
  });

  it("Redis mất kết nối: emit* trả về ngay, không ném, bỏ sự kiện; Redis sống lại thì emit MỚI tới client", async () => {
    const bridge = getSocketBridge();
    const before = bridge?.stats().dropped ?? 0;

    await redis.disconnect(); // client dùng chung đóng → `getClient()` null
    const startedAt = Date.now();
    expect(() => emitToUsers([users.y], "t:down", { n: 1 })).not.toThrow();
    expect(() => leaveRooms([users.y], [CH])).not.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(200);
    expect(bridge?.stats().dropped).toBe(before + 2);

    await redis.connect();
    await sleep(100);
    emitToUsers([users.y], "t:up", { n: 2 });
    await settle(() => yA.of("t:up").length, 1);
    expect(yA.of("t:up")).toHaveLength(1);
    expect(yA.of("t:down")).toHaveLength(0); // sự kiện lúc mất kết nối KHÔNG được phát lại về sau
  });

  it("khoá kênh lệch (worker `key` khác adapter) → PUBLISH thành công nhưng KHÔNG ai nghe: noSubscribers được đếm (chẩn đoán cấu hình sai)", async () => {
    setSocketBridgeForTests(null);
    const wrong = initSocketBridge({ key: `${KEY}-khac` });
    emitToUsers([users.y], "t:wrong-key", {});
    await until(() => wrong.stats().published >= 1); // PUBLISH đã được Redis xác nhận (trả 0 subscriber)
    await sleep(150); // chờ thêm: nếu (sai) có ai nhận thì client Y đã kịp nhận

    expect(wrong.stats()).toMatchObject({ published: 1, noSubscribers: 1 });
    expect(yA.of("t:wrong-key")).toHaveLength(0);
    setSocketBridgeForTests(null);
  });

  it("graceful shutdown của worker: emit rồi `closeSocketBridge()` + `redis.disconnect()` NGAY → mọi sự kiện đã phát vẫn tới client (không mất lệnh đang bay)", async () => {
    initSocketBridge({ key: KEY });
    for (let i = 0; i < 50; i += 1) emitToUsers([users.y], "t:shutdown", { i });
    await closeSocketBridge(); // chờ PUBLISH đang bay — thứ tự trong `worker.ts`: closeWorkers → closeSocketBridge → … → redis.disconnect
    await redis.disconnect();
    await settle(() => yA.of("t:shutdown").length, 50);

    expect(yA.of("t:shutdown").map((r) => r.payload.i)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    // Sau khi đóng, lệnh muộn bị bỏ êm (không ném) — job chạy sót không làm sập tiến trình đang tắt.
    expect(() => emitToUsers([users.y], "t:late", {})).not.toThrow();
  });
});
