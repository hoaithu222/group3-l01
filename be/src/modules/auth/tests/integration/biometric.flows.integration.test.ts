/**
 * Đăng nhập sinh trắc học đầu-cuối (p0-13/D-26/D-27) trên route THẬT + Mongo THẬT (`TEST_DB=memory`) + Redis giả có trạng thái:
 * bí mật do BE cấp (chỉ lưu hash), thách thức HMAC trên nonce dùng một lần, giới hạn số lần thử, thu hồi khi đổi mật khẩu/đăng xuất
 * mọi nơi, không cất mật khẩu, không lộ `secretHash`.
 */
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { createHash, createHmac } from "crypto";
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

import authRoutes from "../../auth.routes";
import { assertMemoryDatabase, describeMemoryDb } from "../support/memory-db-guard";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(sanitizeInput);
app.use("/api/v1/auth", authRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const PASSWORD = "Mat-khau-hien-tai-1";
const DEVICE = "device-android-0001";

interface Enrolled {
  credentialId: string;
  secret: string;
}

const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");
/** Đúng như app: hmac = HMAC-SHA256(key = SHA256(secret) — byte thô, message = nonce). */
const hmacOf = (secret: string, nonce: string): string =>
  createHmac("sha256", Buffer.from(sha256Hex(secret), "hex")).update(nonce, "utf8").digest("hex");

async function nonce(): Promise<string> {
  const res = await request(app).get("/api/v1/auth/nonce");
  return (res.body as { data: { nonce: string } }).data.nonce;
}

async function createUser(email = "bio@example.com", overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email,
      name: "Bio User",
      normalizedName: "bio user",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      status: "ACTIVE",
      ...overrides,
    },
  });
}

async function loginPassword(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Client-Platform", "ANDROID")
    .send({ email, password: PASSWORD, nonce: await nonce() });
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

async function enroll(accessToken: string, deviceId = DEVICE): Promise<Enrolled> {
  const res = await request(app)
    .post("/api/v1/auth/biometric/enroll")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ password: PASSWORD, deviceId, platform: "ANDROID", biometryKind: "FINGERPRINT" });
  expect(res.status).toBe(201);
  return res.body.data as Enrolled;
}

async function biometricLogin(
  enrolled: Enrolled,
  opts: { deviceId?: string; hmac?: string; nonceValue?: string; platform?: string | null } = {}
) {
  const n = opts.nonceValue ?? (await nonce());
  let req = request(app).post("/api/v1/auth/biometric/login");
  if (opts.platform !== null) req = req.set("X-Client-Platform", opts.platform ?? "ANDROID");
  return req.send({
    credentialId: enrolled.credentialId,
    deviceId: opts.deviceId ?? DEVICE,
    nonce: n,
    hmac: opts.hmac ?? hmacOf(enrolled.secret, n),
  });
}

