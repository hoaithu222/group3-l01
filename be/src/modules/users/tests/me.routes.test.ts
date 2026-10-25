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

// Repo: dùng in-memory thay PrismaUserRepository — `PATCH /me/privacy` chỉ
// đi qua `this.repo` (không chạm Prisma trực tiếp) nên test được đầy đủ ở
// đây. `POST /me/delete-request|delete-cancel` chạm Prisma trực tiếp
// (`UserService.requestDeletion/cancelDeletion` — xem comment trong
// `user.service.ts`) nên chỉ test được phần validate/guard KHÔNG cần DB thật
// ở file này; luồng đầy đủ đã có `tests/integration/delete-request.test.ts`.
jest.mock("../repositories", () => {
  const { InMemoryUserRepository } = jest.requireActual("../repositories/user.repository.inmemory");
  return { PrismaUserRepository: InMemoryUserRepository };
});

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

import meRoutes from "../me.routes";
import { InMemoryUserRepository } from "../repositories/user.repository.inmemory";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { redis } from "../../../infrastructure/redis";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/me", meRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(id: string, email: string): string {
  return JwtUtils.generateAccessToken({ userId: id, email, name: "T", role: "user", sv: 1 });
}

describe("me.routes", () => {
  beforeEach(() => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    InMemoryUserRepository.clearStore();
  });

  it("POST /me/delete-request chưa đăng nhập → 401", async () => {
    const res = await request(app).post("/api/v1/me/delete-request").send({ password: "x" });
    expect(res.status).toBe(401);
  });

  it("POST /me/delete-request thiếu password → 400 (validate)", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("Sup3rSecret!", 10);
    const user = await repo.create({ email: "a@e.com", name: "A", passwordHash, role: "user" });
    const token = tokenFor(user.id, user.email);

    const res = await request(app)
      .post("/api/v1/me/delete-request")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("POST /me/delete-cancel thiếu email/password → 400 (validate, không cần token)", async () => {
    const res = await request(app).post("/api/v1/me/delete-cancel").send({ email: "a@e.com" });
    expect(res.status).toBe(400);
  });

  it("PATCH /me/privacy chưa đăng nhập → 401", async () => {
    const res = await request(app).patch("/api/v1/me/privacy").send({ showPresence: false });
    expect(res.status).toBe(401);
  });

  it("PATCH /me/privacy body rỗng → 400 (refine cần ít nhất 1 field)", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("x", 10);
    const user = await repo.create({ email: "b@e.com", name: "B", passwordHash, role: "user" });
    const token = tokenFor(user.id, user.email);

    const res = await request(app)
      .patch("/api/v1/me/privacy")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("PATCH /me/privacy hợp lệ → 200, trả UserPrivacy đã merge", async () => {
    const repo = new InMemoryUserRepository();
    const passwordHash = await bcrypt.hash("x", 10);
    const user = await repo.create({ email: "c@e.com", name: "C", passwordHash, role: "user" });
    const token = tokenFor(user.id, user.email);

    const res = await request(app)
      .patch("/api/v1/me/privacy")
      .set("Authorization", `Bearer ${token}`)
      .send({ showPresence: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      readReceipts: true,
      showPresence: false,
      showInLeaderboard: true,
      showGamification: true,
      // Mặc định cho phép người khác tìm thấy (khớp CHÍNH XÁC email/SĐT) — người dùng tắt được.
      findableByEmail: true,
      findableByPhone: true,
    });
  });

  it("PATCH /me/privacy tắt findableByPhone → chỉ cờ đó đổi, các cờ khác giữ mặc định", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({ email: "d@e.com", name: "D", passwordHash: await bcrypt.hash("x", 10), role: "user" });

    const res = await request(app)
      .patch("/api/v1/me/privacy")
      .set("Authorization", `Bearer ${tokenFor(user.id, user.email)}`)
      .send({ findableByPhone: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ findableByEmail: true, findableByPhone: false, readReceipts: true });
    expect((await repo.findById(user.id))?.privacy?.findableByPhone).toBe(false);
  });
});

describe("PATCH /me/phone", () => {
  beforeEach(() => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    InMemoryUserRepository.clearStore();
  });

  async function seedUser() {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({ email: "p@e.com", name: "P", passwordHash: await bcrypt.hash("x", 10), role: "user" });
    return { repo, user, auth: { Authorization: `Bearer ${tokenFor(user.id, user.email)}` } };
  }

  it("chưa đăng nhập → 401", async () => {
    const res = await request(app).patch("/api/v1/me/phone").send({ phone: "0912345678" });
    expect(res.status).toBe(401);
  });

  it.each([
    ["0912 345 678", "+84912345678"],
    ["+84 912.345.678", "+84912345678"],
    ["84912345678", "+84912345678"],
  ])("lưu %s dưới dạng E.164 %s", async (input, expected) => {
    const { repo, user, auth } = await seedUser();
    const res = await request(app).patch("/api/v1/me/phone").set(auth).send({ phone: input });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ phone: expected });
    expect((await repo.findById(user.id))?.phone).toBe(expected);
  });

  it("phone: null → xoá số", async () => {
    const { repo, user, auth } = await seedUser();
    await request(app).patch("/api/v1/me/phone").set(auth).send({ phone: "0912345678" });
    const res = await request(app).patch("/api/v1/me/phone").set(auth).send({ phone: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ phone: null });
    expect((await repo.findById(user.id))?.phone).toBeNull();
  });

  it.each([["abc"], ["0912"], [""], ["0112345678"]])("số không hợp lệ %j → 400", async (phone) => {
    const { auth } = await seedUser();
    const res = await request(app).patch("/api/v1/me/phone").set(auth).send({ phone });
    expect(res.status).toBe(400);
  });

  it("thiếu phone hoặc gửi field lạ → 400 (strict)", async () => {
    const { auth } = await seedUser();
    expect((await request(app).patch("/api/v1/me/phone").set(auth).send({})).status).toBe(400);
    expect((await request(app).patch("/api/v1/me/phone").set(auth).send({ phone: "0912345678", role: "admin" })).status).toBe(400);
  });
});
