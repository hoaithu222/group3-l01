import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { JwtUtils } from "../../../core/utils/jwt";

/**
 * Rà soát auth BE 2026-09-25 — lớp HTTP của `modules/users`: quyền trên PATCH/khoá, chuẩn hoá & luật DTO,
 * che `deviceId` khi quản trị viên xem phiên của người khác, ObjectId ở tham số phiên. Không chạm DB thật:
 * repo in-memory, SessionService/AuditService giả (hàm thường — `resetMocks: true` xoá implementation của jest.fn).
 */
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

jest.mock("../repositories", () => {
  const { InMemoryUserRepository } = jest.requireActual("../repositories/user.repository.inmemory");
  return { PrismaUserRepository: InMemoryUserRepository };
});

const calls: { revokeAll: unknown[][]; revoke: unknown[][]; listActive: unknown[][]; audit: Record<string, unknown>[] } = {
  revokeAll: [],
  revoke: [],
  listActive: [],
  audit: [],
};
const sessionRows = [
  {
    id: "66f1b2c3d4e5f60718293a01",
    userAgent: "UA",
    ipAddress: "1.1.1.1",
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    isCurrent: false,
    authMethod: "PASSWORD",
    deviceId: "device-abcdef123456",
  },
];

jest.mock("../../auth/services/session.service", () => ({
  SessionService: class {
    revokeAll(...args: unknown[]): Promise<number> {
      calls.revokeAll.push(args);
      return Promise.resolve(1);
    }
    listActive(...args: unknown[]): Promise<unknown[]> {
      calls.listActive.push(args);
      return Promise.resolve(sessionRows);
    }
    revoke(...args: unknown[]): Promise<void> {
      calls.revoke.push(args);
      return Promise.resolve();
    }
  },
}));
jest.mock("../../audit-log/audit-log.service", () => ({
  AuditService: class {
    record(input: Record<string, unknown>): Promise<void> {
      calls.audit.push(input);
      return Promise.resolve();
    }
  },
}));

import userRoutes from "../user.routes";
import { InMemoryUserRepository } from "../repositories/user.repository.inmemory";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { redis } from "../../../infrastructure/redis";

