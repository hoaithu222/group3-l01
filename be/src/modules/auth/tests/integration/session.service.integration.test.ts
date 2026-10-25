/**
 * `SessionService` trên Prisma + Mongo THẬT (`TEST_DB=memory`, MongoMemoryReplSet) + Redis giả có trạng thái.
 *
 * Trước bản sửa, `create()` không ghi `revokedAt` và Prisma+Mongo KHÔNG khớp `{ revokedAt: null }` với trường vắng mặt ⇒
 * `listActive` rỗng, `rotate` luôn báo token không hợp lệ (mất phiên khi access token hết hạn), `revokeAll`/`enforceSessionsMax`
 * không thu hồi được phiên nào. Unit test với Prisma mock không bắt được lớp lỗi này — nên các ca dưới đây chạy trên DB thật.
 */
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { SessionService } from "../../services/session.service";
import { SessionDeviceCleanup } from "../../services/session-device-cleanup";
import { JwtUtils } from "../../../../core/utils/jwt";
import { verifyAccessContext } from "../../../../core/permission/access-context";
import { NotFoundError, ValidationError } from "../../../../core/exceptions";
import { installRedisFake, redisFakeGet, resetRedisFake } from "../support/redis-fake";
import { assertMemoryDatabase, describeMemoryDb } from "../support/memory-db-guard";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRedisMockShape: shape } = require("../support/redis-fake") as typeof import("../support/redis-fake");
  return { redis: shape() };
});

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const HOUR = 3_600_000;

async function createUser(email = "sess@example.com") {
  return prisma.user.create({
    data: { email, name: "Sess", normalizedName: "sess", passwordHash: "hash", status: "ACTIVE" },
  });
}

async function createSession(
  svc: SessionService,
  userId: string,
  token: string,
  overrides: Partial<Parameters<SessionService["create"]>[0]> = {}
): Promise<void> {
  await svc.create({
    userId,
    refreshToken: token,
    expiresAt: new Date(Date.now() + 24 * HOUR),
    ...overrides,
  });
}

