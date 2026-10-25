/**
 * Integration — `GET /admin/notifications/stats` (p1-07 be.md §4): quyền `system-config:view`, validate `range`,
 * tổng hợp bộ đếm Redis theo giờ/ngày (không định danh người dùng), p95 fan-out từ histogram bucket.
 */
jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(), disconnect: jest.fn(), ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(),
    getdel: jest.fn(), incr: jest.fn(), incrBy: jest.fn(), expire: jest.fn(), exists: jest.fn(), setNx: jest.fn(),
    hset: jest.fn(), hgetall: jest.fn(), hdel: jest.fn(), scanKeys: jest.fn(), getClient: jest.fn(),
  },
}));
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bucketsFor, STAT } from "../../../notifications/services/notification-stats";
import { makeRedisStore, wireRedisMocks, tokenFor } from "../../../conversations/tests/integration/test-utils";
import adminNotificationsRoutes from "../../admin-notifications.routes";

const app = express();
app.use(express.json());
app.use("/api/v1/admin/notifications", adminNotificationsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const store = makeRedisStore();
const ADMIN = "64b000000000000000000001";
const USER = "64b000000000000000000002";

describe("GET /admin/notifications/stats (integration)", () => {
  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    store.clear();
  });

  const get = (userId: string, role: string, qs = "") =>
    request(app).get(`/api/v1/admin/notifications/stats${qs}`).set("Authorization", `Bearer ${tokenFor(userId, role)}`);

  it("người dùng thường → 403; chưa đăng nhập → 401; range lạ → 400", async () => {
    expect((await get(USER, "user")).status).toBe(403);
    expect((await request(app).get("/api/v1/admin/notifications/stats")).status).toBe(401);
    expect((await get(ADMIN, "admin", "?range=30d")).status).toBe(400);
  });

  it("chưa có số liệu → toàn số 0, fanoutP95Ms null (không lỗi)", async () => {
    const res = await get(ADMIN, "admin");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      range: "24h",
      pushSent: 0,
      pushFailed: 0,
      invalidTokensRemoved: 0,
      suppressed: { muted: 0, dnd: 0, viewing: 0, read: 0, blocked: 0 },
      fanoutP95Ms: null,
      inboxCreated: 0,
      byType: { "message.new": 0, mention: 0, "thread.reply": 0 },
      limits: {
        pushBatchWindowSeconds: 10,
        inboxRetentionDays: 90,
        fanoutChunkSize: 500,
        maxDevicesPerUser: 10,
        statsRetentionDays: 8,
      },
    });
  });

  it("24h cộng các bucket giờ; 7d cộng các bucket ngày; p95 lấy từ histogram", async () => {
    const [h0, h1] = bucketsFor("24h");
    const [d0] = bucketsFor("7d");
    const put = (metric: string, bucket: string, n: number) => store.redisStore.set(`notif:stat:${metric}:${bucket}`, n);
    put(STAT.pushSent, h0!, 10);
    put(STAT.pushSent, h1!, 5);
    put(STAT.pushFailed, h0!, 2);
    put(STAT.suppressed("muted"), h0!, 7);
    put(STAT.suppressed("viewing"), h1!, 3);
    put(STAT.byType("mention"), h0!, 4);
    put(STAT.inboxCreated, h0!, 9);
    put(STAT.fanout("le100"), h0!, 90);
    put(STAT.fanout("le1000"), h0!, 6);
    put(STAT.fanout("le3000"), h0!, 4);
    put(STAT.pushSent, d0!, 100);

    const day = await get(ADMIN, "admin", "?range=24h");
    expect(day.body.data).toMatchObject({
      range: "24h", pushSent: 15, pushFailed: 2, inboxCreated: 9, fanoutP95Ms: 1000,
      suppressed: { muted: 7, viewing: 3, dnd: 0 }, byType: { mention: 4 },
    });

    const week = await get(ADMIN, "admin", "?range=7d");
    expect(week.body.data).toMatchObject({ range: "7d", pushSent: 100 });
    // Không có trường định danh người dùng
    expect(JSON.stringify(week.body.data)).not.toMatch(/userId|email/);
  });
});
