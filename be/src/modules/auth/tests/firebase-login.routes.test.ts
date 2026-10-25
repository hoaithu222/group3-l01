import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { AppError, UnauthorizedError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";

// ── Mocks (đường dẫn tính từ file test này) — cùng bộ khung với auth.routes.test.ts ─────────────────────────

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getdel: jest.fn().mockResolvedValue("1"),
    ping: jest.fn().mockResolvedValue(true),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn().mockReturnValue({ isReady: true }),
  },
}));

jest.mock("../../../core/middlewares/rateLimiter", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require("./support/rate-limiter-mock") as typeof import("./support/rate-limiter-mock")).passThroughRateLimiters()
);

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

jest.mock("../../users/repositories", () => {
  const { InMemoryUserRepository } = jest.requireActual("../../users/repositories/user.repository.inmemory");
  return { PrismaUserRepository: InMemoryUserRepository };
});

// `auth.routes.ts` dựng `SessionService` MỘT lần lúc import — các hàm dưới đây phải là biến module-level để `beforeEach` khai báo lại
// implementation sau khi `resetMocks: true` xoá chúng.
const mockSessionCreate = jest.fn();
const mockIsKnownDevice = jest.fn();
const mockEnforceSessionsMax = jest.fn();
const mockRevokeAll = jest.fn();
jest.mock("../services/session.service", () => ({
  SessionService: jest.fn().mockImplementation(() => ({
    create: mockSessionCreate,
    isKnownDevice: mockIsKnownDevice,
    enforceSessionsMax: mockEnforceSessionsMax,
    revokeAll: mockRevokeAll,
  })),
}));

// Verifier Firebase do test điều khiển — KHÔNG gọi Firebase thật.
const mockVerify = jest.fn();
jest.mock("../../../infrastructure/firebase", () => ({
  getFirebaseIdentityVerifier: () => ({ verify: (t: string) => mockVerify(t) }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import authRoutes from "../auth.routes";
import { InMemoryUserRepository } from "../../users/repositories/user.repository.inmemory";
import { redis } from "../../../infrastructure/redis";
import { getUserStatusCached } from "../../../core/permission/user-status";

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
const NONCE = "a".repeat(32);
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.".padEnd(60, "x");

function goodIdentity() {
  return {
    uid: "u1",
    email: "route.google@gmail.com",
    emailVerified: true,
    name: "Route Google",
    provider: "google.com",
    authTime: Math.floor(Date.now() / 1000) - 5,
  };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  request(app).post("/api/v1/auth/firebase-login").set(headers).send(body as object);

describe("POST /auth/firebase-login", () => {
  beforeEach(() => {
    // `resetMocks: true` xoá implementation của jest.fn trước MỖI test — khai báo lại mặc định.
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    (redis.getdel as jest.Mock).mockResolvedValue("1");
    (redis.incr as jest.Mock).mockResolvedValue(1);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.getClient as jest.Mock).mockReturnValue({ isReady: true });
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockSessionCreate.mockResolvedValue(undefined);
    mockIsKnownDevice.mockResolvedValue(true);
    mockEnforceSessionsMax.mockResolvedValue(undefined);
    mockRevokeAll.mockResolvedValue(0);
    mockVerify.mockResolvedValue(goodIdentity());
    InMemoryUserRepository.clearStore();
  });

  it("web (không có X-Client-Platform): set cookie refresh_token, body chỉ có accessToken", async () => {
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.user.email).toBe("route.google@gmail.com");
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toContain("refresh_token=");
    expect(mockVerify).toHaveBeenCalledWith(ID_TOKEN);
  });

  it("app (X-Client-Platform: ANDROID): refreshToken nằm trong body, KHÔNG set cookie", async () => {
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE }, { "X-Client-Platform": "ANDROID" });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("đăng nhập lần hai vào ĐÚNG tài khoản đã tạo (không tạo bản trùng)", async () => {
    const first = await post({ idToken: ID_TOKEN, nonce: NONCE });
    const second = await post({ idToken: ID_TOKEN, nonce: NONCE });

    expect(second.status).toBe(200);
    expect(second.body.data.user.id).toBe(first.body.data.user.id);
    expect((await new InMemoryUserRepository().findMany(10, 0)).total).toBe(1);
  });

  it("thiếu nonce ⇒ 400 VAL_001; chưa gọi Firebase", async () => {
    const res = await post({ idToken: ID_TOKEN });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VAL_001);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("body thừa field (client tự khai email/tên) ⇒ 400 — danh tính chỉ lấy từ token", async () => {
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE, email: "victim@gmail.com", role: "admin" });
    expect(res.status).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("idToken quá ngắn / quá dài ⇒ 400", async () => {
    expect((await post({ idToken: "short", nonce: NONCE })).status).toBe(400);
    expect((await post({ idToken: "x".repeat(4097), nonce: NONCE })).status).toBe(400);
  });

  it("nonce đã dùng/không tồn tại ⇒ 401 AUTH_018, chưa gọi Firebase", async () => {
    (redis.getdel as jest.Mock).mockResolvedValue(null);
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_018);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("Firebase từ chối token ⇒ 401 AUTH_022", async () => {
    mockVerify.mockRejectedValue(new UnauthorizedError("x", ErrorCode.AUTH_022));
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_022);
  });

  it("email Google chưa xác minh ⇒ 401 AUTH_023, không tạo tài khoản", async () => {
    mockVerify.mockResolvedValue({ ...goodIdentity(), emailVerified: false });
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_023);
    expect((await new InMemoryUserRepository().findMany(10, 0)).total).toBe(0);
  });

  it("server chưa cấu hình Firebase (verifier ném 503) ⇒ 503 SYS_503", async () => {
    mockVerify.mockRejectedValue(new AppError("Dịch vụ tạm thời không khả dụng", 503, ErrorCode.SYS_503));
    const res = await post({ idToken: ID_TOKEN, nonce: NONCE });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe(ErrorCode.SYS_503);
  });
});