const app = express();
app.use(express.json());
app.use("/api/v1/users", userRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const bearer = (id: string, role: string, email: string): [string, string] => [
  "Authorization",
  `Bearer ${JwtUtils.generateAccessToken({ userId: id, email, name: "T", role, sv: 1 })}`,
];

async function seed(email: string, role: "admin" | "manager" | "user") {
  const repo = new InMemoryUserRepository();
  return repo.create({ email, name: email.split("@")[0], passwordHash: await bcrypt.hash("x", 4), role });
}

describe("user.routes — rà soát bảo mật", () => {
  beforeEach(() => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    InMemoryUserRepository.clearStore();
    calls.revokeAll = [];
    calls.revoke = [];
    calls.listActive = [];
    calls.audit = [];
  });

  describe("PATCH /users/:id (admin)", () => {
    it("đổi vai trò người khác qua PATCH: có hiệu lực NGAY (thu hồi phiên) và có audit user.update", async () => {
      const admin = await seed("admin@e.com", "admin");
      const target = await seed("target@e.com", "user");

      const res = await request(app)
        .patch(`/api/v1/users/${target.id}`)
        .set(...bearer(admin.id, "admin", admin.email))
        .send({ role: "manager" });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe("manager");
      expect(calls.revokeAll).toHaveLength(1);
      expect(calls.revokeAll[0]?.[0]).toBe(target.id);
      expect(calls.audit).toEqual([
        expect.objectContaining({ actorId: admin.id, action: "user.update", targetId: target.id }),
      ]);
    });

    it("admin tự đổi vai trò của mình qua PATCH → 400 (như /users/:id/role), không thu hồi phiên", async () => {
      const admin = await seed("admin@e.com", "admin");

      const res = await request(app)
        .patch(`/api/v1/users/${admin.id}`)
        .set(...bearer(admin.id, "admin", admin.email))
        .send({ role: "user" });

      expect(res.status).toBe(400);
      expect(calls.revokeAll).toHaveLength(0);
    });

    it("mật khẩu do admin đặt phải 8–128 ký tự; email được chuẩn hoá chữ thường", async () => {
      const admin = await seed("admin@e.com", "admin");
      const target = await seed("target@e.com", "user");
      const auth = bearer(admin.id, "admin", admin.email);

      const weak = await request(app).patch(`/api/v1/users/${target.id}`).set(...auth).send({ password: "1234567" });
      const tooLong = await request(app).patch(`/api/v1/users/${target.id}`).set(...auth).send({ password: "a".repeat(129) });
      const email = await request(app).patch(`/api/v1/users/${target.id}`).set(...auth).send({ email: " New.Mail@EXAMPLE.com " });

      expect(weak.status).toBe(400);
      expect(tooLong.status).toBe(400);
      expect(email.status).toBe(200);
      expect(email.body.data.email).toBe("new.mail@example.com");
      expect(JSON.stringify(email.body)).not.toContain("passwordHash");
    });

    describe("tự đổi mật khẩu/email của CHÍNH MÌNH qua PATCH (kể cả admin có user:update) PHẢI kèm mật khẩu hiện tại", () => {
      it("thiếu currentPassword → 400 AUTH_021, không đổi gì, không thu hồi phiên", async () => {
        const admin = await seed("admin@e.com", "admin");
        const auth = bearer(admin.id, "admin", admin.email);

        const pw = await request(app).patch(`/api/v1/users/${admin.id}`).set(...auth).send({ password: "mat-khau-moi-1" });
        const mail = await request(app).patch(`/api/v1/users/${admin.id}`).set(...auth).send({ email: "moi@e.com" });

        expect([pw.status, pw.body.error.code]).toEqual([400, "AUTH_021"]);
        expect([mail.status, mail.body.error.code]).toEqual([400, "AUTH_021"]);
        expect(calls.revokeAll).toHaveLength(0);
        expect(calls.audit).toHaveLength(0);
        const stored = await new InMemoryUserRepository().findById(admin.id);
        expect([stored?.email, await bcrypt.compare("x", stored?.passwordHash ?? "")]).toEqual(["admin@e.com", true]);
      });

      it("sai currentPassword → 401 AUTH_001 (không phải phiên hết hạn), không đổi gì", async () => {
        const admin = await seed("admin@e.com", "admin");
        const res = await request(app)
          .patch(`/api/v1/users/${admin.id}`)
          .set(...bearer(admin.id, "admin", admin.email))
          .send({ password: "mat-khau-moi-1", currentPassword: "sai-mat-khau" });

        expect([res.status, res.body.error.code]).toEqual([401, "AUTH_001"]);
        expect(calls.revokeAll).toHaveLength(0);
        const stored = await new InMemoryUserRepository().findById(admin.id);
        expect(await bcrypt.compare("x", stored?.passwordHash ?? "")).toBe(true);
      });

      it("đúng currentPassword → 200, đổi mật khẩu + thu hồi phiên + audit; currentPassword KHÔNG được lưu; đổi email tự đặt lại emailVerified", async () => {
        const admin = await seed("admin@e.com", "admin");
        const auth = bearer(admin.id, "admin", admin.email);

        const pw = await request(app).patch(`/api/v1/users/${admin.id}`).set(...auth).send({ password: "mat-khau-moi-1", currentPassword: "x" });
        expect(pw.status).toBe(200);
        expect(calls.revokeAll).toHaveLength(1);
        expect(calls.audit).toEqual([expect.objectContaining({ action: "user.update", metadata: expect.objectContaining({ fields: ["password"] }) })]);
        const stored = await new InMemoryUserRepository().findById(admin.id);
        expect(await bcrypt.compare("mat-khau-moi-1", stored?.passwordHash ?? "")).toBe(true);
        expect(JSON.stringify(stored)).not.toContain("currentPassword");

        const mail = await request(app).patch(`/api/v1/users/${admin.id}`).set(...auth).send({ email: "Moi@E.com", currentPassword: "mat-khau-moi-1" });
        expect([mail.status, mail.body.data.email]).toEqual([200, "moi@e.com"]);
      });

      it("chỉ đổi tên (hoặc email trùng giá trị cũ) không đòi mật khẩu; admin đổi mật khẩu của NGƯỜI KHÁC không đòi mật khẩu của mình", async () => {
        const admin = await seed("admin@e.com", "admin");
        const target = await seed("target@e.com", "user");
        const auth = bearer(admin.id, "admin", admin.email);

        expect((await request(app).patch(`/api/v1/users/${admin.id}`).set(...auth).send({ name: "Tên mới" })).status).toBe(200);
        expect((await request(app).patch(`/api/v1/users/${admin.id}`).set(...auth).send({ email: "ADMIN@e.com", name: "Tên mới 2" })).status).toBe(200);
        expect((await request(app).patch(`/api/v1/users/${target.id}`).set(...auth).send({ password: "admin-dat-lai-1" })).status).toBe(200);
      });
    });

    it("manager (chỉ user:view) không PATCH được người khác → 403", async () => {
      const manager = await seed("manager@e.com", "manager");
      const target = await seed("target@e.com", "user");

      const res = await request(app)
        .patch(`/api/v1/users/${target.id}`)
        .set(...bearer(manager.id, "manager", manager.email))
        .send({ role: "admin" });

      expect(res.status).toBe(403);
      expect(calls.revokeAll).toHaveLength(0);
    });
  });

  describe("POST /users (admin)", () => {
    it("mật khẩu < 8 ký tự → 400; email khác hoa/thường của user đã có → 409; email lưu chữ thường", async () => {
      const admin = await seed("admin@e.com", "admin");
      await seed("da.co@e.com", "user");
      const auth = bearer(admin.id, "admin", admin.email);

      const weak = await request(app).post("/api/v1/users").set(...auth).send({ email: "moi@e.com", name: "Mới", password: "1234567" });
      const dup = await request(app).post("/api/v1/users").set(...auth).send({ email: "DA.CO@e.com", name: "Trùng" });
      const ok = await request(app).post("/api/v1/users").set(...auth).send({ email: "Moi@E.com", name: "Mới", password: "12345678" });

      expect(weak.status).toBe(400);
      expect(dup.status).toBe(409);
      expect(ok.status).toBe(201);
      expect(ok.body.data.email).toBe("moi@e.com");
    });
  });

  describe("POST /users/:id/lock", () => {
    it("admin không tự khoá chính mình → 400 (tránh mất quyền quản trị duy nhất)", async () => {
      const admin = await seed("admin@e.com", "admin");

      const res = await request(app)
        .post(`/api/v1/users/${admin.id}/lock`)
        .set(...bearer(admin.id, "admin", admin.email))
        .send({ reason: "Tự khoá thử nghiệm ở đây" });

      expect(res.status).toBe(400);
      expect(calls.revokeAll).toHaveLength(0);
    });

    it("manager (chỉ user:view) không khoá được ai → 403", async () => {
      const manager = await seed("manager@e.com", "manager");
      const target = await seed("target@e.com", "user");

      const res = await request(app)
        .post(`/api/v1/users/${target.id}/lock`)
        .set(...bearer(manager.id, "manager", manager.email))
        .send({ reason: "Khoá thử bởi manager" });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /users/:id/sessions", () => {
    it("quản trị viên xem phiên của người khác: KHÔNG lộ deviceId đầy đủ, có deviceIdMasked và expiresAt", async () => {
      const admin = await seed("admin@e.com", "admin");
      const target = await seed("target@e.com", "user");

      const res = await request(app)
        .get(`/api/v1/users/${target.id}/sessions`)
        .set(...bearer(admin.id, "admin", admin.email));

      expect(res.status).toBe(200);
      const [row] = res.body.data as Record<string, unknown>[];
      expect(row).not.toHaveProperty("deviceId");
      expect(row?.deviceIdMasked).toBe("••••123456");
      expect(row?.expiresAt).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain("device-abcdef123456");
      expect(calls.listActive[0]?.[1]).toBeUndefined(); // không có khái niệm "phiên hiện tại" khi xem hộ
    });

    it("chính chủ xem phiên của mình: thấy deviceId đầy đủ và truyền sid của access token để đánh dấu isCurrent", async () => {
      const user = await seed("self@e.com", "user");
      const token = JwtUtils.generateAccessToken({ userId: user.id, email: user.email, role: "user", sv: 1, sid: "66f1b2c3d4e5f60718293a01" });

      const res = await request(app).get(`/api/v1/users/${user.id}/sessions`).set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect((res.body.data as { deviceId: string }[])[0]?.deviceId).toBe("device-abcdef123456");
      expect(calls.listActive[0]?.[1]).toMatchObject({ sessionId: "66f1b2c3d4e5f60718293a01" });
    });

    it("user thường xem phiên của người khác → 403", async () => {
      const user = await seed("self@e.com", "user");
      const other = await seed("other@e.com", "user");

      const res = await request(app).get(`/api/v1/users/${other.id}/sessions`).set(...bearer(user.id, "user", user.email));

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /users/:id/sessions/:sid", () => {
    it("sid không phải ObjectId → 400 (không phải 500 từ Prisma), không gọi thu hồi", async () => {
      const admin = await seed("admin@e.com", "admin");
      const target = await seed("target@e.com", "user");

      const res = await request(app)
        .delete(`/api/v1/users/${target.id}/sessions/khong-phai-objectid`)
        .set(...bearer(admin.id, "admin", admin.email));

      expect(res.status).toBe(400);
      expect(calls.revoke).toHaveLength(0);
    });

    it("thu hồi phiên của người khác: ghi audit auth.session-revoke với người thao tác + sessionId", async () => {
      const admin = await seed("admin@e.com", "admin");
      const target = await seed("target@e.com", "user");

      const res = await request(app)
        .delete(`/api/v1/users/${target.id}/sessions/66f1b2c3d4e5f60718293a01`)
        .set(...bearer(admin.id, "admin", admin.email));

      expect(res.status).toBe(200);
      expect(calls.revoke[0]?.slice(0, 2)).toEqual(["66f1b2c3d4e5f60718293a01", target.id]);
      expect(calls.audit).toEqual([
        expect.objectContaining({
          actorId: admin.id,
          action: "auth.session-revoke",
          targetId: target.id,
          metadata: { sessionId: "66f1b2c3d4e5f60718293a01" },
        }),
      ]);
    });
  });
});
