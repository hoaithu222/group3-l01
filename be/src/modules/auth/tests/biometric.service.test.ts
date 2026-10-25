import { createHash, createHmac } from "crypto";
import bcrypt from "bcryptjs";
import { BiometricService } from "../services/biometric.service";
import { TokenIssuer } from "../services/token-issuer";
import { InMemoryBiometricCredentialRepository } from "../repositories/biometric-credential.repository.inmemory";
import { InMemoryUserRepository } from "../../users/repositories/user.repository.inmemory";
import { UnauthorizedError } from "../../../core/exceptions";

jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
}));

jest.mock("../../../infrastructure/mail", () => ({
  mailService: {
    sendWelcome: jest.fn(),
    sendResetPassword: jest.fn(),
    sendNewDeviceLogin: jest.fn(),
  },
}));

import { getUserStatusCached } from "../../../core/permission/user-status";

/** Vector cố định — tính SHA-256/HMAC-SHA256 bằng chính `crypto` của Node, độc lập với code service. */
const FIXED_SECRET = "correct-horse-battery-staple-fixed-test-vector";
const FIXED_SECRET_HASH = createHash("sha256").update(FIXED_SECRET).digest("hex");
const DEVICE_ID = "device-0000001-fixed";

function hmacFor(nonce: string, secretHashHex = FIXED_SECRET_HASH): string {
  const keyBytes = Buffer.from(secretHashHex, "hex");
  return createHmac("sha256", keyBytes).update(nonce, "utf8").digest("hex");
}

