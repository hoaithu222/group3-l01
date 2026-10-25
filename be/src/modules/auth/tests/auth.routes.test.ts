import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { JwtUtils } from "../../../core/utils/jwt";
import { NonceUtils } from "../../../core/utils/nonce";
import { env } from "../../../core/config";

// ── Mocks (đường dẫn tính từ file test này) ────────────────────────────────

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    // requireNonce() (Part 2) tiêu thụ qua getdel — mặc định "hợp lệ" để các
    // test hợp đồng login/register hiện có không phải quan tâm tới nonce.
    getdel: jest.fn().mockResolvedValue("1"),
    ping: jest.fn().mockResolvedValue(true),
    // scopeLimiter("biometric-login", ...) — /auth/biometric/login (p0-07 test).
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
    // `requireNonce()` dùng Redis làm đường CHÍNH khi client "sẵn sàng" (`getClient()?.isReady`) —
    // các test hợp đồng dưới đây cần đúng đường đó (getdel mock trả "1").
    getClient: jest.fn().mockReturnValue({ isReady: true }),
  },
}));

// Test hợp đồng này gọi /auth/login, /register… nhiều hơn 10 lần từ cùng một IP — `authLimiter` (10/15 phút/IP,
// đếm trong bộ nhớ tiến trình) sẽ trả 429 giữa chừng. Hành vi giới hạn tốc độ có test riêng (`rate-limiter.test.ts`).
jest.mock("../../../core/middlewares/rateLimiter", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require("./support/rate-limiter-mock") as typeof import("./support/rate-limiter-mock")).passThroughRateLimiters()
);

