import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { JwtUtils } from "../../../core/utils/jwt";

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

// Repo: dùng in-memory thay PrismaUserRepository.
jest.mock("../repositories", () => {
  const { InMemoryUserRepository } = jest.requireActual("../repositories/user.repository.inmemory");
  return { PrismaUserRepository: InMemoryUserRepository };
});

// SessionService / AuditService — chỉ cần no-op vì test này không kiểm session thật.
jest.mock("../../auth/services/session.service", () => ({
  SessionService: jest.fn().mockImplementation(() => ({
    revokeAll: jest.fn().mockResolvedValue(undefined),
    listActive: jest.fn().mockResolvedValue([]),
    revoke: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock("../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({
    record: jest.fn().mockResolvedValue(undefined),
  })),
}));

import userRoutes from "../user.routes";
import { InMemoryUserRepository } from "../repositories/user.repository.inmemory";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { redis } from "../../../infrastructure/redis";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/users", userRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(id: string, role: string, email: string): string {
  return JwtUtils.generateAccessToken({ userId: id, email, name: "T", role, sv: 1 });
}

describe("user.routes", () => {
  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá implementation trước MỖI test.
    (redis.get as jest.Mock).mockResolvedValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    InMemoryUserRepository.clearStore();
  });

  it("user thường GET /users → 403 (thiếu user:view)", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("x", 10);
    const plain = await repo.create({
      email: "plain@e.com",
      name: "Plain",
      passwordHash,
      role: "user",
    });
    const token = tokenFor(plain.id, "user", plain.email);

    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("tự PATCH gửi kèm role → role bị bỏ qua, chỉ name đổi", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("x", 10);
    const self = await repo.create({
      email: "self@e.com",
      name: "Old Name",
      passwordHash,
      role: "user",
    });
    const token = tokenFor(self.id, "user", self.email);

    const res = await request(app)
      .patch(`/api/v1/users/${self.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name", role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("New Name");
    expect(res.body.data.role).toBe("user"); // role KHÔNG đổi dù gửi kèm trong body
  });

  it("admin có quyền user:view GET /users → 200", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("x", 10);
    const admin = await repo.create({
      email: "admin@e.com",
      name: "Admin",
      passwordHash,
      role: "admin",
    });
    const token = tokenFor(admin.id, "admin", admin.email);

    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  // ─── POST /:id/anonymize (be.md p0-01 §4) — guard clause không chạm Prisma thật ──
  describe("POST /:id/anonymize", () => {
    it("manager (thiếu user:delete) → 403", async () => {
      const repo = new InMemoryUserRepository();
      const passwordHash = await bcrypt.hash("x", 10);
      const manager = await repo.create({
        email: "manager@e.com",
        name: "Manager",
        passwordHash,
        role: "manager",
      });
      const target = await repo.create({
        email: "target@e.com",
        name: "Target",
        passwordHash,
        role: "user",
      });
      const token = tokenFor(manager.id, "manager", manager.email);

      const res = await request(app)
        .post(`/api/v1/users/${target.id}/anonymize`)
        .set("Authorization", `Bearer ${token}`)
        .send({ mode: "GRACE", reason: "Vi phạm điều khoản sử dụng nghiêm trọng" });

      expect(res.status).toBe(403);
    });

    it("mode NOW thiếu confirmEmail → 400 (Zod refine)", async () => {
      const repo = new InMemoryUserRepository();
      const passwordHash = await bcrypt.hash("x", 10);
      const admin = await repo.create({
        email: "admin2@e.com",
        name: "Admin",
        passwordHash,
        role: "admin",
      });
      const target = await repo.create({
        email: "target2@e.com",
        name: "Target",
        passwordHash,
        role: "user",
      });
      const token = tokenFor(admin.id, "admin", admin.email);

      const res = await request(app)
        .post(`/api/v1/users/${target.id}/anonymize`)
        .set("Authorization", `Bearer ${token}`)
        .send({ mode: "NOW", reason: "Vi phạm điều khoản sử dụng nghiêm trọng" });

      expect(res.status).toBe(400);
    });

    it("admin tự nhắm chính mình → 400 USER_014 (guard trước khi chạm DB)", async () => {
      const repo = new InMemoryUserRepository();
      const passwordHash = await bcrypt.hash("x", 10);
      const admin = await repo.create({
        email: "admin3@e.com",
        name: "Admin",
        passwordHash,
        role: "admin",
      });
      const token = tokenFor(admin.id, "admin", admin.email);

      const res = await request(app)
        .post(`/api/v1/users/${admin.id}/anonymize`)
        .set("Authorization", `Bearer ${token}`)
        .send({ mode: "GRACE", reason: "Vi phạm điều khoản sử dụng nghiêm trọng" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("USER_014");
    });
  });

  it("POST /:id/anonymize/cancel — manager (thiếu user:delete) → 403", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("x", 10);
    const manager = await repo.create({
      email: "manager2@e.com",
      name: "Manager",
      passwordHash,
      role: "manager",
    });
    const target = await repo.create({
      email: "target3@e.com",
      name: "Target",
      passwordHash,
      role: "user",
    });
    const token = tokenFor(manager.id, "manager", manager.email);

    const res = await request(app)
      .post(`/api/v1/users/${target.id}/anonymize/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Xác minh lại danh tính người dùng" });

    expect(res.status).toBe(403);
  });
});
