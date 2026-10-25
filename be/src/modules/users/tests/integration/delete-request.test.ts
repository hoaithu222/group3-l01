/**
 * SEC-09 (be.md p0-01 §10) — dùng Prisma thật (project "integration") qua
 * `TEST_DB=memory` (MongoMemoryReplSet). `mailService.enqueueMail` bị mock để
 * không thật sự enqueue job BullMQ (không kiểm nội dung mail ở đây) —
 * `outboxSignal()` cũng bị mock (xem comment dưới), nên test này KHÔNG cần
 * Redis thật dù chạy trong project "integration" (setup không mock Redis,
 * nhưng code test cũng không chạm client `redis` cho tới lượt viết
 * `invalidateUserStatusCache` — vẫn qua client `redis` thật nếu có, graceful
 * nếu không có do try/catch trong `SessionService`/`AuditService` không áp
 * dụng ở đây; `redis.del` của `@infrastructure/redis` KHÔNG có
 * `maxRetriesPerRequest: null` như `queueConnection` nên fail nhanh thay vì
 * treo — an toàn ngay cả khi Redis thật sự không có).
 */
const mockEnqueueMail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../infrastructure/mail", () => ({
  mailService: { enqueueMail: (...args: unknown[]) => mockEnqueueMail(...(args as [])) },
}));

// `outboxSignal()` PUBLISH qua ioredis riêng (`queueConnection`,
// `maxRetriesPerRequest: null` — bắt buộc cho BullMQ) — nếu Redis không có
// sẵn, promise treo vô thời hạn thay vì reject (đặc tính của hạ tầng outbox
// có sẵn, không phải lỗi ở đây). Mock để test này chỉ cần Mongo thật; hành vi
// dispatch thật của outbox đã có `queue/tests/integration/outbox.test.ts`
// riêng (dùng `prisma.$transaction` trực tiếp, không qua `withTransaction`).
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});

import bcrypt from "bcryptjs";
import { prisma } from "../../../../infrastructure/database";
import { UserService } from "../../services/user.service";
import { UserAnonymizer } from "../../services/user-anonymizer";
import { PrismaUserRepository } from "../../repositories";
import { SessionService } from "../../../auth/services/session.service";
import { AuditService } from "../../../audit-log/audit-log.service";

const PASSWORD = "Sup3rSecret!";

// Chốt an toàn: test này GHI/XOÁ dữ liệu (`deleteMany({})`) — chỉ chạy trên Mongo memory replset của `global-setup` (`TEST_DB=memory`).
// Không set ⇒ SKIP (không đụng `DATABASE_URL` trong `.env`, thường là cụm MongoDB thật); set nhưng không phải loopback ⇒ từ chối.
const describeMemoryDb = process.env.TEST_DB === "memory" ? describe : describe.skip;
function assertMemoryDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
  }
}

