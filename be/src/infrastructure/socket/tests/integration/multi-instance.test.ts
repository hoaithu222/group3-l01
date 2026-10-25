/**
 * RT-09 (be.md p0-03 §10) — ĐÂY LÀ BẢN ĐƠN GIẢN HOÁ, KHÔNG PHẢI RT-09 ĐẦY ĐỦ.
 *
 * be.md yêu cầu 2 `http.Server` + 2 `Server` Socket.IO RIÊNG BIỆT + Redis
 * Adapter THẬT (`@socket.io/redis-adapter`) + Redis sống, để kiểm chứng fan-out
 * qua Pub/Sub GIỮA 2 tiến trình thật. Môi trường phát triển hiện tại KHÔNG có
 * Redis sống (không có `docker`/`redis-cli` khả dụng để dựng — xem ghi chú
 * trong README/be.md của p0-03), và CI (`.github/workflows/ci.yml`) chỉ chạy
 * Redis thật trong job GitHub Actions, không thể xác minh cục bộ trước khi
 * nộp — nên KHÔNG dựng được bài test 2-instance-qua-Redis-Adapter-thật ở đây
 * với độ tin cậy đã tự chạy xanh.
 *
 * Bản đơn giản hoá này dùng 1 `http.Server`/`Server` Socket.IO THẬT (giống
 * mọi test khác trong p0-03) + nhiều client thật, để xác nhận ĐÚNG HỢP ĐỒNG
 * mà `@socket.io/redis-adapter` PHẢI giữ nguyên khi fan-out qua nhiều
 * instance: `emitToUsers`/`leaveRooms` (`socket.emit.ts`) phải tới được MỌI
 * socket của tập user đích (bất kể "thiết bị"/"instance" nào), và
 * `socket.registry.ts` (Redis HASH `conn:{userId}`) phải liệt kê đủ MỌI kết
 * nối đang mở của 1 user. Đây CHÍNH LÀ 2 cơ chế mà multi-instance thật dựa
 * vào — `@socket.io/redis-adapter` (đã có sẵn, thư viện bên thứ 3, không
 * phải mã tự viết) lo phần fan-out qua tiến trình khác; phần mã của p0-03 chỉ
 * cần gọi ĐÚNG API (`io.to()`, `socketsLeave()`) — không tự ý filter theo
 * instance hiện tại — điều bài test này xác nhận được mà không cần Redis thật.
 *
 * KHÔNG coi test này là bằng chứng đủ cho RT-09 — nếu cần xác nhận đầy đủ,
 * chạy thủ công trong môi trường có Redis (`docker compose -f
 * docker-compose.dev.yml up -d redis` rồi set `REDIS_URL`) hoặc thêm lại bản
 * đầy đủ khi CI đã xác nhận xanh ít nhất 1 lần.
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
import { emitToUsers, leaveRooms } from "../../socket.emit";
import { ROOM } from "../../socket.rooms";
import { registryList } from "../../socket.registry";
import { startHarness, stopHarness, connectClient, tokenFor, type Harness } from "./test-helpers";

function waitForEvent<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

describe("RT-09 (đơn giản hoá) — emitToUsers/leaveRooms/registry tới đủ mọi 'thiết bị' của 1 user", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await stopHarness(h);
  });

  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    (redis.connect as jest.Mock).mockRejectedValue(new Error("no redis in test"));
    (getUserStatusCached as jest.Mock).mockResolvedValue({
      status: "ACTIVE",
      sessionVersion: 1,
      showPresence: true,
    });
  });

  it("emitToUsers tới TẤT CẢ thiết bị đang mở của user đích, KHÔNG tới user khác", async () => {
    const userADevice1 = await connectClient(h.port, {
      token: tokenFor("user-a", "a@example.com"),
      deviceId: "dev-1",
    });
    const userADevice2 = await connectClient(h.port, {
      token: tokenFor("user-a", "a@example.com"),
      deviceId: "dev-2",
    });
    const userB = await connectClient(h.port, { token: tokenFor("user-b", "b@example.com") });

    const gotOnDevice1 = waitForEvent<{ v: number; hello: string }>(userADevice1, "test:broadcast");
    const gotOnDevice2 = waitForEvent<{ v: number; hello: string }>(userADevice2, "test:broadcast");
    let userBGot = false;
    userB.on("test:broadcast", () => {
      userBGot = true;
    });

    emitToUsers(["user-a"], "test:broadcast", { hello: "world" });

    const [p1, p2] = await Promise.all([gotOnDevice1, gotOnDevice2]);
    expect(p1).toMatchObject({ v: 1, hello: "world" });
    expect(p2).toMatchObject({ v: 1, hello: "world" });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(userBGot).toBe(false);

    userADevice1.disconnect();
    userADevice2.disconnect();
    userB.disconnect();
  });

  it("leaveRooms buộc socket rời room dù không tự socket.leave()", async () => {
    const client = await connectClient(h.port, { token: tokenFor("user-c", "c@example.com") });
    await new Promise<void>((resolve) => {
      client.emit("room:join", { kind: "user", id: "user-c" }, () => resolve());
    });

    // `user:{id}` là room server tự join lúc connect — dùng để kiểm chứng
    // leaveRooms tác động đúng room mà không cần guard riêng.
    leaveRooms(["user-c"], [ROOM.user("user-c")]);
    await new Promise((resolve) => setTimeout(resolve, 30));

    const socketsInRoom = await h.io.in(ROOM.user("user-c")).fetchSockets();
    expect(socketsInRoom).toHaveLength(0);
    expect(client.connected).toBe(true); // leaveRooms KHÔNG disconnect, chỉ rời room

    client.disconnect();
  });

  it("registry (conn:{userId}) liệt kê đủ mọi kết nối đang mở — mô phỏng nhiều 'instance' giữ socket của cùng 1 user", async () => {
    const device1 = await connectClient(h.port, {
      token: tokenFor("user-d", "d@example.com"),
      deviceId: "dev-1",
      platform: "ANDROID",
    });
    const device2 = await connectClient(h.port, {
      token: tokenFor("user-d", "d@example.com"),
      deviceId: "dev-2",
      platform: "WEB",
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const connections = await registryList("user-d");
    expect(Object.keys(connections)).toHaveLength(2);
    const platforms = Object.values(connections)
      .map((c) => c.platform)
      .sort();
    expect(platforms).toEqual(["ANDROID", "WEB"]);

    device1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterOneLeft = await registryList("user-d");
    expect(Object.keys(afterOneLeft)).toHaveLength(1);

    device2.disconnect();
  });
});
