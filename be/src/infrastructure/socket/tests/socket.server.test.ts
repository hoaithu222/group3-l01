import http from "http";
import type { AddressInfo } from "net";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { Server } from "socket.io";
import { initSocketServer } from "../socket.server";
import { registerRoomGuard, clearRoomGuards } from "../socket.rooms";
import { JwtUtils } from "../../../core/utils/jwt";
import { installFakeRedis, type FakeRedisMock } from "../../../core/permission/tests/fixtures/fake-redis";

// p0-03: connect/disconnect giờ đụng registry (`hset`/`hdel`) + presence
// (`hdel` lúc onDeviceDisconnect) — dùng chung fixture Map giả lập HASH thay
// vì mock rời rạc từng method như trước (thiếu method mới sẽ throw).
jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../core/permission/tests/fixtures/fake-redis");
  const mod = createFakeRedisModule();
  mod.redis.connect = jest.fn().mockRejectedValue(new Error("no redis in test"));
  return mod;
});

// verifyAccessContext (dùng chung với authenticateToken) gọi getUserStatusCached —
// mock ACTIVE + sessionVersion khớp với token phát ra trong các test bên dưới
// (đều dùng sv: 1) để hành vi io.use giữ nguyên như trước khi wire B2.
jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
}));

import { redis } from "../../../infrastructure/redis";
import { getUserStatusCached } from "../../../core/permission/user-status";

describe("socket.server — room:join thật qua socket.io-client", () => {
  let httpServer: http.Server;
  let io: Server;
  let port: number;
  let client: ClientSocket;

  beforeAll((done) => {
    httpServer = http.createServer();
    io = initSocketServer(httpServer);
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterAll((done) => {
    void io.close();
    httpServer.close(() => done());
  });

  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá mockImplementation trước MỖI
    // test — phải khai báo lại ở đây (không chỉ ở factory), nếu không
    // `getUserStatusCached` trả `undefined` khiến `verifyAccessContext` coi
    // user không tồn tại, và mọi method redis mới (hset/hdel/...) throw
    // "is not a function" vì `jest.fn()` trần chưa có implementation.
    installFakeRedis(redis as unknown as FakeRedisMock);
    (redis.connect as jest.Mock).mockRejectedValue(new Error("no redis in test"));
    (getUserStatusCached as jest.Mock).mockResolvedValue({
      status: "ACTIVE",
      sessionVersion: 1,
      showPresence: true,
    });
  });

  afterEach(() => {
    clearRoomGuards();
    if (client) client.disconnect();
  });

  function connect(token: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(`http://localhost:${port}`, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  }

  it("room:join với kind chưa có guard → ack { ok: false, code: PERM_404 }", async () => {
    const token = JwtUtils.generateAccessToken({
      userId: "u1",
      email: "u1@example.com",
      role: "user",
      sv: 1,
    });
    client = await connect(token);

    const ack = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      client.emit("room:join", { kind: "ch", id: "507f1f77bcf86cd799439011" }, resolve);
    });

    expect(ack).toEqual({ ok: false, code: "PERM_404" });
  });

  it("room:join với guard trả true → ack { ok: true }", async () => {
    registerRoomGuard("ch", () => Promise.resolve(true));
    const token = JwtUtils.generateAccessToken({
      userId: "u2",
      email: "u2@example.com",
      role: "user",
      sv: 1,
    });
    client = await connect(token);

    const ack = await new Promise<{ ok: boolean }>((resolve) => {
      client.emit("room:join", { kind: "ch", id: "507f1f77bcf86cd799439011" }, resolve);
    });

    expect(ack).toEqual({ ok: true });
  });

  it("kết nối không có token → connect_error", async () => {
    await expect(
      new Promise((resolve, reject) => {
        const socket = ioClient(`http://localhost:${port}`, {
          transports: ["websocket"],
          reconnection: false,
        });
        socket.on("connect", () => resolve(socket));
        socket.on("connect_error", (err) => reject(err));
      })
    ).rejects.toBeDefined();
  });
});
