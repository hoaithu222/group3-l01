/**
 * BIO-19 (p0-13 README §8) — quản trị xem/thu hồi thiết bị sinh trắc học của người dùng, đầu-cuối trên route THẬT
 * (`/auth/*` + `/users/*`) + Mongo memory (`TEST_DB=memory`) + Redis giả có trạng thái:
 *   - manager (chỉ `user:view`) xem được danh sách nhưng KHÔNG thu hồi được (403); user thường không xem được;
 *   - danh sách chỉ có trường an toàn (`deviceIdMasked`, không `secretHash`/`deviceId` đầy đủ);
 *   - admin thu hồi có lý do ⇒ credential REVOKED (`ADMIN`, `revokedBy`), audit `user.biometric-revoke` (targetType `User`);
 *   - máy đó quét sinh trắc học sau đó ⇒ 401 `AUTH_014`.
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
import { newObjectId } from "../../../../core/utils/object-id";
import { installRedisFake, resetRedisFake } from "../../../auth/tests/support/redis-fake";
import { assertMemoryDatabase, describeMemoryDb } from "../../../auth/tests/support/memory-db-guard";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRedisMockShape } = require("../../../auth/tests/support/redis-fake") as typeof import("../../../auth/tests/support/redis-fake");
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
  (
    require("../../../auth/tests/support/rate-limiter-mock") as typeof import("../../../auth/tests/support/rate-limiter-mock")
  ).passThroughRateLimiters()
);

import authRoutes from "../../../auth/auth.routes";
import userRoutes from "../../user.routes";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(sanitizeInput);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const PASSWORD = "Mat-khau-hien-tai-1";
const DEVICE = "device-android-admin-0001";
const REASON = "Thiết bị bị mất, thu hồi khẩn cấp";

const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");
const hmacOf = (secret: string, nonce: string): string =>
  createHmac("sha256", Buffer.from(sha256Hex(secret), "hex")).update(nonce, "utf8").digest("hex");

async function nonce(): Promise<string> {
  const res = await request(app).get("/api/v1/auth/nonce");
  return (res.body as { data: { nonce: string } }).data.nonce;
}

async function createUser(email: string, role: "admin" | "manager" | "user") {
  return prisma.user.create({
    data: {
      email,
      name: email.split("@")[0] ?? "u",
      normalizedName: email.split("@")[0] ?? "u",
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role,
      status: "ACTIVE",
    },
  });
}

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-Client-Platform", "ANDROID")
    .send({ email, password: PASSWORD, nonce: await nonce() });
  expect(res.status).toBe(200);
  return (res.body as { data: { accessToken: string } }).data.accessToken;
}

const bearer = (token: string): [string, string] => ["Authorization", `Bearer ${token}`];

describeMemoryDb("admin — thiết bị sinh trắc học của người dùng (BIO-19, Mongo memory)", () => {
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

  /** Người dùng đã đăng nhập bằng mật khẩu và bật sinh trắc học trên một máy Android. */
  async function seedEnrolledUser() {
    const target = await createUser("target-bio@example.com", "user");
    const token = await login(target.email);
    const res = await request(app)
      .post("/api/v1/auth/biometric/enroll")
      .set(...bearer(token))
      .send({ password: PASSWORD, deviceId: DEVICE, platform: "ANDROID", biometryKind: "FINGERPRINT" });
    expect(res.status).toBe(201);
    return { target, ...(res.body.data as { credentialId: string; secret: string }) };
  }

  it("manager (user:view) xem được danh sách: chỉ trường an toàn (deviceIdMasked), KHÔNG secretHash/deviceId đầy đủ; user thường → 403", async () => {
    const { target, credentialId } = await seedEnrolledUser();
    const manager = await createUser("manager-bio@example.com", "manager");
    const plain = await createUser("plain-bio@example.com", "user");

    const res = await request(app)
      .get(`/api/v1/users/${target.id}/biometric-credentials`)
      .set(...bearer(await login(manager.email)));

    expect(res.status).toBe(200);
    const [row] = res.body.data as Record<string, unknown>[];
    expect(row).toMatchObject({ id: credentialId, status: "ACTIVE", platform: "ANDROID", biometryKind: "FINGERPRINT" });
    expect(row?.deviceIdMasked).toBe(`••••${DEVICE.slice(-6)}`);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("secretHash");
    expect(serialized).not.toContain(DEVICE);
    expect(row).not.toHaveProperty("deviceId");

    const denied = await request(app)
      .get(`/api/v1/users/${target.id}/biometric-credentials`)
      .set(...bearer(await login(plain.email)));
    expect(denied.status).toBe(403);
  });

  it("thu hồi: manager (không có user:update) → 403; admin thiếu/ngắn lý do → 400; admin có lý do → 200, credential REVOKED (ADMIN + revokedBy) và audit user.biometric-revoke", async () => {
    const { target, credentialId } = await seedEnrolledUser();
    const admin = await createUser("admin-bio@example.com", "admin");
    const manager = await createUser("manager2-bio@example.com", "manager");
    const adminToken = await login(admin.email);
    const revokeUrl = `/api/v1/users/${target.id}/biometric-credentials/${credentialId}/revoke`;

    const byManager = await request(app)
      .post(revokeUrl)
      .set(...bearer(await login(manager.email)))
      .send({ reason: REASON });
    expect(byManager.status).toBe(403);
    const noReason = await request(app).post(revokeUrl).set(...bearer(adminToken)).send({});
    const shortReason = await request(app).post(revokeUrl).set(...bearer(adminToken)).send({ reason: "ngắn" });
    expect(noReason.status).toBe(400);
    expect(shortReason.status).toBe(400);
    expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: credentialId } })).status).toBe("ACTIVE");

    const ok = await request(app).post(revokeUrl).set(...bearer(adminToken)).send({ reason: REASON });

    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ revoked: true });
    const after = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: credentialId } });
    expect(after).toMatchObject({ status: "REVOKED", revokeReason: "ADMIN", revokedBy: admin.id, activeKey: `revoked:${credentialId}` });
    const audit = await prisma.auditLog.findMany({ where: { action: "user.biometric-revoke" } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admin.id, targetType: "User", targetId: target.id, reason: REASON });
    expect((audit[0]?.metadata as { credentialId: string }).credentialId).toBe(credentialId);

    // Idempotent: gọi lại vẫn 200 và không ghi thêm gì sai lệch trạng thái.
    const again = await request(app).post(revokeUrl).set(...bearer(adminToken)).send({ reason: REASON });
    expect(again.status).toBe(200);
  });

  it("credential không thuộc người dùng đó (hoặc không tồn tại) → 404", async () => {
    const { credentialId } = await seedEnrolledUser();
    const admin = await createUser("admin2-bio@example.com", "admin");
    const other = await createUser("other-bio@example.com", "user");
    const adminToken = await login(admin.email);

    const wrongOwner = await request(app)
      .post(`/api/v1/users/${other.id}/biometric-credentials/${credentialId}/revoke`)
      .set(...bearer(adminToken))
      .send({ reason: REASON });
    const unknown = await request(app)
      .post(`/api/v1/users/${other.id}/biometric-credentials/${newObjectId()}/revoke`)
      .set(...bearer(adminToken))
      .send({ reason: REASON });

    expect(wrongOwner.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: credentialId } })).status).toBe("ACTIVE");
  });

  it("sau khi admin thu hồi, máy đó quét sinh trắc học ⇒ 401 AUTH_014 (không cấp phiên)", async () => {
    const { target, credentialId, secret } = await seedEnrolledUser();
    const admin = await createUser("admin3-bio@example.com", "admin");
    await request(app)
      .post(`/api/v1/users/${target.id}/biometric-credentials/${credentialId}/revoke`)
      .set(...bearer(await login(admin.email)))
      .send({ reason: REASON })
      .expect(200);
    const sessionsBefore = await prisma.session.count({ where: { userId: target.id } });

    const n = await nonce();
    const res = await request(app)
      .post("/api/v1/auth/biometric/login")
      .set("X-Client-Platform", "ANDROID")
      .send({ credentialId, deviceId: DEVICE, nonce: n, hmac: hmacOf(secret, n) });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_014");
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(sessionsBefore);
  });
});
