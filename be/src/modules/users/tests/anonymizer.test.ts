/**
 * SEC-10 (be.md p0-01 §10) — dùng Prisma thật qua `TEST_DB=memory`
 * (MongoMemoryReplSet, xem `src/tests/global-setup.ts`) vì `UserAnonymizer`
 * mở transaction chéo User+Session+DeviceToken+NotificationPreference+OutboxEvent,
 * không thể giả lập đủ bằng repo in-memory. Redis (client `redis`) được mock
 * tự động ở tầng "unit" (`src/tests/setup.ts`).
 *
 * `outboxSignal()` (PUBLISH qua ioredis riêng `queueConnection`, KHÔNG phải
 * client `redis` ở trên) bị mock riêng ở đây: nó dùng
 * `maxRetriesPerRequest: null` (bắt buộc cho BullMQ) nên khi Redis không có
 * sẵn, promise treo VÔ THỜI HẠN thay vì reject nhanh (không phải lỗi của code
 * lượt này — `outbox.add()`/`withTransaction()` là hạ tầng có sẵn, tái dùng
 * nguyên trạng) — mock để test này chỉ phụ thuộc Mongo thật, không phụ thuộc
 * Redis thật.
 */
jest.mock("../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});

import { prisma } from "../../../infrastructure/database";
import { UserAnonymizer } from "../services/user-anonymizer";

// Chốt an toàn: test này GHI/XOÁ dữ liệu (`deleteMany({})`) — chỉ chạy trên Mongo memory replset của `global-setup` (`TEST_DB=memory`).
// Không set ⇒ SKIP (không đụng `DATABASE_URL` trong `.env`, thường là cụm MongoDB thật); set nhưng không phải loopback ⇒ từ chối.
const describeMemoryDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
function assertMemoryDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
  }
}

