import { setLiveKitEnv } from "../../../infrastructure/media/tests/livekit-test-utils";

setLiveKitEnv();

jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn(), getdel: jest.fn(), getClient: jest.fn() },
}));
jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { JwtUtils } from "../../../core/utils/jwt";
import { redis } from "../../../infrastructure/redis";
import { InMemoryMediaServer, NoopMediaServer, type IMediaServer, type MediaEgress } from "../../../infrastructure/media";
import { livekitRoomsActive } from "../../../infrastructure/metrics";
import type { IMediaAdminRepository } from "../media-admin.repo";
import { createMediaAdminRouter } from "../media-admin.routes";
import { MediaAdminService } from "../media-admin.service";

const HOUR = 3_600_000;
const egress = (status: MediaEgress["status"], endedAgoMs: number | null): MediaEgress => ({
  egressId: `EG_${status}_${endedAgoMs}`,
  roomName: "meet_x",
  status,
  startedAt: null,
  endedAt: endedAgoMs === null ? null : new Date(Date.now() - endedAgoMs).toISOString(),
  error: null,
  files: [],
});

const repo = (last: Date | null): IMediaAdminRepository => ({ lastLiveKitWebhookAt: () => Promise.resolve(last) });

describe("MediaAdminService.getStatus", () => {
  it("chưa cấu hình → MEDIA_001 (503)", async () => {
    const service = new MediaAdminService(repo(null), () => new NoopMediaServer());
    await expect(service.getStatus()).rejects.toMatchObject({ errorCode: "MEDIA_001", statusCode: 503 });
  });

  it("đủ số liệu: phòng, người, egress đang chạy, egress lỗi 24 h, webhook gần nhất", async () => {
    const server = new InMemoryMediaServer();
    server.join("call_a", { identity: "u1" });
    server.join("call_a", { identity: "u2" });
    server.join("meet_b", { identity: "u3" });
    const stub: IMediaServer = Object.assign(server, {
      listEgress: () =>
        Promise.resolve([
          egress("ACTIVE", null),
          egress("ENDING", null),
          egress("FAILED", HOUR),
          egress("ABORTED", 2 * HOUR),
          egress("FAILED", 30 * HOUR), // quá 24 h → không tính
          egress("COMPLETE", HOUR),
        ]),
    });
    const last = new Date("2026-09-21T10:00:00.000Z");
    const status = await new MediaAdminService(repo(last), () => stub).getStatus();
    expect(status).toMatchObject({
      configured: true,
      reachable: true,
      rooms: { active: 2, participants: 3 },
      egress: { active: 2, failed24h: 2 },
      lastWebhookAt: last.toISOString(),
    });
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    expect((await livekitRoomsActive.get()).values[0]?.value).toBe(2);
  });

  it("LiveKit không với tới → 200 reachable=false (trang admin cần thấy trạng thái), không ném", async () => {
    const server = new InMemoryMediaServer();
    server.failNext("listRooms");
    await expect(new MediaAdminService(repo(null), () => server).getStatus()).resolves.toEqual({
      configured: true, reachable: false, latencyMs: null, rooms: null, egress: null, lastWebhookAt: null,
    });
  });

  it("egress không khả dụng (LiveKit chạy không kèm egress) → egress=null, phần còn lại vẫn có", async () => {
    const server = new InMemoryMediaServer();
    server.failNext("listEgress");
    const status = await new MediaAdminService(repo(null), () => server).getStatus();
    expect(status).toMatchObject({ reachable: true, rooms: { active: 0, participants: 0 }, egress: null });
  });
});

describe("GET /admin/media/status (quyền)", () => {
  const server = new InMemoryMediaServer();
  const app = express();
  app.use("/api/v1/admin/media", createMediaAdminRouter(new MediaAdminService(repo(null), () => server)));
  app.use(notFoundHandler);
  app.use(errorHandler);

  const tokenFor = (role: string) => JwtUtils.generateAccessToken({ userId: "507f1f77bcf86cd799439011", email: "a@e.com", name: "A", role, sv: 1 });
  beforeEach(() => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    // `resetMocks` xoá mockImplementation; blacklist token kiểm `redis.get` phải trả `null` (không phải undefined).
    (redis.get as jest.Mock).mockResolvedValue(null);
  });

  it("không token → 401", async () => {
    expect((await request(app).get("/api/v1/admin/media/status")).status).toBe(401);
  });

  it("user thường → 403", async () => {
    expect((await request(app).get("/api/v1/admin/media/status").set("Authorization", `Bearer ${tokenFor("user")}`)).status).toBe(403);
  });

  it.each(["admin", "manager"])("%s (có system-config:view) → 200 với đúng dạng dữ liệu", async (role) => {
    const res = await request(app).get("/api/v1/admin/media/status").set("Authorization", `Bearer ${tokenFor(role)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ configured: true, reachable: true, rooms: { active: 0, participants: 0 } });
    // RIÊNG TƯ/BÍ MẬT: không lộ khoá, URL nội bộ hay danh tính người tham gia
    expect(JSON.stringify(res.body)).not.toMatch(/apiKey|apiSecret|secret|livekit\.test|APItestkey/i);
  });
});