describeMemoryDb("đăng nhập sinh trắc học (Mongo thật)", () => {
  beforeAll(assertMemoryDatabase);

  beforeEach(() => {
    resetRedisFake();
    installRedisFake(redis);
    (mailService.sendNewDeviceLogin as jest.Mock).mockResolvedValue(undefined);
    (mailService.sendRaw as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.session.deleteMany({});
    await prisma.biometricCredential.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe("bật (enroll)", () => {
    it("sai mật khẩu → 401 AUTH_001, không tạo credential; đúng → 201, Cache-Control: no-store, bí mật CHỈ trả một lần", async () => {
      const user = await createUser();
      const token = await loginPassword(user.email);

      const wrong = await request(app)
        .post("/api/v1/auth/biometric/enroll")
        .set("Authorization", `Bearer ${token}`)
        .send({ password: "sai-mat-khau", deviceId: DEVICE, platform: "ANDROID", biometryKind: "FACE" });
      const ok = await request(app)
        .post("/api/v1/auth/biometric/enroll")
        .set("Authorization", `Bearer ${token}`)
        .send({ password: PASSWORD, deviceId: DEVICE, platform: "ANDROID", biometryKind: "FACE" });

      expect(wrong.status).toBe(401);
      // AUTH_001 (không phải AUTH_002 "token không hợp lệ"): app dựa vào mã này để KHÔNG làm mới/dọn phiên khi gõ sai mật khẩu.
      expect(wrong.body.error.code).toBe("AUTH_001");
      expect(await prisma.biometricCredential.count({ where: { userId: user.id } })).toBe(1);
      expect(ok.status).toBe(201);
      expect(ok.headers["cache-control"]).toContain("no-store");
      expect(ok.body.data).toMatchObject({ credentialId: expect.any(String), secret: expect.any(String), biometryKind: "FACE" });
      expect(ok.body.data.secret.length).toBeGreaterThanOrEqual(43); // 32 byte base64url
    });

    it("DB chỉ lưu SHA-256 của bí mật; bí mật thô và mật khẩu không nằm ở đâu trong DB/response; danh sách không có secretHash", async () => {
      const user = await createUser();
      const token = await loginPassword(user.email);

      const enrolled = await enroll(token);

      const stored = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } });
      expect(stored.secretHash).toBe(sha256Hex(enrolled.secret));
      expect(JSON.stringify(stored)).not.toContain(enrolled.secret);
      expect(JSON.stringify(stored)).not.toContain(PASSWORD);
      expect(stored.activeKey).toBe(`${user.id}:${DEVICE}`);
      const list = await request(app)
        .get("/api/v1/auth/biometric/credentials")
        .set("Authorization", `Bearer ${token}`)
        .set("X-Device-Id", DEVICE);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: enrolled.credentialId, current: true });
      expect(JSON.stringify(list.body)).not.toContain("secretHash");
      expect(JSON.stringify(list.body)).not.toContain(enrolled.secret);
    });

    it("bật lại trên cùng thiết bị → bản cũ REVOKED (REPLACED), chỉ một ACTIVE; bản thứ perUserMax+1 thu hồi bản dùng cũ nhất (DEVICE_LIMIT)", async () => {
      const user = await createUser();
      const token = await loginPassword(user.email);
      const first = await enroll(token);
      const second = await enroll(token);

      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: first.credentialId } }))).toMatchObject({
        status: "REVOKED",
        revokeReason: "REPLACED",
      });
      expect(await prisma.biometricCredential.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(1);

      for (let i = 2; i <= 5; i++) await enroll(token, `device-android-000${i}`);
      const overflow = await enroll(token, "device-android-0009");

      expect(await prisma.biometricCredential.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(5);
      expect(
        (await prisma.biometricCredential.findUniqueOrThrow({ where: { id: second.credentialId } })).revokeReason
      ).toBe("DEVICE_LIMIT");
      expect(overflow.credentialId).toEqual(expect.any(String));
    });
  });

  describe("đăng nhập bằng HMAC trên nonce", () => {
    it("HMAC đúng → token trong body (không cookie), Session.authMethod = BIOMETRIC gắn deviceId + credentialId, Cache-Control: no-store", async () => {
      const user = await createUser();
      const enrolled = await enroll(await loginPassword(user.email));

      const res = await biometricLogin(enrolled);

      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        tokenType: "Bearer",
        biometric: { credentialId: enrolled.credentialId },
      });
      expect(res.body.data.user.email).toBe(user.email);
      const session = await prisma.session.findFirstOrThrow({
        where: { userId: user.id, authMethod: "BIOMETRIC" },
      });
      expect(session.deviceId).toBe(DEVICE);
      expect(session.biometricCredentialId).toBe(enrolled.credentialId);
      const cred = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } });
      expect(cred.lastUsedAt).toBeInstanceOf(Date);
      expect(cred.failedAttempts).toBe(0);
      // Phiên sinh trắc học dùng được như phiên thường (refresh + /me).
      const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${res.body.data.accessToken}`);
      expect(me.status).toBe(200);
    });

    it("thiếu X-Client-Platform → 400 AUTH_017 (đăng nhập sinh trắc học chỉ dành cho app)", async () => {
      const user = await createUser();
      const enrolled = await enroll(await loginPassword(user.email));

      const res = await biometricLogin(enrolled, { platform: null });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("AUTH_017");
    });

    it("nonce dùng lại (replay) → 401 AUTH_018 dù HMAC đúng", async () => {
      const user = await createUser();
      const enrolled = await enroll(await loginPassword(user.email));
      const n = await nonce();

      const first = await biometricLogin(enrolled, { nonceValue: n });
      const replay = await biometricLogin(enrolled, { nonceValue: n });

      expect(first.status).toBe(200);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe("AUTH_018");
    });

    it("HMAC sai → AUTH_013 và tăng failedAttempts; deviceId lạ dù HMAC đúng → AUTH_013; sai 5 lần → thu hồi TOO_MANY_ATTEMPTS, lần 5 trả AUTH_014, sau đó HMAC đúng cũng AUTH_014", async () => {
      const user = await createUser();
      const enrolled = await enroll(await loginPassword(user.email));

      const wrongDevice = await biometricLogin(enrolled, { deviceId: "device-khac-hoan-toan" });
      expect(wrongDevice.body.error.code).toBe("AUTH_013");
      for (let i = 0; i < 3; i++) {
        const res = await biometricLogin(enrolled, { hmac: "0".repeat(64) });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("AUTH_013");
      }
      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } })).failedAttempts).toBe(4);

      const fifth = await biometricLogin(enrolled, { hmac: "0".repeat(64) });
      const afterRevoke = await biometricLogin(enrolled);

      expect(fifth.body.error.code).toBe("AUTH_014");
      expect(afterRevoke.body.error.code).toBe("AUTH_014");
      expect(await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } })).toMatchObject({
        status: "REVOKED",
        revokeReason: "TOO_MANY_ATTEMPTS",
      });
      expect(await prisma.session.count({ where: { userId: user.id, authMethod: "BIOMETRIC" } })).toBe(0);
    });

    it("BIO-10: lần thứ 11 trong 15 phút với cùng credentialId → 429 RATE_002 (giới hạn theo credential, ngoài giới hạn IP)", async () => {
      const user = await createUser();
      const enrolled = await enroll(await loginPassword(user.email));

      // 10 lượt hợp lệ (HMAC đúng) trong cửa sổ, lượt 11 bị chặn.
      for (let i = 0; i < 10; i++) expect((await biometricLogin(enrolled)).status).toBe(200);
      const blocked = await biometricLogin(enrolled);

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_002");
    });

    it("credential quá hạn → 401 AUTH_015 và bị thu hồi EXPIRED", async () => {
      const user = await createUser();
      const enrolled = await enroll(await loginPassword(user.email));
      await prisma.biometricCredential.update({
        where: { id: enrolled.credentialId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await biometricLogin(enrolled);

      expect(res.body.error.code).toBe("AUTH_015");
      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } })).revokeReason).toBe("EXPIRED");
    });

    it("BIO-09: tài khoản khoá / chờ xoá → AUTH_011 / AUTH_012 SAU khi xác thực đúng, không tạo phiên", async () => {
      const locked = await createUser("locked@example.com");
      const pending = await createUser("pending@example.com");
      const lockedEnrolled = await enroll(await loginPassword(locked.email));
      const pendingEnrolled = await enroll(await loginPassword(pending.email), "device-android-0002");
      await prisma.session.deleteMany({});
      await prisma.user.update({ where: { id: locked.id }, data: { status: "LOCKED" } });
      const graceUntil = new Date(Date.now() + 4 * 86_400_000);
      await prisma.user.update({
        where: { id: pending.id },
        data: { status: "PENDING_DELETION", deletionRequestedAt: new Date(), deletionGraceUntil: graceUntil },
      });
      // `getUserStatusCached` lưu cache 60 s trên Redis giả: xoá để trạng thái mới có hiệu lực (như `invalidateUserStatusCache` ở luồng thật).
      resetRedisFake();
      installRedisFake(redis);

      const lockedRes = await biometricLogin(lockedEnrolled);
      const pendingRes = await biometricLogin(pendingEnrolled, { deviceId: "device-android-0002" });

      expect(lockedRes.body.error.code).toBe("AUTH_011");
      expect(pendingRes.body.error.code).toBe("AUTH_012");
      // HMAC đã đúng ⇒ chủ máy: AUTH_012 kèm ngày tự ẩn danh hoá cho màn "Khôi phục tài khoản"; AUTH_011 không có details.
      expect(pendingRes.body.error.details).toEqual({ deletionGraceUntil: graceUntil.toISOString() });
      expect(lockedRes.body.error.details).toBeUndefined();
      expect(await prisma.session.count({})).toBe(0);
    });
  });

  describe("thu hồi", () => {
    it("tự tắt (DELETE) idempotent; credential của người khác → 404", async () => {
      const user = await createUser();
      const stranger = await createUser("nguoi.la@example.com");
      const token = await loginPassword(user.email);
      const enrolled = await enroll(token);
      const strangerEnrolled = await enroll(await loginPassword(stranger.email), "device-android-0003");

      const first = await request(app)
        .delete(`/api/v1/auth/biometric/credentials/${enrolled.credentialId}`)
        .set("Authorization", `Bearer ${token}`);
      const again = await request(app)
        .delete(`/api/v1/auth/biometric/credentials/${enrolled.credentialId}`)
        .set("Authorization", `Bearer ${token}`);
      const foreign = await request(app)
        .delete(`/api/v1/auth/biometric/credentials/${strangerEnrolled.credentialId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect(foreign.status).toBe(404);
      expect((await biometricLogin(enrolled)).body.error.code).toBe("AUTH_014");
      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: strangerEnrolled.credentialId } })).status).toBe("ACTIVE");
    });

    it("BIO-07: đổi mật khẩu / đặt lại mật khẩu / đăng xuất mọi nơi thu hồi credential đúng lý do → quét sinh trắc học nhận AUTH_014", async () => {
      const user = await createUser();
      const token = await loginPassword(user.email);
      const enrolled = await enroll(token);

      await request(app)
        .patch("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: PASSWORD, newPassword: "Mat-khau-moi-9x" });
      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } })).revokeReason).toBe("PASSWORD_CHANGED");
      expect((await biometricLogin(enrolled)).body.error.code).toBe("AUTH_014");

      // logout-all: bật lại rồi đăng xuất mọi nơi.
      const fresh = await request(app)
        .post("/api/v1/auth/login")
        .set("X-Client-Platform", "ANDROID")
        .send({ email: user.email, password: "Mat-khau-moi-9x", nonce: await nonce() });
      const token2 = fresh.body.data.accessToken as string;
      const enrolled2 = await request(app)
        .post("/api/v1/auth/biometric/enroll")
        .set("Authorization", `Bearer ${token2}`)
        .send({ password: "Mat-khau-moi-9x", deviceId: DEVICE, platform: "ANDROID", biometryKind: "FINGERPRINT" });
      await request(app).post("/api/v1/auth/logout-all").set("Authorization", `Bearer ${token2}`).send({});
      const cred2 = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled2.body.data.credentialId as string } });
      expect(cred2).toMatchObject({ status: "REVOKED", revokeReason: "SESSIONS_REVOKED" });
    });

    it("KHÔNG thu hồi khi đăng xuất thường (giữ gắn để lần sau vào bằng sinh trắc học)", async () => {
      const user = await createUser();
      const token = await loginPassword(user.email);
      const enrolled = await enroll(token);

      await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`).send({});

      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: enrolled.credentialId } })).status).toBe("ACTIVE");
      expect((await biometricLogin(enrolled)).status).toBe(200);
    });
  });
});