// AuditService KHÔNG được chạm DB trong test đơn vị này (`logout-all`/thu hồi phiên ghi audit): dùng hàm thường
// (không phải jest.fn — `resetMocks: true` xoá implementation của jest.fn trước mỗi test). Hành vi audit thật được kiểm
// ở `tests/integration/auth.flows.integration.test.ts` (Mongo memory).
jest.mock("../../audit-log/audit-log.service", () => ({
  AuditService: class {
    record(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

jest.mock("../../../infrastructure/mail", () => ({
  mailService: {
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendResetPassword: jest.fn().mockResolvedValue(undefined),
    sendRaw: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn(),
}));

// Repo: dùng in-memory thay PrismaUserRepository — auth.routes.ts import từ "../users/repositories".
jest.mock("../../users/repositories", () => {
  const { InMemoryUserRepository } = jest.requireActual(
    "../../users/repositories/user.repository.inmemory"
  );
  return { PrismaUserRepository: InMemoryUserRepository };
});

// SessionService: mock có thể điều khiển rotate() theo từng test case.
const mockCreate = jest.fn().mockResolvedValue(undefined);
const mockRotate = jest.fn().mockResolvedValue({ ok: true });
const mockRevokeByToken = jest.fn().mockResolvedValue(undefined);
const mockRevokeOthers = jest.fn().mockResolvedValue(undefined);
const mockRevokeAll = jest.fn().mockResolvedValue(0);
const mockRevokeById = jest.fn().mockResolvedValue(true);
const mockListActive = jest.fn().mockResolvedValue([]);
const mockRevoke = jest.fn().mockResolvedValue(undefined);
// TokenIssuer (p0-13) gọi cả 2 hàm này ở mọi lượt issue token (login/register).
const mockIsKnownDevice = jest.fn().mockResolvedValue(true);
const mockEnforceSessionsMax = jest.fn().mockResolvedValue(undefined);

jest.mock("../services/session.service", () => ({
  SessionService: jest.fn().mockImplementation(() => ({
    create: mockCreate,
    rotate: mockRotate,
    revokeByToken: mockRevokeByToken,
    revokeOthers: mockRevokeOthers,
    revokeAll: mockRevokeAll,
    revokeById: mockRevokeById,
    listActive: mockListActive,
    revoke: mockRevoke,
    isKnownDevice: mockIsKnownDevice,
    enforceSessionsMax: mockEnforceSessionsMax,
  })),
}));

// Import SAU khi khai báo mock để auth.routes.ts nhận đúng dependency đã mock.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import authRoutes from "../auth.routes";
import { InMemoryUserRepository } from "../../users/repositories/user.repository.inmemory";
import { redis } from "../../../infrastructure/redis";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { resetRuntimeConfig } from "../../../core/config/runtime-config";

function buildApp() {
  const app = express();
  app.use(express.json());
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cookieParser = require("cookie-parser") as typeof import("cookie-parser");
  app.use(cookieParser());
  app.use("/api/v1/auth", authRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const TEST_EMAIL = "routes-test@example.com";
const TEST_PASSWORD = "password123";
/** Nonce hợp lệ về mặt định dạng — `redis.getdel` được mock trả "1" nên bất kỳ chuỗi 32 ký tự nào cũng "tiêu thụ" được. */
const TEST_NONCE = "a".repeat(32);

async function seedUser(): Promise<{ id: string }> {
  InMemoryUserRepository.clearStore();
  const repo = new InMemoryUserRepository();
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const user = await repo.create({
    email: TEST_EMAIL,
    name: "Routes Test",
    passwordHash,
    role: "admin",
  });
  return { id: user.id };
}

describe("auth.routes (contract admin + app)", () => {
  beforeEach(async () => {
    // `resetMocks: true` (jest.config.ts) xoá mọi mockImplementation trước MỖI
    // test — phải khai báo lại giá trị mặc định ở đây, không chỉ ở factory.
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    (redis.getdel as jest.Mock).mockResolvedValue("1");
    (redis.incr as jest.Mock).mockResolvedValue(1);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.getClient as jest.Mock).mockReturnValue({ isReady: true });
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockRotate.mockResolvedValue({ ok: true });
    mockRevokeAll.mockResolvedValue(0);
    mockRevokeById.mockResolvedValue(true);
    mockIsKnownDevice.mockResolvedValue(true);
    mockEnforceSessionsMax.mockResolvedValue(undefined);
    // `RuntimeConfigService` cache bộ nhớ (`core/config/runtime-config.ts`) là
    // Map module-level, KHÔNG bị `resetMocks`/`clearMocks` xoá giữa các test —
    // reset tay để test cờ `auth.biometricLogin.enabled` (p0-07) không dính
    // cache của test trước trong CÙNG file.
    resetRuntimeConfig();
    await seedUser();
  });

  it("login: user.roles/permissions có trong response", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });

    expect(res.status).toBe(200);
    expect(res.body.data.user.roles).toEqual(["admin"]);
    expect(Array.isArray(res.body.data.user.permissions)).toBe(true);
    expect(res.body.data.user.permissions.length).toBeGreaterThan(0);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("refresh bằng cookie → Set-Cookie mới, body KHÔNG có refreshToken", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });
    const cookies = loginRes.headers["set-cookie"];

    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies)
      .send({});

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.refreshToken).toBeUndefined();
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.headers["set-cookie"]).toBeDefined();
    expect(mockRotate).toHaveBeenCalled();
  });

  it("refresh bằng body → có refreshToken mới, KHÔNG set cookie", async () => {
    const { id } = await seedUser();
    const refreshToken = JwtUtils.generateRefreshToken({
      userId: id,
      email: TEST_EMAIL,
      role: "admin",
    });

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("dùng lại refresh token đã rotate (reuse) → 401 AUTH_010", async () => {
    const { id } = await seedUser();
    const refreshToken = JwtUtils.generateRefreshToken({
      userId: id,
      email: TEST_EMAIL,
      role: "admin",
    });
    mockRotate.mockResolvedValueOnce({ ok: false, reuse: true });

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_010");
  });

  it("/auth/me và /auth/profile trả cùng dữ liệu (alias)", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });
    const accessToken = loginRes.body.data.accessToken as string;

    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    const profileRes = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(profileRes.status).toBe(200);
    expect(meRes.body.data).toEqual(profileRes.body.data);
    expect(meRes.body.data.email).toBe(TEST_EMAIL);
  });

  // p0-07 — `requireSystemConfig("auth.biometricLogin.enabled")` nay đã gắn
  // vào `/auth/biometric/login` (trước đây bỏ qua có chủ đích, xem README/be.md
  // p0-13 "Ghi chú lệch kế hoạch" đã cập nhật ngày 2026-09-17).
  it("cờ auth.biometricLogin.enabled=false (SystemConfig) → 403 AUTH_016 TRƯỚC khi tiêu thụ nonce", async () => {
    (redis.get as jest.Mock).mockImplementation(async (key: string) =>
      key === "cfg:auth" ? { value: { biometricLogin: { enabled: false } }, version: 1 } : null
    );

    const res = await request(app).post("/api/v1/auth/biometric/login").send({
      credentialId: "507f1f77bcf86cd799439011",
      deviceId: "device-1",
      nonce: TEST_NONCE,
      hmac: "a".repeat(64),
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTH_016");
    // nonce KHÔNG bị tiêu thụ — requireSystemConfig chặn trước requireNonce()/getdel.
    expect(redis.getdel as jest.Mock).not.toHaveBeenCalled();
  });

  it("cờ auth.biometricLogin.enabled mặc định (không override) → không bị 403 AUTH_016 (đi tiếp tới AUTH_013, credential không tồn tại)", async () => {
    const res = await request(app).post("/api/v1/auth/biometric/login").send({
      credentialId: "507f1f77bcf86cd799439011",
      deviceId: "device-1",
      nonce: TEST_NONCE,
      hmac: "a".repeat(64),
    });

    expect(res.status).not.toBe(403);
    expect(res.body.error?.code).not.toBe("AUTH_016");
  });

// ── Bổ sung (rà soát auth BE 2026-09-25) ────────────────────────────────────

  it("refresh với token rác → 401 AUTH_006 (trước đây lỗi của jsonwebtoken lọt ra thành 500)", async () => {
    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: "khong-phai-jwt" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_006");
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("refresh bằng ACCESS token (sai audience) → 401 AUTH_006", async () => {
    const { id } = await seedUser();
    const accessToken = JwtUtils.generateAccessToken({ userId: id, email: TEST_EMAIL, role: "admin", sv: 1 });

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: accessToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_006");
  });

  it("refresh bằng cookie với Origin KHÔNG nằm trong allowlist → 403 (chống CSRF), không xoay token", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies)
      .set("Origin", "https://evil.example.com")
      .send({});

    expect(res.status).toBe(403);
    expect(mockRotate).not.toHaveBeenCalled();
  });

  it("refresh bằng cookie với Origin trong allowlist (admin dev) → 200", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });
    const cookies = loginRes.headers["set-cookie"];

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies)
      .set("Origin", "http://localhost:5173")
      .send({});

    expect(res.status).toBe(200);
  });

  it("login: email được chuẩn hoá chữ thường (bàn phím tự viết hoa chữ đầu không làm đăng nhập sai)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "  Routes-Test@Example.COM ", password: TEST_PASSWORD, nonce: TEST_NONCE });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
  });

  it("register: mật khẩu ngắn hơn 8 ký tự → 400 VAL_001; email trùng khác hoa/thường → 409", async () => {
    const weak = await request(app).post("/api/v1/auth/register").send({
      email: "moi@example.com",
      name: "Người Mới",
      password: "1234567",
      nonce: TEST_NONCE,
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VAL_001");

    const dup = await request(app).post("/api/v1/auth/register").send({
      email: "ROUTES-TEST@example.com",
      name: "Trùng Email",
      password: "matkhau-du-dai",
      nonce: TEST_NONCE,
    });
    expect(dup.status).toBe(409);
  });

  it("register: mật khẩu dài hơn 128 ký tự → 400 (chặn payload băm mật khẩu phình to)", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email: "dai@example.com",
      name: "Dai",
      password: "a".repeat(129),
      nonce: TEST_NONCE,
    });

    expect(res.status).toBe(400);
  });

  it("POST /auth/logout-all → 200 { revokedSessions }, thu hồi mọi phiên và xoá cookie", async () => {
    mockRevokeAll.mockResolvedValue(3);
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });
    const accessToken = loginRes.body.data.accessToken as string;

    const res = await request(app)
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revokedSessions: 3 });
    expect(mockRevokeAll).toHaveBeenCalledWith(expect.any(String), "SESSIONS_REVOKED");
    expect(String(res.headers["set-cookie"])).toContain("refresh_token=;");
  });

  it("POST /auth/logout-all không có token → 401", async () => {
    const res = await request(app).post("/api/v1/auth/logout-all").send({});

    expect(res.status).toBe(401);
  });

  it("DELETE /auth/sessions/:id với id không phải ObjectId → 400 (không phải 500 từ Prisma)", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });
    const accessToken = loginRes.body.data.accessToken as string;

    const res = await request(app)
      .delete("/api/v1/auth/sessions/khong-phai-objectid")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

