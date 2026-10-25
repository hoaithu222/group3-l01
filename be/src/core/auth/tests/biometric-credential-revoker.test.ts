/**
 * `BiometricCredentialRevoker` (cổng dùng chung thu hồi sinh trắc học — p0-13 §5.5) trên Prisma + Mongo THẬT
 * (`TEST_DB=memory`, MongoMemoryReplSet): `revokeAllForUser` phải thu hồi HẾT credential ACTIVE (kể cả khi hai lượt bật
 * đồng thời làm vượt `perUserMax`), đổi `activeKey` thành `revoked:<id>` để bản mới cùng thiết bị bật lại được.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { LIMITS } from "../../constants/limits";
import { newObjectId } from "../../utils/object-id";
import { BiometricCredentialRevoker } from "../biometric-credential-revoker";

// Chốt an toàn: test này GHI/XOÁ dữ liệu (`deleteMany`) — chỉ chạy trên Mongo memory replset của `global-setup` (`TEST_DB=memory`).
// Không set ⇒ SKIP (không đụng `DATABASE_URL` trong `.env`, thường là cụm MongoDB thật); set nhưng không phải loopback ⇒ từ chối.
const describeMemoryDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
function assertMemoryDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
  }
}

async function seed(userId: string, deviceId: string, overrides: Partial<Prisma.BiometricCredentialUncheckedCreateInput> = {}) {
  return prisma.biometricCredential.create({
    data: {
      userId,
      deviceId,
      platform: "ANDROID",
      deviceName: "Điện thoại của tôi",
      biometryKind: "FINGERPRINT",
      secretHash: "a".repeat(64),
      activeKey: `${userId}:${deviceId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
      ...overrides,
    },
  });
}

describeMemoryDb("BiometricCredentialRevoker (Mongo memory)", () => {
  beforeAll(assertMemoryDatabase);

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.biometricCredential.deleteMany({});
  });

  describe("revokeAllForUser", () => {
    it("thu hồi MỌI credential ACTIVE của người dùng — kể cả khi nhiều hơn perUserMax (không cắt ở perUserMax + 1)", async () => {
      const userId = newObjectId();
      const total = LIMITS.auth.biometric.perUserMax + 3;
      for (let i = 0; i < total; i++) await seed(userId, `device-${i}-abcdefgh`);

      const revoked = await BiometricCredentialRevoker.revokeAllForUser(userId, "PASSWORD_RESET");

      expect(revoked).toBe(total);
      const rows = await prisma.biometricCredential.findMany({ where: { userId } });
      expect(rows).toHaveLength(total);
      for (const row of rows) {
        expect(row.status).toBe("REVOKED");
        expect(row.revokeReason).toBe("PASSWORD_RESET");
        expect(row.revokedAt).toBeInstanceOf(Date);
        expect(row.activeKey).toBe(`revoked:${row.id}`);
        expect(row.revokedBy).toBeNull();
      }
    });

    it("không đụng credential của người khác hay bản đã REVOKED trước đó (giữ nguyên lý do cũ); gọi lại ⇒ 0 (idempotent)", async () => {
      const userId = newObjectId();
      const other = newObjectId();
      const oldRevoked = await seed(userId, "device-old-abcdefgh", {
        status: "REVOKED",
        activeKey: "revoked:seeded",
        revokeReason: "USER_DISABLED",
        revokedAt: new Date(Date.now() - 86_400_000),
      });
      await seed(userId, "device-live-abcdefgh");
      const foreign = await seed(other, "device-other-abcdefgh");

      expect(await BiometricCredentialRevoker.revokeAllForUser(userId, "SESSIONS_REVOKED")).toBe(1);
      expect(await BiometricCredentialRevoker.revokeAllForUser(userId, "SESSIONS_REVOKED")).toBe(0);

      const stillOld = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: oldRevoked.id } });
      expect(stillOld.revokeReason).toBe("USER_DISABLED");
      const untouched = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: foreign.id } });
      expect(untouched.status).toBe("ACTIVE");
      expect(untouched.activeKey).toBe(`${other}:device-other-abcdefgh`);
    });

    it("ghi revokedBy khi người thao tác được truyền vào; người dùng không có credential ⇒ 0", async () => {
      const userId = newObjectId();
      const admin = newObjectId();
      await seed(userId, "device-admin-abcdefgh");

      expect(await BiometricCredentialRevoker.revokeAllForUser(userId, "ADMIN", admin)).toBe(1);
      expect(await BiometricCredentialRevoker.revokeAllForUser(newObjectId(), "ADMIN", admin)).toBe(0);

      const [row] = await prisma.biometricCredential.findMany({ where: { userId } });
      expect(row?.revokedBy).toBe(admin);
    });

    it("sau khi thu hồi, cùng thiết bị bật lại được (activeKey không còn chiếm chỗ)", async () => {
      const userId = newObjectId();
      await seed(userId, "device-again-abcdefgh");
      await BiometricCredentialRevoker.revokeAllForUser(userId, "ACCOUNT_LOCKED");

      const again = await seed(userId, "device-again-abcdefgh");

      expect(again.activeKey).toBe(`${userId}:device-again-abcdefgh`);
      expect(await prisma.biometricCredential.count({ where: { userId, status: "ACTIVE" } })).toBe(1);
    });
  });

  describe("adminListForUser", () => {
    it("che deviceId (chỉ 6 ký tự cuối), không bao giờ trả secretHash; lọc theo trạng thái", async () => {
      const userId = newObjectId();
      await seed(userId, "device-live-abcdef123456");
      await seed(userId, "device-dead-abcdef654321", {
        status: "REVOKED",
        activeKey: "revoked:x",
        revokeReason: "ADMIN",
        revokedAt: new Date(),
      });

      const active = await BiometricCredentialRevoker.adminListForUser(userId);
      const all = await BiometricCredentialRevoker.adminListForUser(userId, "ALL");
      const revoked = await BiometricCredentialRevoker.adminListForUser(userId, "REVOKED");

      expect(active).toHaveLength(1);
      expect(all).toHaveLength(2);
      expect(revoked).toHaveLength(1);
      expect(active[0]?.deviceIdMasked).toBe("••••123456");
      expect(revoked[0]).toMatchObject({ deviceIdMasked: "••••654321", revokeReason: "ADMIN" });
      const serialized = JSON.stringify(all);
      expect(serialized).not.toContain("secretHash");
      expect(serialized).not.toContain("device-live-abcdef123456");
      expect(all.every((row) => !("deviceId" in row) && !("secretHash" in row))).toBe(true);
    });
  });

  describe("revokeOneForUser", () => {
    it("credential không tồn tại hoặc của người khác ⇒ false (không lộ tồn tại); của mình ⇒ true kèm revokedBy; gọi lại ⇒ true (idempotent)", async () => {
      const userId = newObjectId();
      const admin = newObjectId();
      const mine = await seed(userId, "device-mine-abcdefgh");

      expect(await BiometricCredentialRevoker.revokeOneForUser(newObjectId(), mine.id, "ADMIN", admin)).toBe(false);
      expect(await BiometricCredentialRevoker.revokeOneForUser(userId, newObjectId(), "ADMIN", admin)).toBe(false);
      expect((await prisma.biometricCredential.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("ACTIVE");

      expect(await BiometricCredentialRevoker.revokeOneForUser(userId, mine.id, "ADMIN", admin)).toBe(true);
      expect(await BiometricCredentialRevoker.revokeOneForUser(userId, mine.id, "ADMIN", admin)).toBe(true);

      const after = await prisma.biometricCredential.findUniqueOrThrow({ where: { id: mine.id } });
      expect(after).toMatchObject({ status: "REVOKED", revokeReason: "ADMIN", revokedBy: admin, activeKey: `revoked:${mine.id}` });
    });
  });
});
