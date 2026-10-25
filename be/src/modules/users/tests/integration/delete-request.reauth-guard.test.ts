/**
 * Xoá / huỷ xoá tài khoản tự phục vụ phải xác nhận lại bằng mật khẩu — và mật khẩu này KHÔNG được dò vô hạn:
 * `POST /me/delete-request` đứng sau access token (có thể bị lộ) còn `POST /me/delete-cancel` không cần token nên là
 * một "cửa đăng nhập" thứ hai. Cả hai dùng chung bộ đếm `reauth` theo tài khoản (`PasswordAttemptGuard`): 5 lần sai ⇒ khoá 429
 * `RATE_002` (kể cả khi lần sau đúng mật khẩu), email lạ bị đếm y hệt email thật (không lộ email nào đã đăng ký).
 *
 * Mongo memory (`TEST_DB=memory`) + Redis giả có trạng thái; mail/outbox giả — không nối Redis hay DB thật nào.
 */
const mockEnqueueMail = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../infrastructure/mail", () => ({
  mailService: { enqueueMail: (...args: unknown[]) => mockEnqueueMail(...(args as [])) },
}));

jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRedisMockShape } = require("../../../auth/tests/support/redis-fake") as typeof import("../../../auth/tests/support/redis-fake");
  return { redis: createRedisMockShape() };
});

import bcrypt from "bcryptjs";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { PasswordAttemptGuard } from "../../../../core/auth/password-attempt-guard";
import { UserService } from "../../services/user.service";
import { PrismaUserRepository } from "../../repositories";
import { SessionService } from "../../../auth/services/session.service";
import { installRedisFake, redisFakeKeys, resetRedisFake } from "../../../auth/tests/support/redis-fake";
import { assertMemoryDatabase, describeMemoryDb } from "../../../auth/tests/support/memory-db-guard";

const PASSWORD = "Sup3rSecret!";

describeMemoryDb("xoá/huỷ xoá tài khoản — khoá theo tài khoản khi nhập sai mật khẩu (Mongo memory)", () => {
  beforeAll(assertMemoryDatabase);

  const service = new UserService(
    new PrismaUserRepository(),
    new SessionService(),
    undefined,
    undefined,
    new PasswordAttemptGuard("reauth")
  );

  async function createUser(email: string, overrides: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: {
        email,
        name: "Reauth",
        normalizedName: "reauth",
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        status: "ACTIVE",
        ...overrides,
      },
    });
  }

  beforeEach(() => {
    resetRedisFake();
    installRedisFake(redis);
    mockEnqueueMail.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.session.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
    await prisma.user.deleteMany({});
  });

  it("requestDeletion: sai 5 lần ⇒ lần 6 bị 429 RATE_002 kèm retryAfterSeconds, kể cả khi đúng mật khẩu; tài khoản vẫn ACTIVE", async () => {
    const user = await createUser("reauth-a@example.com");

    for (let i = 0; i < 5; i++) {
      await expect(service.requestDeletion(user.id, `sai-${i}`)).rejects.toMatchObject({
        statusCode: 401,
        errorCode: "AUTH_001",
      });
    }
    const blocked = await service.requestDeletion(user.id, PASSWORD).catch((e: unknown) => e);

    expect(blocked).toMatchObject({ statusCode: 429, errorCode: "RATE_002" });
    expect((blocked as { details?: { retryAfterSeconds?: number } }).details?.retryAfterSeconds).toBeGreaterThan(0);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.status).toBe("ACTIVE");
    expect(mockEnqueueMail).not.toHaveBeenCalled();
  });

  it("nhập đúng mật khẩu xoá bộ đếm: 4 sai + 1 đúng + 4 sai ⇒ chưa bị khoá", async () => {
    const user = await createUser("reauth-b@example.com");

    for (let i = 0; i < 4; i++) await expect(service.requestDeletion(user.id, `sai-${i}`)).rejects.toMatchObject({ statusCode: 401 });
    const ok = await service.requestDeletion(user.id, PASSWORD);
    expect(ok.status).toBe("PENDING_DELETION");
    for (let i = 0; i < 4; i++) await expect(service.requestDeletion(user.id, `sai-lai-${i}`)).rejects.toMatchObject({ statusCode: 401 });

    // Đã PENDING_DELETION + mật khẩu đúng ⇒ idempotent (không phải 429) — bộ đếm đã được xoá ở lần đúng.
    expect((await service.requestDeletion(user.id, PASSWORD)).status).toBe("PENDING_DELETION");
  });

  it("cancelDeletion: đếm theo email ĐÃ CHUẨN HOÁ (đổi hoa/thường không né được khoá); email lạ bị đếm và khoá y hệt email thật", async () => {
    const user = await createUser("reauth-c@example.com", {
      status: "PENDING_DELETION",
      deletionRequestedAt: new Date(),
      deletionGraceUntil: new Date(Date.now() + 86_400_000),
    });
    const variants = ["reauth-c@example.com", "REAUTH-C@example.com", " Reauth-C@Example.com ", "reauth-c@EXAMPLE.com", "reauth-C@example.com"];

    for (const email of variants) {
      await expect(service.cancelDeletion(email, "sai-mat-khau")).rejects.toMatchObject({ statusCode: 401, errorCode: "AUTH_001" });
    }
    const blockedReal = await service.cancelDeletion("reauth-c@example.com", PASSWORD).catch((e: unknown) => e);
    expect(blockedReal).toMatchObject({ statusCode: 429, errorCode: "RATE_002" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("PENDING_DELETION");

    for (let i = 0; i < 5; i++) {
      await expect(service.cancelDeletion("khong.ton.tai@example.com", "x")).rejects.toMatchObject({ statusCode: 401 });
    }
    const blockedUnknown = await service.cancelDeletion("khong.ton.tai@example.com", "x").catch((e: unknown) => e);
    expect(blockedUnknown).toMatchObject({ statusCode: 429, errorCode: "RATE_002" });
  });

  it("khoá đếm theo tài khoản KHÔNG lưu email/userId thô trên Redis; luồng `reauth` không khoá luồng đăng nhập (`login`)", async () => {
    const user = await createUser("reauth-d@example.com");
    for (let i = 0; i < 5; i++) await service.requestDeletion(user.id, `sai-${i}`).catch(() => undefined);

    const keys = redisFakeKeys().join(" ");
    expect(keys).toContain("auth:lock:reauth:");
    expect(keys).not.toContain(user.id);
    expect(keys).not.toContain("reauth-d@example.com");
    // Bộ đếm `login` là khoá khác hẳn (scope khác): người bị khoá ở luồng xoá tài khoản vẫn đăng nhập được.
    await expect(new PasswordAttemptGuard("login").assertNotLocked("reauth-d@example.com")).resolves.toBeUndefined();
  });
});