// ── Nonce (D-27) qua route thật: Redis là đường chính, Map chỉ ở dev, production KHÔNG mở cửa ────────────────
describe("auth.routes — nonce: Redis đường chính, fallback dev, production fail-closed", () => {
  const originalEnv = env.NODE_ENV;
  const setNodeEnv = (value: "development" | "production" | "test"): void => {
    (env as { NODE_ENV: string }).NODE_ENV = value;
  };

  beforeEach(async () => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    (redis.getdel as jest.Mock).mockResolvedValue("1");
    (redis.incr as jest.Mock).mockResolvedValue(1);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.getClient as jest.Mock).mockReturnValue({ isReady: true });
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockRotate.mockResolvedValue({ ok: true });
    mockIsKnownDevice.mockResolvedValue(true);
    mockEnforceSessionsMax.mockResolvedValue(undefined);
    resetRuntimeConfig();
    NonceUtils.resetMemoryForTests();
    await seedUser();
  });

  afterEach(() => {
    setNodeEnv(originalEnv);
    NonceUtils.resetMemoryForTests();
  });

  it("Redis sẵn sàng: GET /auth/nonce ghi `nonce:<nonce>` (TTL 120 s) lên Redis, KHÔNG dùng Map", async () => {
    const res = await request(app).get("/api/v1/auth/nonce");

    expect(res.status).toBe(200);
    const { nonce, expiresIn } = res.body.data as { nonce: string; expiresIn: number };
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(expiresIn).toBe(120);
    expect(redis.set as jest.Mock).toHaveBeenCalledWith(`nonce:${nonce}`, "1", 120);
    expect(NonceUtils.memorySizeForTests()).toBe(0);
  });

  it("Redis sẵn sàng: login tiêu thụ nonce bằng GETDEL nguyên tử; Redis báo nonce không tồn tại ⇒ 401 AUTH_018", async () => {
    (redis.getdel as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_018");
    expect(redis.getdel as jest.Mock).toHaveBeenCalledWith(`nonce:${TEST_NONCE}`);
  });

  it("dev (NODE_ENV=test) + Redis chưa sẵn sàng: vẫn cấp và tiêu thụ nonce bằng Map — đăng nhập chạy được, nonce dùng lại ⇒ AUTH_018", async () => {
    (redis.getClient as jest.Mock).mockReturnValue(null);

    const issued = await request(app).get("/api/v1/auth/nonce");
    const nonce = (issued.body.data as { nonce: string }).nonce;
    const first = await request(app).post("/api/v1/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce });
    const replay = await request(app).post("/api/v1/auth/login").send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce });

    expect(issued.status).toBe(200);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("AUTH_018");
    expect(redis.set as jest.Mock).not.toHaveBeenCalled();
    expect(redis.getdel as jest.Mock).not.toHaveBeenCalled();
  });

  it("production + Redis chưa sẵn sàng: GET /auth/nonce → 503 SYS_503 (không cấp nonce lỏng), Map không được dùng", async () => {
    setNodeEnv("production");
    (redis.getClient as jest.Mock).mockReturnValue(null);

    const res = await request(app).get("/api/v1/auth/nonce");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SYS_503");
    expect(redis.set as jest.Mock).not.toHaveBeenCalled();
    expect(NonceUtils.memorySizeForTests()).toBe(0);
  });

  it("production + Redis chưa sẵn sàng: login → 401 AUTH_018 (KHÔNG mở cửa), kể cả khi Redis mock sẽ trả 'hợp lệ'", async () => {
    setNodeEnv("production");
    (redis.getClient as jest.Mock).mockReturnValue(null);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, nonce: TEST_NONCE });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_018");
    expect(redis.getdel as jest.Mock).not.toHaveBeenCalled();
  });
});
