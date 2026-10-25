/**
 * Integration — `GET /admin/push/status`, `GET /admin/push/stats` (p0-06 admin.md
 * §2.1/§2.3) và ma trận quyền của `/admin/push/*` qua HTTP thật (supertest) trên
 * Prisma thật (Mongo memory replset, `TEST_DB=memory`). `infrastructure/push`
 * mock để kiểm soát "đã cấu hình/chưa" tất định; Redis mock (dev không có
 * Redis sống — giống `system-config.routes.test.ts`).
 */
jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
    getClient: jest.fn(),
    ping: jest.fn(),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn(),
}));

const mockIsPushConfigured = jest.fn();
const mockIsVoipConfigured = jest.fn();
jest.mock("../../../../infrastructure/push", () => ({
  getPushSender: () => ({ sendMulticast: jest.fn() }),
  getVoipSender: () => ({ send: jest.fn() }),
  isPushConfigured: () => mockIsPushConfigured(),
  isVoipConfigured: () => mockIsVoipConfigured(),
}));

let mockPushFlag = true;
jest.mock("../../../../core/constants/modules", () => ({
  ...jest.requireActual("../../../../core/constants/modules"),
  isModuleEnabled: () => mockPushFlag,
}));

const mockAuditRecord = jest.fn();
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import express from "express";
import request from "supertest";
import { env } from "../../../../core/config";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { redis } from "../../../../infrastructure/redis";
import adminPushRoutes from "../../admin-push.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin/push", adminPushRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(role: string): string {
  return JwtUtils.generateAccessToken({ userId: "507f1f77bcf86cd799439011", email: "a@e.com", name: "A", role, sv: 1 });
}

