/**
 * Integration — `POST /admin/storage/cleanup` qua Express thật (middleware xác
 * thực/quyền/validate thật). BullMQ/Redis mock (môi trường dev không có Redis
 * sống) — chỉ kiểm hợp đồng HTTP: quyền, lý do bắt buộc, đúng jobId, audit.
 */
jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getdel: jest.fn().mockResolvedValue(null),
    getClient: jest.fn().mockReturnValue(null),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn();
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: (...args: unknown[]) => mockAuditRecord(...args) })),
}));

const mockGetJob = jest.fn();
const mockEnqueue = jest.fn();
jest.mock("../../../../infrastructure/queue", () => ({
  getQueue: jest.fn(),
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { redis } from "../../../../infrastructure/redis";
import { getQueue } from "../../../../infrastructure/queue";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import adminStorageRoutes from "../../admin-storage.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin/storage", adminStorageRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(role: string): string {
  return JwtUtils.generateAccessToken({ userId: "507f1f77bcf86cd799439011", email: "a@e.com", name: "A", role, sv: 1 });
}

const VALID_REASON = "Dọn tệp mồ côi trước đợt kiểm kê dung lượng";

describe("POST /admin/storage/cleanup (integration)", () => {
  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá mọi mockImplementation trước MỖI test.
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    (redis.del as jest.Mock).mockResolvedValue(undefined);
    (redis.getdel as jest.Mock).mockResolvedValue(null);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockAuditRecord.mockResolvedValue(undefined);
    (getQueue as jest.Mock).mockReturnValue({ getJob: mockGetJob });
    mockGetJob.mockResolvedValue(undefined);
    mockEnqueue.mockResolvedValue(undefined);
  });

  it("không token → 401", async () => {
    const res = await request(app).post("/api/v1/admin/storage/cleanup").send({ reason: VALID_REASON });
    expect(res.status).toBe(401);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("user thường và manager (chỉ system-config:view) → 403, không xếp job", async () => {
    for (const role of ["user", "manager"]) {
      const res = await request(app)
        .post("/api/v1/admin/storage/cleanup")
        .set("Authorization", `Bearer ${tokenFor(role)}`)
        .send({ reason: VALID_REASON });
      expect(res.status).toBe(403);
    }
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("thiếu hoặc quá ngắn (< 10 ký tự) lý do → 400 VAL_001, không xếp job", async () => {
    const missing = await request(app)
      .post("/api/v1/admin/storage/cleanup")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VAL_001");

    const short = await request(app)
      .post("/api/v1/admin/storage/cleanup")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ reason: "ngắn" });
    expect(short.status).toBe(400);
    expect(short.body.error.code).toBe("VAL_001");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("admin + lý do hợp lệ → 200, enqueue assets.cleanup jobId theo giờ, có audit", async () => {
    const res = await request(app)
      .post("/api/v1/admin/storage/cleanup")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ reason: VALID_REASON });

    expect(res.status).toBe(200);
    expect(res.body.data.alreadyQueued).toBe(false);
    expect(res.body.data.jobId).toMatch(/^assets\.cleanup:manual:\d{10}$/);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "cron",
      "assets.cleanup",
      expect.objectContaining({ trigger: "manual" }),
      { jobId: res.body.data.jobId }
    );
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "system.storage-cleanup",
        targetType: "QueueJob",
        reason: VALID_REASON,
      })
    );
  });

  it("giờ này đã có lượt thủ công → 200 alreadyQueued=true, không xếp thêm/không audit", async () => {
    mockGetJob.mockResolvedValue({ id: "da-co" });

    const res = await request(app)
      .post("/api/v1/admin/storage/cleanup")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ reason: VALID_REASON });

    expect(res.status).toBe(200);
    expect(res.body.data.alreadyQueued).toBe(true);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockAuditRecord).not.toHaveBeenCalled();
  });
});