describeMemoryDb("SessionService (Mongo thật)", () => {
  beforeAll(assertMemoryDatabase);

  const svc = new SessionService();

  beforeEach(() => {
    resetRedisFake();
    installRedisFake(redis);
  });

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.session.deleteMany({});
    await prisma.biometricCredential.deleteMany({});
    await prisma.deviceToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  describe("create() — ghi null tường minh (Prisma+Mongo không khớp {field:null} với trường vắng mặt)", () => {
    it("tài liệu thô có revokedAt/previousTokenHash/rotatedAt = null và phiên hiện trong listActive", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "tok-1", { userAgent: "UA-1", ipAddress: "1.2.3.4" });

      const raw = (await prisma.$runCommandRaw({ find: "Session", filter: {} })) as unknown as {
        cursor: { firstBatch: Record<string, unknown>[] };
      };
      const doc = raw.cursor.firstBatch[0];
      expect(doc).toHaveProperty("revokedAt", null);
      expect(doc).toHaveProperty("previousTokenHash", null);
      expect(doc).toHaveProperty("rotatedAt", null);
      expect(doc).toHaveProperty("biometricCredentialId", null);

      const listed = await svc.listActive(user.id);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ userAgent: "UA-1", ipAddress: "1.2.3.4", authMethod: "PASSWORD" });
      expect(listed[0]?.expiresAt).toBeInstanceOf(Date);
    });

    it("cắt User-Agent quá dài (header do client tự khai) trước khi lưu", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "tok-1", { userAgent: "x".repeat(5000) });

      const [session] = await svc.listActive(user.id);
      expect(session?.userAgent).toHaveLength(512);
    });

    it("dùng đúng `id` tạo sẵn (để nhúng vào claim sid của token)", async () => {
      const user = await createUser();
      const id = "66f1b2c3d4e5f60718293a4b";
      await createSession(svc, user.id, "tok-1", { id });

      const [session] = await svc.listActive(user.id);
      expect(session?.id).toBe(id);
    });
  });

  describe("phiên CŨ tạo trước bản sửa (thiếu trường revokedAt) vẫn dùng được", () => {
    async function insertLegacySession(userId: string, token: string): Promise<string> {
      const id = "66f1b2c3d4e5f60718293a01";
      await prisma.$runCommandRaw({
        insert: "Session",
        documents: [
          {
            _id: { $oid: id },
            userId: { $oid: userId },
            refreshTokenHash: sha256(token),
            userAgent: null,
            ipAddress: null,
            expiresAt: { $date: new Date(Date.now() + 24 * HOUR).toISOString() },
            createdAt: { $date: new Date().toISOString() },
            lastUsedAt: { $date: new Date().toISOString() },
            authMethod: "PASSWORD",
          },
        ],
      });
      return id;
    }

    it("listActive, rotate và revokeAll đều nhận ra phiên cũ", async () => {
      const user = await createUser();
      const id = await insertLegacySession(user.id, "legacy-token");

      expect((await svc.listActive(user.id)).map((s) => s.id)).toEqual([id]);
      await expect(svc.rotate("legacy-token", "legacy-token-2")).resolves.toMatchObject({ ok: true });
      await expect(svc.revokeAll(user.id)).resolves.toBe(1);
      expect(await svc.listActive(user.id)).toHaveLength(0);
    });
  });

  describe("rotate()", () => {
    it("token hiện tại → xoay (previous = token cũ), token mới dùng tiếp được", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "t0");

      await expect(svc.rotate("t0", "t1")).resolves.toMatchObject({ ok: true });
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.refreshTokenHash).toBe(sha256("t1"));
      expect(session.previousTokenHash).toBe(sha256("t0"));
      expect(session.rotatedAt).toBeInstanceOf(Date);

      await expect(svc.rotate("t1", "t2")).resolves.toMatchObject({ ok: true });
    });

    it("retry mạng (token cũ, trong 30 s) → ok VÀ token trả về được LƯU (dùng tiếp được), không phải token vô dụng", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "t0");
      await svc.rotate("t0", "t1"); // phản hồi bị mất — client chỉ còn t0

      // Client thử lại bằng t0: server phải xoay tiếp và LƯU token mới (t2).
      await expect(svc.rotate("t0", "t2")).resolves.toMatchObject({ ok: true });
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.refreshTokenHash).toBe(sha256("t2"));

      // t2 (token client nhận được ở lần retry) dùng tiếp được; trước bản sửa nó không nằm trong DB ⇒ AUTH_006.
      await expect(svc.rotate("t2", "t3")).resolves.toMatchObject({ ok: true });
    });

    it("hai request ĐỒNG THỜI cùng gửi t0 (vd hai tab dùng chung cookie) → cả hai ok, trạng thái nhất quán, token hiện tại dùng tiếp được", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "t0");

      const [a, b] = await Promise.all([svc.rotate("t0", "ta"), svc.rotate("t0", "tb")]);

      // Không request nào bị coi là dùng lại/không hợp lệ (trước bản sửa: một trong hai nhận token KHÔNG được lưu).
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      // Đúng MỘT token là token hiện tại (cái được ghi sau cùng); token còn lại là "previous" trong cửa sổ tha thứ.
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      const currentToken = session.refreshTokenHash === sha256("ta") ? "ta" : "tb";
      const previousToken = currentToken === "ta" ? "tb" : "ta";
      expect(session.refreshTokenHash).toBe(sha256(currentToken));
      expect(session.previousTokenHash).toBe(sha256(previousToken));
      await expect(svc.rotate(currentToken, "tiep")).resolves.toMatchObject({ ok: true });
    });

    it("token trả về ở lần xoay tha thứ, khi còn là 'previous', vẫn xoay tiếp được trong cửa sổ 30 s", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "t0");
      await svc.rotate("t0", "t1"); // t1 = hiện tại, previous = t0
      await svc.rotate("t0", "t2"); // retry của t0: tha thứ ⇒ hiện tại = t2, previous = t1

      // t1 (nếu tab kia còn giữ) vẫn dùng được trong cửa sổ tha thứ và không bị coi là reuse.
      await expect(svc.rotate("t1", "t3")).resolves.toMatchObject({ ok: true });
    });

    it("token cũ QUÁ 30 s (reuse) → thu hồi MỌI phiên, tăng sessionVersion, thu hồi sinh trắc học", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "t0");
      await createSession(svc, user.id, "khac-thiet-bi");
      const credential = await prisma.biometricCredential.create({
        data: {
          userId: user.id,
          deviceId: "device-12345678",
          platform: "ANDROID",
          biometryKind: "FINGERPRINT",
          secretHash: "a".repeat(64),
          activeKey: `${user.id}:device-12345678`,
          expiresAt: new Date(Date.now() + 24 * HOUR),
        },
      });
      await svc.rotate("t0", "t1");
      await prisma.session.updateMany({
        where: { previousTokenHash: sha256("t0") },
        data: { rotatedAt: new Date(Date.now() - 31_000) },
      });

      await expect(svc.rotate("t0", "t-ke-trom")).resolves.toEqual({ ok: false, reuse: true });

      expect(await svc.listActive(user.id)).toHaveLength(0);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.sessionVersion).toBe(user.sessionVersion + 1);
      const revoked = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: credential.id } });
      expect(revoked).toMatchObject({ status: "REVOKED", revokeReason: "REUSE_DETECTED" });
      // Token hợp lệ của chính chủ cũng bị vô hiệu (họ phiên đã thu hồi).
      await expect(svc.rotate("t1", "t2")).resolves.toEqual({ ok: false, reuse: false });
    });

    it("token lạ / phiên đã thu hồi / phiên hết hạn → { ok:false, reuse:false }", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "revoked");
      await createSession(svc, user.id, "expired", { expiresAt: new Date(Date.now() - HOUR) });
      await svc.revokeByToken("revoked");

      await expect(svc.rotate("khong-ton-tai", "x")).resolves.toEqual({ ok: false, reuse: false });
      await expect(svc.rotate("revoked", "x")).resolves.toEqual({ ok: false, reuse: false });
      await expect(svc.rotate("expired", "x")).resolves.toEqual({ ok: false, reuse: false });
    });
  });

  describe("enforceSessionsMax()", () => {
    it("vượt trần thì thu hồi các phiên lastUsedAt CŨ NHẤT", async () => {
      const user = await createUser();
      for (let i = 0; i < 5; i++) {
        await createSession(svc, user.id, `t${i}`);
        await prisma.session.updateMany({
          where: { refreshTokenHash: sha256(`t${i}`) },
          data: { lastUsedAt: new Date(Date.now() - (5 - i) * 1000) },
        });
      }

      await svc.enforceSessionsMax(user.id, 3);

      const alive = await svc.listActive(user.id);
      expect(alive).toHaveLength(3);
      // t2, t3, t4 mới dùng gần nhất ⇒ được giữ.
      await expect(svc.rotate("t0", "x")).resolves.toEqual({ ok: false, reuse: false });
      await expect(svc.rotate("t4", "t4b")).resolves.toMatchObject({ ok: true });
    });
  });

  describe("thu hồi phiên", () => {
    it("revokeOthers giữ đúng phiên hiện tại (theo sessionId) và trả số phiên đã thu hồi", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "a", { id: "66f1b2c3d4e5f60718293a11" });
      await createSession(svc, user.id, "b", { id: "66f1b2c3d4e5f60718293a12" });
      await createSession(svc, user.id, "c", { id: "66f1b2c3d4e5f60718293a13" });

      const revoked = await svc.revokeOthers(user.id, { sessionId: "66f1b2c3d4e5f60718293a12" });

      expect(revoked).toBe(2);
      expect((await svc.listActive(user.id)).map((s) => s.id)).toEqual(["66f1b2c3d4e5f60718293a12"]);
      // Dấu "phiên đã thu hồi" cho phiên bị thu hồi — access token của chúng chết NGAY.
      expect(redisFakeGet("session:revoked:66f1b2c3d4e5f60718293a11")).not.toBeNull();
      expect(redisFakeGet("session:revoked:66f1b2c3d4e5f60718293a12")).toBeNull();
    });

    it("revokeOthers nhận phiên hiện tại qua refresh token (cookie web) — chuỗi trần = refresh token", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "giu-lai");
      await createSession(svc, user.id, "bo-di");

      expect(await svc.revokeOthers(user.id, "giu-lai")).toBe(1);
      expect(await svc.listActive(user.id)).toHaveLength(1);
    });

    it("revokeOthers không xác định được phiên hiện tại ⇒ thu hồi TẤT CẢ", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "a");
      await createSession(svc, user.id, "b");

      expect(await svc.revokeOthers(user.id)).toBe(2);
      expect(await svc.listActive(user.id)).toHaveLength(0);
    });

    it("revokeAll: thu hồi mọi phiên + tăng sessionVersion + thu hồi sinh trắc học theo lý do", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "a");
      await createSession(svc, user.id, "b");
      const other = await createUser("khac@example.com");
      await createSession(svc, other.id, "cua-nguoi-khac");

      await expect(svc.revokeAll(user.id, "ACCOUNT_LOCKED")).resolves.toBe(2);

      expect(await svc.listActive(user.id)).toHaveLength(0);
      expect(await svc.listActive(other.id)).toHaveLength(1);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.sessionVersion).toBe(user.sessionVersion + 1);
    });

    it("revoke(): không thu hồi được phiên hiện tại (400), thu hồi phiên khác OK và idempotent, phiên của người khác → 404", async () => {
      const user = await createUser();
      const other = await createUser("khac@example.com");
      await createSession(svc, user.id, "hien-tai", { id: "66f1b2c3d4e5f60718293a21" });
      await createSession(svc, user.id, "khac", { id: "66f1b2c3d4e5f60718293a22" });
      await createSession(svc, other.id, "cua-nguoi-khac", { id: "66f1b2c3d4e5f60718293a23" });
      const current = { sessionId: "66f1b2c3d4e5f60718293a21" };

      await expect(svc.revoke("66f1b2c3d4e5f60718293a21", user.id, current)).rejects.toBeInstanceOf(ValidationError);
      await expect(svc.revoke("66f1b2c3d4e5f60718293a22", user.id, current)).resolves.toBeUndefined();
      await expect(svc.revoke("66f1b2c3d4e5f60718293a22", user.id, current)).resolves.toBeUndefined();
      await expect(svc.revoke("66f1b2c3d4e5f60718293a23", user.id, current)).rejects.toBeInstanceOf(NotFoundError);

      expect((await svc.listActive(user.id)).map((s) => s.id)).toEqual(["66f1b2c3d4e5f60718293a21"]);
    });

    it("revokeByToken ràng phiên theo userId (không đăng xuất hộ phiên của người khác)", async () => {
      const user = await createUser();
      const other = await createUser("khac@example.com");
      await createSession(svc, user.id, "tok-cua-user");

      await expect(svc.revokeByToken("tok-cua-user", other.id)).resolves.toBeNull();
      expect(await svc.listActive(user.id)).toHaveLength(1);
      await expect(svc.revokeByToken("tok-cua-user", user.id)).resolves.not.toBeNull();
      expect(await svc.listActive(user.id)).toHaveLength(0);
    });

    it("revokeByToken cũng nhận token vừa bị xoay (logout ngay sau khi refresh)", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "t0");
      await svc.rotate("t0", "t1");

      await expect(svc.revokeByToken("t0")).resolves.not.toBeNull();
      expect(await svc.listActive(user.id)).toHaveLength(0);
    });
  });

  describe("applyPasswordChange() — đổi mật khẩu + thu hồi phiên NGUYÊN TỬ", () => {
    it("ghi passwordHash/passwordChangedAt, tăng sessionVersion, thu hồi phiên khác và GIỮ phiên hiện tại", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "hien-tai", { id: "66f1b2c3d4e5f60718293a31" });
      await createSession(svc, user.id, "khac-1");
      await createSession(svc, user.id, "khac-2");

      const result = await svc.applyPasswordChange(user.id, "hash-moi", {
        keep: { sessionId: "66f1b2c3d4e5f60718293a31" },
        reason: "PASSWORD_CHANGED",
      });

      expect(result).toEqual({ revokedSessions: 2, sessionVersion: user.sessionVersion + 1 });
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.passwordHash).toBe("hash-moi");
      expect(after.passwordChangedAt).toBeInstanceOf(Date);
      expect((await svc.listActive(user.id)).map((s) => s.id)).toEqual(["66f1b2c3d4e5f60718293a31"]);
    });

    it("không truyền `keep` (đặt lại mật khẩu) ⇒ thu hồi TẤT CẢ; thu hồi cả credential sinh trắc học", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "a");
      await createSession(svc, user.id, "b");
      const credential = await prisma.biometricCredential.create({
        data: {
          userId: user.id,
          deviceId: "device-12345678",
          platform: "IOS",
          biometryKind: "FACE",
          secretHash: "b".repeat(64),
          activeKey: `${user.id}:device-12345678`,
          expiresAt: new Date(Date.now() + 24 * HOUR),
        },
      });

      const result = await svc.applyPasswordChange(user.id, "hash-moi", { reason: "PASSWORD_RESET" });

      expect(result.revokedSessions).toBe(2);
      expect(await svc.listActive(user.id)).toHaveLength(0);
      const revoked = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: credential.id } });
      expect(revoked).toMatchObject({ status: "REVOKED", revokeReason: "PASSWORD_RESET" });
    });

    it("lỗi giữa chừng ⇒ ROLLBACK: mật khẩu và phiên đều giữ nguyên", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "a");
      // userId không tồn tại ⇒ `tx.user.update` ném P2025 SAU khi đã thu hồi phiên trong cùng transaction.
      const ghostId = "66f1b2c3d4e5f60718293aff";
      await createSession(svc, ghostId, "cua-ma");

      await expect(
        svc.applyPasswordChange(ghostId, "hash-moi", { reason: "PASSWORD_CHANGED" })
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      expect(await svc.listActive(ghostId)).toHaveLength(1);
      expect(await svc.listActive(user.id)).toHaveLength(1);
    });
  });

  describe("thu hồi TỨC THÌ một phiên qua claim `sid` (verifyAccessContext)", () => {
    it("access token mang sid của phiên đã bị thu hồi bị từ chối NGAY (AUTH_004); phiên khác vẫn hợp lệ", async () => {
      const user = await createUser();
      const sidA = "66f1b2c3d4e5f60718293a41";
      const sidB = "66f1b2c3d4e5f60718293a42";
      await createSession(svc, user.id, "a", { id: sidA });
      await createSession(svc, user.id, "b", { id: sidB });
      const tokenFor = (sid: string): string =>
        JwtUtils.generateAccessToken({ userId: user.id, email: user.email, role: "user", sv: user.sessionVersion, sid });

      await expect(verifyAccessContext(tokenFor(sidA))).resolves.toMatchObject({
        user: { id: user.id, sessionId: sidA },
      });

      await svc.revoke(sidA, user.id, { sessionId: sidB });

      await expect(verifyAccessContext(tokenFor(sidA))).rejects.toMatchObject({
        statusCode: 401,
        errorCode: "AUTH_004",
      });
      await expect(verifyAccessContext(tokenFor(sidB))).resolves.toMatchObject({ user: { sessionId: sidB } });
    });

    it("token cũ không có claim sid vẫn hợp lệ (tương thích ngược)", async () => {
      const user = await createUser();
      const token = JwtUtils.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: "user",
        sv: user.sessionVersion,
      });

      await expect(verifyAccessContext(token)).resolves.toMatchObject({ user: { id: user.id } });
    });
  });

  // ── Thu hồi phiên TỪ XA gỡ push token của thiết bị (trước đây chỉ POST /auth/logout gỡ) ─────────────────────────────────────────
  describe("thu hồi phiên từ xa gỡ push token (DeviceToken) của thiết bị đó", () => {
    async function seedDevice(userId: string, deviceId: string, kind: "FCM" | "APNS_VOIP" = "FCM") {
      return prisma.deviceToken.create({
        data: {
          userId,
          deviceId,
          platform: "ANDROID",
          kind,
          token: `tok-${kind}-${userId}-${deviceId}`,
          revokedAt: null,
          revokeReason: null,
        },
      });
    }
    const activeDevices = async (userId: string): Promise<string[]> =>
      (await prisma.deviceToken.findMany({ where: { userId, revokedAt: null } })).map((d) => d.deviceId).sort();

    it("thu hồi MỘT phiên: chỉ thiết bị của phiên đó bị gỡ push (mọi loại token), thiết bị khác giữ nguyên", async () => {
      const user = await createUser();
      const a = "66f1b2c3d4e5f60718293b01";
      const b = "66f1b2c3d4e5f60718293b02";
      await createSession(svc, user.id, "a", { id: a, deviceId: "dev-a-12345678" });
      await createSession(svc, user.id, "b", { id: b, deviceId: "dev-b-12345678" });
      await seedDevice(user.id, "dev-a-12345678");
      await seedDevice(user.id, "dev-b-12345678");
      await seedDevice(user.id, "dev-b-12345678", "APNS_VOIP");

      await svc.revoke(b, user.id, { sessionId: a });

      expect(await activeDevices(user.id)).toEqual(["dev-a-12345678"]);
      const gone = await prisma.deviceToken.findMany({ where: { userId: user.id, deviceId: "dev-b-12345678" } });
      expect(gone).toHaveLength(2);
      expect(gone.every((d) => d.revokedAt instanceof Date && d.revokeReason === "LOGOUT")).toBe(true);
    });

    it("hai phiên CÙNG thiết bị: thu hồi phiên cũ KHÔNG gỡ push (máy vẫn còn phiên mới); thu hồi nốt phiên cuối mới gỡ", async () => {
      const user = await createUser();
      const old = "66f1b2c3d4e5f60718293b11";
      const fresh = "66f1b2c3d4e5f60718293b12";
      const other = "66f1b2c3d4e5f60718293b13";
      await createSession(svc, user.id, "old", { id: old, deviceId: "dev-x-12345678" });
      await createSession(svc, user.id, "fresh", { id: fresh, deviceId: "dev-x-12345678" });
      await createSession(svc, user.id, "other", { id: other, deviceId: "dev-o-12345678" });
      await seedDevice(user.id, "dev-x-12345678");

      await svc.revoke(old, user.id, { sessionId: other });
      expect(await activeDevices(user.id)).toEqual(["dev-x-12345678"]);

      await svc.revoke(fresh, user.id, { sessionId: other });
      expect(await activeDevices(user.id)).toEqual([]);
    });

    it("revokeAll (khoá tài khoản, yêu cầu xoá, đăng xuất mọi nơi, reuse): gỡ push của MỌI thiết bị, kể cả thiết bị không còn bản ghi phiên", async () => {
      const user = await createUser();
      await createSession(svc, user.id, "a", { deviceId: "dev-a-12345678" });
      await seedDevice(user.id, "dev-a-12345678");
      await seedDevice(user.id, "dev-khong-phien-1"); // token còn sót từ phiên đã hết hạn/xoá

      await svc.revokeAll(user.id, "ACCOUNT_LOCKED");

      expect(await activeDevices(user.id)).toEqual([]);
      expect(await svc.listActive(user.id)).toHaveLength(0);
    });

    it("đổi mật khẩu GIỮ phiên hiện tại: thiết bị của phiên được giữ vẫn nhận push, thiết bị bị đăng xuất thì không; không giữ phiên nào ⇒ gỡ hết", async () => {
      const user = await createUser();
      const keep = "66f1b2c3d4e5f60718293b21";
      await createSession(svc, user.id, "keep", { id: keep, deviceId: "dev-keep-1234567" });
      await createSession(svc, user.id, "gone", { deviceId: "dev-gone-1234567" });
      await seedDevice(user.id, "dev-keep-1234567");
      await seedDevice(user.id, "dev-gone-1234567");

      await svc.applyPasswordChange(user.id, "hash-moi", { keep: { sessionId: keep }, reason: "PASSWORD_CHANGED" });
      expect(await activeDevices(user.id)).toEqual(["dev-keep-1234567"]);

      await svc.applyPasswordChange(user.id, "hash-moi-2", { reason: "PASSWORD_RESET" });
      expect(await activeDevices(user.id)).toEqual([]);
    });

    it("revokeOthers: gỡ push của các thiết bị bị đăng xuất, giữ thiết bị của phiên hiện tại", async () => {
      const user = await createUser();
      const keep = "66f1b2c3d4e5f60718293b31";
      await createSession(svc, user.id, "keep", { id: keep, deviceId: "dev-keep-1234567" });
      await createSession(svc, user.id, "gone", { deviceId: "dev-gone-1234567" });
      await seedDevice(user.id, "dev-keep-1234567");
      await seedDevice(user.id, "dev-gone-1234567");

      await svc.revokeOthers(user.id, { sessionId: keep });

      expect(await activeDevices(user.id)).toEqual(["dev-keep-1234567"]);
    });

    it("phiên không ghi deviceId (client không gửi X-Device-Id): thu hồi phiên vẫn thành công, push token không bị đụng", async () => {
      const user = await createUser();
      const a = "66f1b2c3d4e5f60718293b41";
      const b = "66f1b2c3d4e5f60718293b42";
      await createSession(svc, user.id, "a", { id: a });
      await createSession(svc, user.id, "b", { id: b });
      await seedDevice(user.id, "dev-a-12345678");

      await svc.revoke(b, user.id, { sessionId: a });

      expect(await activeDevices(user.id)).toEqual(["dev-a-12345678"]);
    });

    it("dọn push lỗi (DeviceService hỏng) KHÔNG làm hỏng việc thu hồi phiên: phiên vẫn bị thu hồi, sessionVersion vẫn tăng", async () => {
      const broken = new SessionService(
        new SessionDeviceCleanup({
          listActive: () => Promise.reject(new Error("devices down")),
          unregister: () => Promise.reject(new Error("devices down")),
        })
      );
      const user = await createUser();
      await createSession(broken, user.id, "a", { deviceId: "dev-a-12345678" });

      await expect(broken.revokeAll(user.id)).resolves.toBe(1);

      expect(await broken.listActive(user.id)).toHaveLength(0);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(user.sessionVersion + 1);
    });

    it("SessionDeviceCleanup(null) tắt hẳn việc dọn push (test/không cần thiết bị)", async () => {
      const noDevices = new SessionService(new SessionDeviceCleanup(null));
      const user = await createUser();
      await createSession(noDevices, user.id, "a", { deviceId: "dev-a-12345678" });
      await seedDevice(user.id, "dev-a-12345678");

      await noDevices.revokeAll(user.id);

      expect(await activeDevices(user.id)).toEqual(["dev-a-12345678"]);
    });
  });
});