describe("/admin/push (integration — Mongo memory replset)", () => {
  beforeEach(() => {
    // `resetMocks: true` xoá mọi mockImplementation trước MỖI test — khai báo lại ở đây.
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockAuditRecord.mockResolvedValue(undefined);
    mockIsPushConfigured.mockReturnValue(true);
    mockIsVoipConfigured.mockReturnValue(false);
    mockPushFlag = true;
  });

  describe("GET /status", () => {
    it("admin → 200, FCM đã cấu hình, VoIP chưa (environment null)", async () => {
      const res = await request(app).get("/api/v1/admin/push/status").set("Authorization", `Bearer ${tokenFor("admin")}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        pushEnabled: true,
        fcm: { configured: true },
        voip: { configured: false, environment: null },
      });
    });

    it("thiếu credentials + cờ push tắt → báo đúng, không lỗi", async () => {
      mockIsPushConfigured.mockReturnValue(false);
      mockPushFlag = false;
      const res = await request(app).get("/api/v1/admin/push/status").set("Authorization", `Bearer ${tokenFor("admin")}`);
      expect(res.status).toBe(200);
      expect(res.body.data.pushEnabled).toBe(false);
      expect(res.body.data.fcm.configured).toBe(false);
    });

    it("VoIP đã cấu hình → environment theo APNS_USE_SANDBOX", async () => {
      mockIsVoipConfigured.mockReturnValue(true);
      const res = await request(app).get("/api/v1/admin/push/status").set("Authorization", `Bearer ${tokenFor("admin")}`);
      expect(res.body.data.voip).toEqual({
        configured: true,
        environment: env.APNS_USE_SANDBOX ? "SANDBOX" : "PRODUCTION",
      });
    });

    it("RIÊNG TƯ: không lộ khoá/secret/định danh dù env có giá trị", async () => {
      mockIsVoipConfigured.mockReturnValue(true);
      const mutable = env as unknown as Record<string, unknown>;
      const original = {
        FIREBASE_PROJECT_ID: mutable.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: mutable.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: mutable.FIREBASE_PRIVATE_KEY,
        APNS_KEY_ID: mutable.APNS_KEY_ID,
        APNS_TEAM_ID: mutable.APNS_TEAM_ID,
        APNS_KEY_P8: mutable.APNS_KEY_P8,
      };
      Object.assign(mutable, {
        FIREBASE_PROJECT_ID: "leak-project-id",
        FIREBASE_CLIENT_EMAIL: "leak@leak-project.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----leak-private-key",
        APNS_KEY_ID: "LEAKKEYID1",
        APNS_TEAM_ID: "LEAKTEAM12",
        APNS_KEY_P8: "-----BEGIN PRIVATE KEY-----leak-p8",
      });
      try {
        const res = await request(app).get("/api/v1/admin/push/status").set("Authorization", `Bearer ${tokenFor("admin")}`);
        expect(res.status).toBe(200);
        for (const needle of ["leak", "LEAK", "PRIVATE KEY"]) expect(res.text).not.toContain(needle);
        // Chỉ đúng các khoá đã khai báo — không có khoá lạ nào lọt ra.
        expect(Object.keys(res.body.data).sort()).toEqual(["fcm", "pushEnabled", "voip"]);
        expect(Object.keys(res.body.data.fcm)).toEqual(["configured"]);
        expect(Object.keys(res.body.data.voip).sort()).toEqual(["configured", "environment"]);
      } finally {
        Object.assign(mutable, original);
      }
    });

    it("manager (system-config:view) → 200; user → 403; không token → 401", async () => {
      const manager = await request(app).get("/api/v1/admin/push/status").set("Authorization", `Bearer ${tokenFor("manager")}`);
      expect(manager.status).toBe(200);

      const user = await request(app).get("/api/v1/admin/push/status").set("Authorization", `Bearer ${tokenFor("user")}`);
      expect(user.status).toBe(403);

      const anon = await request(app).get("/api/v1/admin/push/status");
      expect(anon.status).toBe(401);
    });
  });

  describe("GET /stats", () => {
    it("admin → 200, đúng hình dạng (số không âm, byReason là bản đồ)", async () => {
      const res = await request(app).get("/api/v1/admin/push/stats").set("Authorization", `Bearer ${tokenFor("admin")}`);
      expect(res.status).toBe(200);
      const { generatedAt, push24h, tokensRevoked7d } = res.body.data;
      expect(Number.isNaN(Date.parse(generatedAt))).toBe(false);
      expect(push24h.sent).toBeGreaterThanOrEqual(0);
      expect(push24h.failed).toBeGreaterThanOrEqual(0);
      expect(push24h.skipped.total).toBeGreaterThanOrEqual(0);
      expect(typeof push24h.skipped.byReason).toBe("object");
      expect(tokensRevoked7d.total).toBeGreaterThanOrEqual(0);
      expect(typeof tokensRevoked7d.byReason).toBe("object");
    });

    it("manager → 200; user → 403", async () => {
      const manager = await request(app).get("/api/v1/admin/push/stats").set("Authorization", `Bearer ${tokenFor("manager")}`);
      expect(manager.status).toBe(200);
      const user = await request(app).get("/api/v1/admin/push/stats").set("Authorization", `Bearer ${tokenFor("user")}`);
      expect(user.status).toBe(403);
    });
  });

  describe("POST /test — ma trận quyền", () => {
    const body = { userId: "507f1f77bcf86cd799439012", type: "message.new", reason: "Kiểm tra push đầu năm học mới" };

    it("manager (chỉ system-config:view) → 403, không audit", async () => {
      const res = await request(app).post("/api/v1/admin/push/test").set("Authorization", `Bearer ${tokenFor("manager")}`).send(body);
      expect(res.status).toBe(403);
      expect(mockAuditRecord).not.toHaveBeenCalled();
    });

    it("admin thiếu lý do → 400 VAL_001", async () => {
      const res = await request(app)
        .post("/api/v1/admin/push/test")
        .set("Authorization", `Bearer ${tokenFor("admin")}`)
        .send({ userId: body.userId, type: "message.new" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    });

    it("admin, push chưa cấu hình → 503 PUSH_001", async () => {
      mockIsPushConfigured.mockReturnValue(false);
      const res = await request(app).post("/api/v1/admin/push/test").set("Authorization", `Bearer ${tokenFor("admin")}`).send(body);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("PUSH_001");
    });
  });
});