describeMemoryDb("UserAnonymizer (Mongo memory replset)", () => {
  beforeAll(assertMemoryDatabase);

  const anonymizer = new UserAnonymizer();
  let userId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        email: "victim@example.com",
        name: "Victim",
        normalizedName: "victim",
        passwordHash: "hashed",
        status: "PENDING_DELETION",
        sessionVersion: 3,
        verificationToken: "abc123",
        phone: "+84912345678",
      },
    });
    userId = user.id;

    await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: "h1",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.deviceToken.create({
      data: { userId, deviceId: "d1", platform: "ANDROID", kind: "FCM", token: `tok-${userId}` },
    });
    await prisma.biometricCredential.create({
      data: {
        userId,
        deviceId: "d1",
        platform: "ANDROID",
        biometryKind: "FINGERPRINT",
        secretHash: "a".repeat(64),
        activeKey: `${userId}:d1`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.notificationPreference.create({
      data: { userId, scope: "ACCOUNT", scopeKey: "account" },
    });
    await prisma.userPaymentProfile.create({
      data: { userId, bankBin: "970436", accountNumberEnc: "enc", accountLast4: "9012", accountName: "NGUYEN VAN A" },
    });
  });

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.user.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.deviceToken.deleteMany({});
    await prisma.biometricCredential.deleteMany({});
    await prisma.notificationPreference.deleteMany({});
    await prisma.userPaymentProfile.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
  });

  it("ghi đè PII đúng D-02, xoá Session/DeviceToken/NotificationPreference, ghi outbox user.anonymized", async () => {
    await anonymizer.anonymize(userId);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.email).toBe(`deleted+${userId}@anon.local`);
    expect(updated.name).toBe("Tài khoản đã xoá");
    expect(updated.normalizedName).toBe("tai khoan da xoa");
    expect(updated.avatarAssetId).toBeNull();
    expect(updated.passwordHash).toBeNull();
    expect(updated.verificationToken).toBeNull();
    // Số điện thoại tự khai (tra cứu được) là PII — phải bị xoá cùng email/tên.
    expect(updated.phone).toBeNull();
    expect(updated.privacy).toBeNull();
    expect(updated.status).toBe("ANONYMIZED");
    expect(updated.anonymizedAt).not.toBeNull();
    expect(updated.sessionVersion).toBe(4);

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.deviceToken.count({ where: { userId } })).toBe(0);
    // p0-13/D-26: credential sinh trắc học (gắn deviceId) cũng bị xoá — mode NOW gọi thẳng anonymizer, không qua revokeAll.
    expect(await prisma.biometricCredential.count({ where: { userId } })).toBe(0);
    expect(await prisma.notificationPreference.count({ where: { userId } })).toBe(0);
    expect(await prisma.userPaymentProfile.count({ where: { userId } })).toBe(0);

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: userId, type: "user.anonymized" },
    });
    // Một dòng cho queue `notifications` (chưa có consumer Phase 1) + một dòng RIÊNG cho mỗi module tiêu thụ
    // (study/gamification/career/discovery/portfolio) — mỗi cặp (queue, jobName) chỉ có MỘT processor nên không dùng chung dòng.
    expect(events.map((e) => e.dedupeKey).sort()).toEqual(
      [
        `chat-extensions.on-user-anonymized:user:${userId}`,
        `career.user-anonymized:user:${userId}`,
        `discovery.user-anonymized:user:${userId}`,
        `gamification.user-anonymized:user:${userId}`,
        `portfolio.on-user-anonymized:user:${userId}`,
        `study.user-anonymized:user:${userId}`,
        `wellbeing.user-anonymized:user:${userId}`,
        `user.anonymized:user:${userId}`,
      ].sort()
    );
    const main = events.find((e) => e.dedupeKey === `user.anonymized:user:${userId}`);
    expect(main?.jobName).toBe("user.anonymized");
    expect(main?.queue).toBe("notifications");
    // p6-06: dòng RIÊNG cho consumer `career.user-anonymized` (queue `gamification`) — job xoá dữ liệu nghề nghiệp cá nhân.
    const career = events.find((e) => e.dedupeKey === `career.user-anonymized:user:${userId}`);
    expect(career).toMatchObject({ queue: "gamification", jobName: "career.user-anonymized", aggregateId: userId });
    expect(career?.payload).toMatchObject({ userId });
    // p6-07: dòng RIÊNG cho consumer `portfolio.on-user-anonymized` (queue `notifications`) — gỡ portfolio (trang 404, xoá object build, giữ slug 30 ngày).
    const portfolio = events.find((e) => e.dedupeKey === `portfolio.on-user-anonymized:user:${userId}`);
    expect(portfolio).toMatchObject({ queue: "notifications", jobName: "portfolio.on-user-anonymized", aggregateId: userId });
    expect(portfolio?.payload).toMatchObject({ userId });
    // p1-09: dòng RIÊNG cho consumer `discovery.user-anonymized` (queue `reports`) — job xoá tin đã lưu.
    const discovery = events.find((e) => e.dedupeKey === `discovery.user-anonymized:user:${userId}`);
    expect(discovery).toMatchObject({ queue: "reports", jobName: "discovery.user-anonymized", aggregateId: userId });
    // `outbox.add` luôn bọc payload trong phong bì `{ schemaVersion: 1, ...payload }` (outbox.writer.ts) — khoá cả phong bì lẫn nội dung.
    expect(discovery?.payload).toEqual({ schemaVersion: 1, userId });
  });

  it("SEC-10: chạy 2 lần idempotent — lần 2 KHÔNG ghi đè lại, outbox không thêm bản ghi nào", async () => {
    const firstAt = await anonymizer.anonymize(userId);
    const secondAt = await anonymizer.anonymize(userId);

    expect(secondAt.getTime()).toBe(firstAt.getTime());

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: userId, type: "user.anonymized" },
    });
    // 6 dòng của lần chạy đầu (notifications + study + gamification + career + discovery + portfolio); lần 2 không ghi thêm dòng nào.
    expect(events).toHaveLength(6);
  });
});
