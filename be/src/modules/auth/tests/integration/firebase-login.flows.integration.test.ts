/**
 * Đăng nhập Google (Firebase) đầu-cuối trên route THẬT + Prisma/Mongo THẬT (`TEST_DB=memory`) + Redis giả có trạng thái.
 * Chỉ bộ xác thực Firebase (`getFirebaseIdentityVerifier`) là giả — không có mạng tới Google trong test.
 * Khoá các hành vi bảo mật: tài khoản mới không mật khẩu, gộp vào tài khoản đã xác minh, và CHỐNG CHIẾM CHỖ email
 * (mật khẩu/phiên của người đăng ký trước bị vô hiệu ngay, token mới của chủ email vẫn dùng được — `sessionVersion` khớp).
 */
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { mailService } from "../../../../infrastructure/mail";
import { errorHandler, notFoundHandler, sanitizeInput } from "../../../../core/middlewares";
import { installRedisFake, resetRedisFake } from "../support/redis-fake";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRedisMockShape } = require("../support/redis-fake") as typeof import("../support/redis-fake");
  return { redis: createRedisMockShape() };
});

jest.mock("../../../../infrastructure/mail", () => ({
  mailService: {
    sendWelcome: jest.fn(),
    sendResetPassword: jest.fn(),
    sendNewDeviceLogin: jest.fn(),
    sendRaw: jest.fn(),
    enqueueMail: jest.fn(),
  },
}));

jest.mock("../../../../core/middlewares/rateLimiter", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require("../support/rate-limiter-mock") as typeof import("../support/rate-limiter-mock")).passThroughRateLimiters()
);

const mockVerify = jest.fn();
jest.mock("../../../../infrastructure/firebase", () => ({
  getFirebaseIdentityVerifier: () => ({ verify: (t: string) => mockVerify(t) }),
}));

import authRoutes from "../../auth.routes";
import { assertMemoryDatabase, describeMemoryDb } from "../support/memory-db-guard";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(sanitizeInput);
app.use("/api/v1/auth", authRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const EMAIL = "chu.email@gmail.com";
const APP_HEADERS = { "X-Client-Platform": "ANDROID", "X-Device-Id": "device-google-1" };
const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.".padEnd(80, "x");

function googleIdentity(over: Record<string, unknown> = {}) {
  return {
    uid: "fb-1",
    email: EMAIL,
    emailVerified: true,
    name: "Chủ Email",
    provider: "google.com",
    authTime: Math.floor(Date.now() / 1000) - 5,
    ...over,
  };
}

async function getNonce(): Promise<string> {
  const res = await request(app).get("/api/v1/auth/nonce");
  return (res.body as { data: { nonce: string } }).data.nonce;
}

async function firebaseLogin() {
  const nonce = await getNonce();
  return request(app).post("/api/v1/auth/firebase-login").set(APP_HEADERS).send({ idToken: ID_TOKEN, nonce });
}

async function passwordLogin(email: string, password: string) {
  const nonce = await getNonce();
  return request(app).post("/api/v1/auth/login").set(APP_HEADERS).send({ email, password, nonce });
}

const me = (accessToken: string) => request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

async function createPasswordUser(over: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email: EMAIL,
      name: "Người đăng ký bằng mật khẩu",
      normalizedName: "nguoi dang ky bang mat khau",
      passwordHash: await bcrypt.hash("Mat-khau-cu-1", 4),
      status: "ACTIVE",
      ...over,
    },
  });
}