describe("BiometricService.login — xác minh HMAC (nonce+HMAC deviation)", () => {
  let repo: InMemoryBiometricCredentialRepository;
  let userRepo: InMemoryUserRepository;
  let service: BiometricService;
  let userId: string;
  let credentialId: string;

  beforeEach(async () => {
    // `resetMocks: true` (jest.config.ts) xoá implementation trước MỖI test.
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });

    InMemoryBiometricCredentialRepository.clearStore();
    InMemoryUserRepository.clearStore();
    repo = new InMemoryBiometricCredentialRepository();
    userRepo = new InMemoryUserRepository();
    const tokenIssuer = new TokenIssuer(undefined);
    service = new BiometricService(repo, userRepo, tokenIssuer);

    const user = await userRepo.create({
      email: "bio@example.com",
      name: "Bio User",
      passwordHash: "irrelevant-hash",
    });
    userId = user.id;

    const created = await repo.create({
      userId,
      deviceId: DEVICE_ID,
      platform: "ANDROID",
      biometryKind: "FINGERPRINT",
      secretHash: FIXED_SECRET_HASH,
      activeKey: `${userId}:${DEVICE_ID}`,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
    credentialId = created.id;
  });

  it("chấp nhận HMAC đúng (vector cố định) và cấp token", async () => {
    const nonce = "nonce-lan-dang-nhap-thu-nhat";
    const hmac = hmacFor(nonce);

    const result = await service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.biometric).toEqual({
      credentialId,
      expiresAt: expect.any(Date),
    });
  });

  it("cập nhật lastUsedAt + reset failedAttempts sau khi đăng nhập thành công", async () => {
    const nonce = "nonce-cap-nhat-lastused";
    const hmac = hmacFor(nonce);

    await service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac });

    const updated = await repo.findById(credentialId);
    expect(updated?.lastUsedAt).not.toBeNull();
    expect(updated?.failedAttempts).toBe(0);
  });

  it("từ chối HMAC sai → AUTH_013, tăng failedAttempts", async () => {
    const nonce = "nonce-khac-voi-hmac-sai";
    const wrongHmac = "0".repeat(64);

    await expect(
      service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac: wrongHmac })
    ).rejects.toMatchObject({ errorCode: "AUTH_013" });

    const updated = await repo.findById(credentialId);
    expect(updated?.failedAttempts).toBe(1);
  });

  it("từ chối khi deviceId không khớp dù HMAC tính đúng (AUTH_013)", async () => {
    const nonce = "nonce-thiet-bi-khac";
    const hmac = hmacFor(nonce);

    await expect(
      service.login({ credentialId, deviceId: "thiet-bi-khac-hoan-toan", nonce, hmac })
    ).rejects.toMatchObject({ errorCode: "AUTH_013" });
  });

  it("credentialId không tồn tại → AUTH_013 (không lộ là 'unknown')", async () => {
    const nonce = "nonce-bat-ky";
    await expect(
      service.login({
        credentialId: "000000000000000000000000",
        deviceId: DEVICE_ID,
        nonce,
        hmac: hmacFor(nonce),
      })
    ).rejects.toMatchObject({ errorCode: "AUTH_013" });
  });

  it("vượt ngưỡng failedAttemptsMax (5) → thu hồi credential, trả AUTH_014 ngay trong lượt gọi đó", async () => {
    const wrongHmac = "1".repeat(64);

    for (let i = 0; i < 4; i++) {
      await expect(
        service.login({ credentialId, deviceId: DEVICE_ID, nonce: `nonce-${i}`, hmac: wrongHmac })
      ).rejects.toMatchObject({ errorCode: "AUTH_013" });
    }

    // Lần thứ 5 (failedAttempts đạt ngưỡng 5) → thu hồi NGAY, trả AUTH_014.
    await expect(
      service.login({ credentialId, deviceId: DEVICE_ID, nonce: "nonce-4", hmac: wrongHmac })
    ).rejects.toMatchObject({ errorCode: "AUTH_014" });

    const revoked = await repo.findById(credentialId);
    expect(revoked?.status).toBe("REVOKED");
    expect(revoked?.revokeReason).toBe("TOO_MANY_ATTEMPTS");

    // Sau khi bị thu hồi, kể cả gửi đúng HMAC cũng bị từ chối (AUTH_014).
    const nonce = "nonce-sau-khi-thu-hoi";
    await expect(
      service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac: hmacFor(nonce) })
    ).rejects.toMatchObject({ errorCode: "AUTH_014" });
  });

  it("credential hết hạn → thu hồi (EXPIRED), trả AUTH_015", async () => {
    // Tạo 1 credential riêng đã hết hạn (expiresAt trong quá khứ).
    const expiredCredential = await repo.create({
      userId,
      deviceId: "device-expired",
      platform: "IOS",
      biometryKind: "FACE",
      secretHash: FIXED_SECRET_HASH,
      activeKey: `${userId}:device-expired`,
      expiresAt: new Date(Date.now() - 1000),
    });

    const nonce = "nonce-het-han";
    await expect(
      service.login({
        credentialId: expiredCredential.id,
        deviceId: "device-expired",
        nonce,
        hmac: hmacFor(nonce),
      })
    ).rejects.toMatchObject({ errorCode: "AUTH_015" });

    const updated = await repo.findById(expiredCredential.id);
    expect(updated?.status).toBe("REVOKED");
    expect(updated?.revokeReason).toBe("EXPIRED");
  });

  it("credential đã REVOKED → AUTH_014, không tăng failedAttempts", async () => {
    await repo.update(credentialId, {
      status: "REVOKED",
      revokeReason: "USER_DISABLED",
      revokedAt: new Date(),
    });

    const nonce = "nonce-da-revoked";
    await expect(
      service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac: hmacFor(nonce) })
    ).rejects.toMatchObject({ errorCode: "AUTH_014" });
  });

  it("mọi lỗi trả về đều là UnauthorizedError (401)", async () => {
    const nonce = "nonce-kiem-tra-loai-loi";
    await expect(
      service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac: "0".repeat(64) })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

// ── Bổ sung (rà soát auth BE 2026-09-25) ──────────────────────────────────────────────────────────────
describe("BiometricService — độ bền của đếm lần sai, phiên mồ côi và bật sinh trắc học", () => {
  let repo: InMemoryBiometricCredentialRepository;
  let userRepo: InMemoryUserRepository;
  let userId: string;
  let credentialId: string;

  beforeEach(async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    InMemoryBiometricCredentialRepository.clearStore();
    InMemoryUserRepository.clearStore();
    repo = new InMemoryBiometricCredentialRepository();
    userRepo = new InMemoryUserRepository();
    const user = await userRepo.create({
      email: "bio2@example.com",
      name: "Bio Two",
      passwordHash: await bcrypt.hash("Mat-khau-dung-1", 4),
    });
    userId = user.id;
    credentialId = (
      await repo.create({
        userId,
        deviceId: DEVICE_ID,
        platform: "ANDROID",
        biometryKind: "FINGERPRINT",
        secretHash: FIXED_SECRET_HASH,
        activeKey: `${userId}:${DEVICE_ID}`,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
    ).id;
  });

  it("đếm lần sai bằng $inc NGUYÊN TỬ: 5 lần thử sai ĐỒNG THỜI vẫn chạm ngưỡng và thu hồi credential (không đếm thiếu)", async () => {
    const service = new BiometricService(repo, userRepo, new TokenIssuer(undefined));
    const wrong = "2".repeat(64);
    // Mô phỏng đọc-rồi-ghi trễ: nếu service ghi `failedAttempts = cũ + 1` từ bản đọc cũ thì cả 5 lần cùng ghi 1.
    const original = repo.findById.bind(repo);
    jest.spyOn(repo, "findById").mockImplementation(async (id) => {
      const found = await original(id);
      await new Promise((resolve) => setImmediate(resolve));
      return found ? { ...found } : found;
    });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        service.login({ credentialId, deviceId: DEVICE_ID, nonce: `nonce-dong-thoi-${i}`, hmac: wrong })
      )
    );

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    const after = await repo.findById(credentialId);
    expect(after?.status).toBe("REVOKED");
    expect(after?.revokeReason).toBe("TOO_MANY_ATTEMPTS");
  });

  it("thua đua với thu hồi ở bước cuối ⇒ AUTH_014 VÀ phiên vừa tạo bị thu hồi (không để lại refresh token sống mà client không nhận)", async () => {
    const sessionService = {
      isKnownDevice: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue(undefined),
      enforceSessionsMax: jest.fn().mockResolvedValue(undefined),
      revokeById: jest.fn().mockResolvedValue(true),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new BiometricService(repo, userRepo, new TokenIssuer(sessionService as any));
    jest.spyOn(repo, "updateIfStatus").mockResolvedValue(false); // credential bị thu hồi đúng lúc đang đăng nhập
    const nonce = "nonce-thua-dua";

    await expect(
      service.login({ credentialId, deviceId: DEVICE_ID, nonce, hmac: hmacFor(nonce) })
    ).rejects.toMatchObject({ errorCode: "AUTH_014" });

    expect(sessionService.create).toHaveBeenCalledTimes(1);
    const createdSessionId = (sessionService.create.mock.calls[0]?.[0] as { id: string }).id;
    expect(sessionService.revokeById).toHaveBeenCalledWith(createdSessionId, userId);
  });

  describe("enroll — đếm lần nhập sai mật khẩu (chống dò bằng access token bị lộ)", () => {
    const enrollInput = {
      deviceId: DEVICE_ID,
      platform: "ANDROID" as const,
      biometryKind: "FINGERPRINT" as const,
    };

    it("sai mật khẩu ⇒ ghi nhận lần sai, KHÔNG tạo credential; đúng ⇒ xoá bộ đếm", async () => {
      const guard = {
        assertNotLocked: jest.fn().mockResolvedValue(undefined),
        recordFailure: jest.fn().mockResolvedValue({ justLocked: false, retryAfterSeconds: 0 }),
        reset: jest.fn().mockResolvedValue(undefined),
      };
      const service = new BiometricService(
        repo,
        userRepo,
        new TokenIssuer(undefined),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        guard as any
      );
      InMemoryBiometricCredentialRepository.clearStore();

      await expect(service.enroll(userId, "sai-mat-khau", enrollInput)).rejects.toBeInstanceOf(UnauthorizedError);
      expect(guard.recordFailure).toHaveBeenCalledWith(userId);
      expect(await repo.findActiveByUser(userId)).toHaveLength(0);

      const ok = await service.enroll(userId, "Mat-khau-dung-1", enrollInput);
      expect(ok.credentialId).toEqual(expect.any(String));
      expect(guard.reset).toHaveBeenCalledWith(userId);
    });

    it("đang bị khoá (guard ném 429) ⇒ không kiểm mật khẩu, không tạo credential", async () => {
      const locked = Object.assign(new Error("khoá"), { statusCode: 429 });
      const guard = {
        assertNotLocked: jest.fn().mockRejectedValue(locked),
        recordFailure: jest.fn(),
        reset: jest.fn(),
      };
      const service = new BiometricService(
        repo,
        userRepo,
        new TokenIssuer(undefined),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        guard as any
      );
      const compare = jest.spyOn(bcrypt, "compare");

      await expect(service.enroll(userId, "Mat-khau-dung-1", enrollInput)).rejects.toBe(locked);

      expect(compare).not.toHaveBeenCalled();
      expect(guard.recordFailure).not.toHaveBeenCalled();
    });
  });
});
