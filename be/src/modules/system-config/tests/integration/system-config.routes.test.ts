/**
 * Integration — `/admin/system-config/*` trên Prisma thật (Mongo memory
 * replset, `TEST_DB=memory`) — CFG-04/05/07/08 (be.md §10). Redis mock (môi
 * trường dev không có Redis sống, giống `admin-push`/`multi-instance` test) —
 * `RuntimeConfigService` fail-open về Mongo trực tiếp khi cache miss, đúng
 * hành vi thật của 1 instance không có Redis.
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

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { initRuntimeConfig, resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { PrismaSystemConfigRepository } from "../../repositories/system-config.repository.prisma";
import systemConfigRoutes from "../../system-config.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin/system-config", systemConfigRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(role: string): string {
  return JwtUtils.generateAccessToken({ userId: "507f1f77bcf86cd799439011", email: "a@e.com", name: "A", role, sv: 1 });
}

describe("/admin/system-config (integration — Mongo memory replset)", () => {
  beforeAll(async () => {
    initRuntimeConfig(new PrismaSystemConfigRepository());
    // Mongo in-memory KHÔNG tự có unique index (production có nhờ `db push`): tạo tay để ca "cùng cửa sổ debounce" chạy trên ràng buộc thật.
    await prisma.$runCommandRaw({
      createIndexes: "OutboxEvent",
      indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }],
    });
  });

  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá mọi mockImplementation trước MỖI
    // test — phải khai báo lại giá trị mặc định ở đây, không chỉ ở factory
    // (giống `auth.routes.test.ts`/`user.routes.test.ts`).
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    (redis.del as jest.Mock).mockResolvedValue(undefined);
    (redis.getdel as jest.Mock).mockResolvedValue(null);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    await prisma.systemConfig.deleteMany({ where: { key: { in: ["limits.message", "limits.conversation", "features"] } } });
    await prisma.outboxEvent.deleteMany({ where: { type: "config.changed" } });
    resetRuntimeConfig();
    initRuntimeConfig(new PrismaSystemConfigRepository());
    mockAuditRecord.mockClear();
  });

  it("CFG-07: user thường GET → 403 (thiếu system-config:view)", async () => {
    const res = await request(app)
      .get("/api/v1/admin/system-config")
      .set("Authorization", `Bearer ${tokenFor("user")}`);
    expect(res.status).toBe(403);
  });

  it("manager GET → 200, PUT → 403 (chỉ system-config:view)", async () => {
    const list = await request(app)
      .get("/api/v1/admin/system-config")
      .set("Authorization", `Bearer ${tokenFor("manager")}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const put = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("manager")}`)
      .send({ value: { maxChars: 2000 }, expectedVersion: 0, reason: "Thử sửa dù chỉ có quyền xem" });
    expect(put.status).toBe(403);
  });

  it("CFG-07: thiếu reason (< 10 ký tự) → 400 VAL_001", async () => {
    const res = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { maxChars: 2000 }, expectedVersion: 0, reason: "ngắn" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VAL_001");
  });

  it("CFG-01/03/08: PUT hợp lệ → 200, GET/capabilities phản ánh, có audit before/after", async () => {
    const put = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { maxChars: 2000 }, expectedVersion: 0, reason: "Giảm trần tin nhắn theo yêu cầu vận hành" });
    expect(put.status).toBe(200);
    expect(put.body.data.stored.maxChars).toBe(2000);
    expect(put.body.data.effective.maxChars).toBe(2000);
    expect(put.body.data.version).toBe(1);
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "system-config.update",
        targetId: "limits.message",
        metadata: expect.objectContaining({ value: { maxChars: 2000 }, version: 1 }),
      })
    );

    const getOne = await request(app)
      .get("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(getOne.body.data.stored.maxChars).toBe(2000);
  });

  it("CFG-05: hai admin sửa cùng khoá với version cũ → 1 thành công, 1 409 RES_003 kèm currentVersion", async () => {
    await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { maxChars: 2000 }, expectedVersion: 0, reason: "Sửa lần đầu để tạo document" });

    const conflict = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { maxChars: 1500 }, expectedVersion: 0, reason: "Một admin khác sửa cùng lúc với version cũ" });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("RES_003");
    expect(conflict.body.error.details.currentVersion).toBe(1);
  });

  it("hai PUT khác khoá trong CÙNG cửa sổ debounce → cả hai 200 và chỉ MỘT outbox config.changed (unique dedupeKey không làm hỏng transaction)", async () => {
    // Cố định đồng hồ để hai lần ghi chắc chắn rơi vào một cửa sổ (mặc định 2 s) dù máy chậm — `restoreMocks` khôi phục sau test.
    jest.spyOn(Date, "now").mockReturnValue(Date.now());
    const admin = `Bearer ${tokenFor("admin")}`;

    const first = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", admin)
      .send({ value: { maxChars: 1800 }, expectedVersion: 0, reason: "Giảm trần tin nhắn (lần một)" });
    const second = await request(app)
      .put("/api/v1/admin/system-config/limits.conversation")
      .set("Authorization", admin)
      .send({ value: { pinMax: 5 }, expectedVersion: 0, reason: "Giảm số tin ghim (lần hai)" });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.body.data.stored.pinMax).toBe(5); // thay đổi của lần hai KHÔNG bị mất vì transaction hỏng
    expect(await prisma.outboxEvent.count({ where: { type: "config.changed" } })).toBe(1);
    expect(await prisma.systemConfig.count({ where: { key: { in: ["limits.message", "limits.conversation"] } } })).toBe(2);
  });

  it("CFG-04: vượt trần cho phép → 400 CFG_002 kèm floor/ceil", async () => {
    const res = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { maxChars: 999999 }, expectedVersion: 0, reason: "Thử vượt trần cho phép hệ thống" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CFG_002");
    expect(res.body.error.details.path).toBe("maxChars");
  });

  it("CFG-09: bật cờ module chưa available → 409 CFG_003", async () => {
    const res = await request(app)
      .put("/api/v1/admin/system-config/features")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { communication: true }, expectedVersion: 0, reason: "Bật thử nhắn tin cho toàn hệ thống" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CFG_003");
  });

  it("bật cờ AI → 422 CFG_004", async () => {
    const res = await request(app)
      .put("/api/v1/admin/system-config/features")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { ai: true }, expectedVersion: 0, reason: "Thử bật AI xem còn chặn không" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CFG_004");
  });

  it("khoá không tồn tại trong registry → 404 CFG_001", async () => {
    const res = await request(app)
      .get("/api/v1/admin/system-config/khongtontai")
      .set("Authorization", `Bearer ${tokenFor("admin")}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CFG_001");
  });

  it("reset: đưa khoá về mặc định (stored={}), tăng version, có audit", async () => {
    const put = await request(app)
      .put("/api/v1/admin/system-config/limits.message")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ value: { maxChars: 2000 }, expectedVersion: 0, reason: "Giảm trần tin nhắn theo yêu cầu vận hành" });
    expect(put.status).toBe(200);

    const reset = await request(app)
      .post("/api/v1/admin/system-config/limits.message/reset")
      .set("Authorization", `Bearer ${tokenFor("admin")}`)
      .send({ expectedVersion: 1, reason: "Đưa về mặc định hệ thống theo yêu cầu" });
    expect(reset.status).toBe(200);
    expect(reset.body.data.stored).toEqual({});
    expect(reset.body.data.version).toBe(2);
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "system-config.reset" }));
  });
});