describeMemoryDb("đăng nhập Google — Firebase (Mongo thật)", () => {
  beforeAll(assertMemoryDatabase);

  beforeEach(() => {
    resetRedisFake();
    installRedisFake(redis);
    (mailService.sendWelcome as jest.Mock).mockResolvedValue(undefined);
    (mailService.sendNewDeviceLogin as jest.Mock).mockResolvedValue(undefined);
    mockVerify.mockResolvedValue(googleIdentity());
  });

  afterEach(async () => {
    assertMemoryDatabase();
    await prisma.session.deleteMany({});
    await prisma.biometricCredential.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.deviceToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it("user mới: 200, tài khoản không mật khẩu + email đã xác minh, phiên authMethod=SOCIAL, access token dùng được", async () => {
    const res = await firebaseLogin();

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user).toMatchObject({ role: "user", status: "ACTIVE", emailVerified: true, passwordHash: null, name: "Chủ Email" });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session).toMatchObject({ authMethod: "SOCIAL", deviceId: "device-google-1" });

    const profile = await me(res.body.data.accessToken);
    expect(profile.status).toBe(200);
    expect(profile.body.data.email).toBe(EMAIL);

    // Không có mật khẩu ⇒ đăng nhập mật khẩu KHÔNG bao giờ thành công với tài khoản này.
    expect((await passwordLogin(EMAIL, "bat-ky-mat-khau")).status).toBe(401);
  });

  it("gộp vào tài khoản ĐÃ xác minh email: cùng id, mật khẩu cũ vẫn dùng được, phiên cũ không bị thu hồi", async () => {
    const existing = await createPasswordUser({ emailVerified: true, emailVerifiedAt: new Date() });
    const before = await passwordLogin(EMAIL, "Mat-khau-cu-1");
    expect(before.status).toBe(200);

    const res = await firebaseLogin();

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(existing.id);
    expect((await me(before.body.data.accessToken)).status).toBe(200); // phiên mật khẩu còn nguyên
    expect((await passwordLogin(EMAIL, "Mat-khau-cu-1")).status).toBe(200);
    expect(await prisma.user.count()).toBe(1);
  });

  it("CHỐNG CHIẾM CHỖ: tài khoản chưa xác minh email ⇒ mật khẩu + phiên của người đăng ký trước bị vô hiệu, chủ email vào được", async () => {
    const squatted = await createPasswordUser(); // emailVerified mặc định false
    const attacker = await passwordLogin(EMAIL, "Mat-khau-cu-1");
    expect(attacker.status).toBe(200);
    expect((await me(attacker.body.data.accessToken)).status).toBe(200);

    const res = await firebaseLogin();

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(squatted.id);
    // Kẻ đăng ký trước: access token cũ, refresh token cũ và mật khẩu cũ đều hết tác dụng.
    expect((await me(attacker.body.data.accessToken)).status).toBe(401);
    const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: attacker.body.data.refreshToken });
    expect(refresh.status).toBe(401);
    expect((await passwordLogin(EMAIL, "Mat-khau-cu-1")).status).toBe(401);
    // Chủ email: token mới mang đúng sessionVersion sau khi thu hồi ⇒ dùng được ngay.
    expect((await me(res.body.data.accessToken)).status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: squatted.id } });
    expect(after.emailVerified).toBe(true);
    expect(after.sessionVersion).toBeGreaterThan(squatted.sessionVersion);
    expect((await prisma.session.findMany({ where: { userId: squatted.id, revokedAt: null } })).map((s) => s.authMethod)).toEqual(["SOCIAL"]);
  });

  it("tài khoản bị khoá ⇒ 403 AUTH_011, không cấp phiên", async () => {
    await createPasswordUser({ emailVerified: true, status: "LOCKED" });
    const res = await firebaseLogin();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTH_011");
    expect(await prisma.session.count()).toBe(0);
  });

  it("email Google chưa xác minh ⇒ 401 AUTH_023, không tạo tài khoản", async () => {
    mockVerify.mockResolvedValue(googleIdentity({ emailVerified: false }));
    const res = await firebaseLogin();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_023");
    expect(await prisma.user.count()).toBe(0);
  });

  it("nonce chỉ dùng một lần: gửi lại cùng nonce ⇒ 401 AUTH_018", async () => {
    const nonce = await getNonce();
    const send = () => request(app).post("/api/v1/auth/firebase-login").set(APP_HEADERS).send({ idToken: ID_TOKEN, nonce });
    expect((await send()).status).toBe(200);
    const replay = await send();
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("AUTH_018");
  });
});