describeMemoryDb("delete-request flow (Mongo + Redis thật)", () => {
  beforeAll(assertMemoryDatabase);

  const repo = new PrismaUserRepository();
  const sessions = new SessionService();
  const audit = new AuditService();
  const service = new UserService(repo, sessions, audit);

  async function createUser(email: string, overrides: { emailVerified?: boolean } = {}) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    return prisma.user.create({
      data: { email, name: "Del Me", normalizedName: "del me", passwordHash, status: "ACTIVE", ...overrides },
    });
  }

  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá implementation trước MỖI test —
    // gắn lại `.mockResolvedValue` mỗi lần, giống `queue/tests/integration/outbox.test.ts`.
    mockEnqueueMail.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.user.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.deviceToken.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
    await prisma.auditLog.deleteMany({});
  });

  it("SEC-09: request → PENDING_DELETION (mật khẩu sai bị chặn) → cancel → ACTIVE", async () => {
    const user = await createUser("del@example.com");

    await expect(service.requestDeletion(user.id, "sai-mat-khau")).rejects.toMatchObject({
      statusCode: 401,
    });

    const requested = await service.requestDeletion(user.id, PASSWORD);
    expect(requested.status).toBe("PENDING_DELETION");
    expect(requested.deletionGraceUntil).toBeInstanceOf(Date);
    expect(mockEnqueueMail).toHaveBeenCalledTimes(1);

    const afterRequest = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(afterRequest.status).toBe("PENDING_DELETION");
    expect(afterRequest.deletionRequestedAt).not.toBeNull();
    expect(afterRequest.sessionVersion).toBeGreaterThan(user.sessionVersion);

    // Idempotent — gọi lại trong lúc đang PENDING_DELETION trả nguyên trạng thái, không tạo outbox thêm.
    const again = await service.requestDeletion(user.id, PASSWORD);
    expect(again.status).toBe("PENDING_DELETION");

    const events = await prisma.outboxEvent.count({
      where: { aggregateId: user.id, type: "user.session-invalidated" },
    });
    expect(events).toBe(1);

    const cancelled = await service.cancelDeletion(user.email, PASSWORD);
    expect(cancelled.status).toBe("ACTIVE");

    const afterCancel = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(afterCancel.status).toBe("ACTIVE");
    expect(afterCancel.deletionGraceUntil).toBeNull();
    expect(afterCancel.deletionRequestedAt).toBeNull();
  });

  it("cancelDeletion (USER_011) khi tài khoản không ở PENDING_DELETION", async () => {
    const user = await createUser("active@example.com");

    await expect(service.cancelDeletion(user.email, PASSWORD)).rejects.toMatchObject({
      errorCode: "USER_011",
      statusCode: 409,
    });
  });

  it("anonymizeAdmin mode GRACE → PENDING_DELETION (dùng chung beginDeletionGrace với requestDeletion) → cancelDeletionAdmin → ACTIVE", async () => {
    const admin = await createUser("admin@example.com");
    const target = await createUser("target-grace@example.com");

    const result = await service.anonymizeAdmin(
      target.id,
      { id: admin.id, role: "admin" },
      { mode: "GRACE", reason: "Vi phạm điều khoản sử dụng nghiêm trọng" }
    );
    expect(result.status).toBe("PENDING_DELETION");
    expect(result.deletionGraceUntil).toBeInstanceOf(Date);

    const afterGrace = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(afterGrace.status).toBe("PENDING_DELETION");

    // Idempotent — gọi lại GRACE lần 2 khi đã PENDING_DELETION không tạo outbox thêm.
    await service.anonymizeAdmin(
      target.id,
      { id: admin.id, role: "admin" },
      { mode: "GRACE", reason: "Vi phạm điều khoản sử dụng nghiêm trọng" }
    );
    const events = await prisma.outboxEvent.count({
      where: { aggregateId: target.id, type: "user.session-invalidated" },
    });
    expect(events).toBe(1);

    const cancelled = await service.cancelDeletionAdmin(
      target.id,
      { id: admin.id, role: "admin" },
      "Xác minh lại — không còn vi phạm"
    );
    expect(cancelled.status).toBe("ACTIVE");
  });

  it("anonymizeAdmin mode NOW → ANONYMIZED ngay (gọi UserAnonymizer thật)", async () => {
    const admin = await createUser("admin2@example.com");
    const target = await createUser("target-now@example.com");

    const result = await service.anonymizeAdmin(
      target.id,
      { id: admin.id, role: "admin" },
      { mode: "NOW", reason: "Vi phạm điều khoản sử dụng nghiêm trọng", confirmEmail: target.email }
    );
    expect(result.status).toBe("ANONYMIZED");
    expect(result.anonymizedAt).toBeInstanceOf(Date);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.status).toBe("ANONYMIZED");
    expect(after.email).toBe(`deleted+${target.id}@anon.local`);
  });

  it("request rồi hết hạn ân hạn → UserAnonymizer chạy → ANONYMIZED (mô phỏng job user.anonymize)", async () => {
    const user = await createUser("expire@example.com");
    await service.requestDeletion(user.id, PASSWORD);

    // Mô phỏng đã quá `deletionGraceUntil` — job `user.anonymize` (cron) quét
    // theo đúng điều kiện này (xem `modules/users/jobs/user.jobs.ts`), test
    // đơn vị riêng (`user.jobs.test.ts`) đã phủ phần "quét + cô lập lỗi từng
    // user"; ở đây chỉ xác nhận trạng thái CUỐI đúng sau khi anonymizer chạy.
    await prisma.user.update({
      where: { id: user.id },
      data: { deletionGraceUntil: new Date(Date.now() - 1000) },
    });

    const due = await prisma.user.findMany({
      where: { status: "PENDING_DELETION", deletionGraceUntil: { lte: new Date() } },
      select: { id: true },
    });
    expect(due.map((u) => u.id)).toContain(user.id);

    await new UserAnonymizer().anonymize(user.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.status).toBe("ANONYMIZED");
    expect(after.anonymizedAt).not.toBeNull();
    expect(after.email).toBe(`deleted+${user.id}@anon.local`);
  });

  // ── Bổ sung (rà soát auth BE 2026-09-25) ────────────────────────────────────────────────────────────
  describe("DELETE /users/:id (deprecated) — requestAnonymize dùng chung beginDeletionGrace", () => {
    it("đặt PENDING_DELETION KÈM deletionGraceUntil/deletionRequestedAt (trước đây thiếu ⇒ tài khoản kẹt vĩnh viễn: không huỷ được USER_011, job không nhặt)", async () => {
      const admin = await createUser("admin-alias@example.com");
      const target = await createUser("target-alias@example.com");
      await sessions.create({
        userId: target.id,
        refreshToken: "alias-token",
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const returned = await service.requestAnonymize(target.id, admin.id, "Vi phạm điều khoản sử dụng nghiêm trọng");

      expect(returned.status).toBe("PENDING_DELETION");
      expect("passwordHash" in returned).toBe(false);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.status).toBe("PENDING_DELETION");
      expect(after.deletionRequestedAt).toBeInstanceOf(Date);
      expect(after.deletionGraceUntil).toBeInstanceOf(Date);
      const graceDays = ((after.deletionGraceUntil as Date).getTime() - Date.now()) / 86_400_000;
      expect(graceDays).toBeGreaterThan(6.9);
      expect(graceDays).toBeLessThanOrEqual(7.01);
      expect(after.sessionVersion).toBeGreaterThan(target.sessionVersion);
      expect(await prisma.session.count({ where: { userId: target.id, revokedAt: { not: null } } })).toBe(1);
      expect(
        await prisma.outboxEvent.count({ where: { aggregateId: target.id, type: "user.session-invalidated" } })
      ).toBe(1);
    });

    it("huỷ được (cancelDeletionAdmin) và job user.anonymize nhặt được sau ân hạn — không còn kẹt", async () => {
      const admin = await createUser("admin-alias2@example.com");
      const target = await createUser("target-alias2@example.com");
      await service.requestAnonymize(target.id, admin.id, "Vi phạm điều khoản sử dụng nghiêm trọng");

      const cancelled = await service.cancelDeletionAdmin(
        target.id,
        { id: admin.id, role: "admin" },
        "Xác minh lại — không còn vi phạm"
      );
      expect(cancelled.status).toBe("ACTIVE");

      await service.requestAnonymize(target.id, admin.id, "Vi phạm điều khoản sử dụng nghiêm trọng");
      await prisma.user.update({
        where: { id: target.id },
        data: { deletionGraceUntil: new Date(Date.now() - 1000) },
      });
      const due = await prisma.user.findMany({
        where: { status: "PENDING_DELETION", deletionGraceUntil: { lte: new Date() } },
        select: { id: true },
      });
      expect(due.map((u) => u.id)).toContain(target.id);
    });

    it("idempotent (gọi lại khi đang chờ xoá không ghi thêm outbox/không đổi mốc ân hạn); không tự xoá chính mình (USER_014); user lạ → 404", async () => {
      const admin = await createUser("admin-alias3@example.com");
      const target = await createUser("target-alias3@example.com");
      await service.requestAnonymize(target.id, admin.id, "Vi phạm điều khoản sử dụng nghiêm trọng");
      const first = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

      await service.requestAnonymize(target.id, admin.id, "Vi phạm điều khoản sử dụng nghiêm trọng");

      const second = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(second.deletionGraceUntil).toEqual(first.deletionGraceUntil);
      expect(
        await prisma.outboxEvent.count({ where: { aggregateId: target.id, type: "user.session-invalidated" } })
      ).toBe(1);
      await expect(
        service.requestAnonymize(admin.id, admin.id, "Tự xoá mình từ trang quản trị")
      ).rejects.toMatchObject({ errorCode: "USER_014" });
      await expect(
        service.requestAnonymize("66f1b2c3d4e5f60718293aff", admin.id, "Người dùng không tồn tại")
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("cancelDeletion — email chuẩn hoá và không lộ email nào tồn tại", () => {
    it("email khác hoa/thường vẫn huỷ được", async () => {
      const user = await createUser("mixed.case@example.com");
      await service.requestDeletion(user.id, PASSWORD);

      const result = await service.cancelDeletion("  Mixed.Case@EXAMPLE.com ", PASSWORD);

      expect(result.status).toBe("ACTIVE");
    });

    it("email lạ và mật khẩu sai cho CÙNG thông điệp/mã; bcrypt luôn được chạy (thời gian phản hồi đồng đều)", async () => {
      const user = await createUser("known@example.com");
      const compare = jest.spyOn(bcrypt, "compare");

      const wrongPassword = await service.cancelDeletion(user.email, "sai-mat-khau").catch((e: unknown) => e);
      const unknownEmail = await service
        .cancelDeletion("khong.ton.tai@example.com", "sai-mat-khau")
        .catch((e: unknown) => e);

      expect(wrongPassword).toMatchObject({ statusCode: 401, errorCode: "AUTH_001" });
      expect(unknownEmail).toMatchObject({ statusCode: 401, errorCode: "AUTH_001" });
      expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
      expect(compare).toHaveBeenCalledTimes(2);
      compare.mockRestore();
    });
  });

  describe("UserService.update — đổi vai trò/mật khẩu/email thu hồi phiên NGAY (đường PATCH /users/:id, không qua /role)", () => {
    it("đổi vai trò: mọi phiên bị thu hồi, sessionVersion tăng, có audit user.update; tự đổi vai trò của mình bị chặn", async () => {
      const admin = await createUser("admin-upd@example.com");
      const target = await createUser("target-upd@example.com");
      await sessions.create({
        userId: target.id,
        refreshToken: "upd-token",
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const updated = await service.update(target.id, { role: "manager" }, { id: admin.id, role: "admin" });

      expect(updated.role).toBe("manager");
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.sessionVersion).toBeGreaterThan(target.sessionVersion);
      expect(await sessions.listActive(target.id)).toHaveLength(0);
      const audit = await prisma.auditLog.findMany({ where: { action: "user.update", targetId: target.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actorId).toBe(admin.id);
      expect((audit[0]?.metadata as { fields: string[] }).fields).toEqual(["role"]);
      await expect(
        service.update(admin.id, { role: "manager" }, { id: admin.id, role: "admin" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("đổi mật khẩu: băm bcrypt, thu hồi phiên; đổi email: chuẩn hoá chữ thường + emailVerified=false + thu hồi phiên; đổi tên: KHÔNG thu hồi", async () => {
      const admin = await createUser("admin-upd2@example.com");
      const target = await createUser("target-upd2@example.com", { emailVerified: true });
      await sessions.create({
        userId: target.id,
        refreshToken: "upd-token-2",
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await service.update(target.id, { name: "Tên Mới" }, { id: admin.id, role: "admin" });
      expect(await sessions.listActive(target.id)).toHaveLength(1);

      await service.update(target.id, { password: "Mat-khau-moi-do-admin-1" }, { id: admin.id, role: "admin" });
      const afterPassword = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(afterPassword.passwordHash).not.toBe("Mat-khau-moi-do-admin-1");
      expect(await bcrypt.compare("Mat-khau-moi-do-admin-1", afterPassword.passwordHash as string)).toBe(true);
      expect(await sessions.listActive(target.id)).toHaveLength(0);

      await service.update(target.id, { email: " Moi.Email@Example.COM " }, { id: admin.id, role: "admin" });
      const afterEmail = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(afterEmail.email).toBe("moi.email@example.com");
      expect(afterEmail.emailVerified).toBe(false);
      const actions = await prisma.auditLog.findMany({ where: { action: "user.update", targetId: target.id } });
      expect(actions.map((a) => (a.metadata as { fields: string[] }).fields[0]).sort()).toEqual([
        "email",
        "password",
      ]);
    });

    it("đổi sang email đã có người dùng (khác hoa/thường) → 409 Conflict (không phải 500)", async () => {
      const admin = await createUser("admin-upd3@example.com");
      await createUser("da.co@example.com");
      const target = await createUser("target-upd3@example.com");

      await expect(
        service.update(target.id, { email: "DA.CO@example.com" }, { id: admin.id, role: "admin" })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe("tài khoản ĐÃ ẩn danh hoá không bị kéo ngược về PENDING_DELETION (GRACE / alias DELETE)", () => {
    it("anonymizeAdmin GRACE trên tài khoản ANONYMIZED: trả nguyên trạng ANONYMIZED, không đổi status, không ghi outbox/audit mới; cancelDeletionAdmin vẫn bị từ chối (USER_011)", async () => {
      const admin = await createUser("admin-anon@example.com");
      const target = await createUser("target-anon@example.com");
      const anonymizedAt = await new UserAnonymizer().anonymize(target.id);
      const outboxBefore = await prisma.outboxEvent.count({ where: { aggregateId: target.id } });

      const result = await service.anonymizeAdmin(
        target.id,
        { id: admin.id, role: "admin" },
        { mode: "GRACE", reason: "Yêu cầu lặp lại trên tài khoản đã xoá" }
      );

      expect(result).toEqual({ status: "ANONYMIZED", anonymizedAt });
      const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(after.status).toBe("ANONYMIZED");
      expect(after.deletionGraceUntil).toBeNull();
      expect(await prisma.outboxEvent.count({ where: { aggregateId: target.id } })).toBe(outboxBefore);
      expect(await prisma.auditLog.count({ where: { targetId: target.id } })).toBe(0);
      await expect(
        service.cancelDeletionAdmin(target.id, { id: admin.id, role: "admin" }, "Thử huỷ tài khoản đã xoá")
      ).rejects.toMatchObject({ errorCode: "USER_011" });
    });

    it("DELETE /users/:id (requestAnonymize) trên tài khoản ANONYMIZED: giữ ANONYMIZED", async () => {
      const admin = await createUser("admin-anon2@example.com");
      const target = await createUser("target-anon2@example.com");
      await new UserAnonymizer().anonymize(target.id);

      const returned = await service.requestAnonymize(target.id, admin.id, "Xoá lại tài khoản đã ẩn danh hoá");

      expect(returned.status).toBe("ANONYMIZED");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("ANONYMIZED");
    });
  });

  describe("yêu cầu xoá gỡ push token của mọi thiết bị", () => {
    it("requestDeletion → mọi DeviceToken bị thu hồi (máy vẫn nhận push trong ân hạn là rò rỉ); huỷ xoá không tự khôi phục token", async () => {
      const user = await createUser("push-del@example.com");
      await prisma.deviceToken.createMany({
        data: ["dev-push-1234567", "dev-push-7654321"].map((deviceId) => ({
          userId: user.id,
          deviceId,
          platform: "IOS" as const,
          kind: "FCM" as const,
          token: `tok-${user.id}-${deviceId}`,
          revokedAt: null,
          revokeReason: null,
        })),
      });

      await service.requestDeletion(user.id, PASSWORD);

      const tokens = await prisma.deviceToken.findMany({ where: { userId: user.id } });
      expect(tokens).toHaveLength(2);
      expect(tokens.every((t) => t.revokedAt instanceof Date)).toBe(true);
      // Huỷ xoá: app đăng ký lại push token khi đăng nhập lại — BE không tự "sống lại" token cũ.
      expect((await service.cancelDeletion(user.email, PASSWORD)).status).toBe("ACTIVE");
      expect(await prisma.deviceToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    });

    it("khoá tài khoản (lock) cũng gỡ push token của mọi thiết bị", async () => {
      const admin = await createUser("admin-push@example.com");
      const target = await createUser("target-push@example.com");
      await prisma.deviceToken.create({
        data: {
          userId: target.id,
          deviceId: "dev-lock-1234567",
          platform: "ANDROID",
          kind: "FCM",
          token: `tok-${target.id}`,
          revokedAt: null,
          revokeReason: null,
        },
      });

      await service.lock(target.id, admin.id, "Vi phạm điều khoản sử dụng nghiêm trọng");

      expect(await prisma.deviceToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    });
  });
});
