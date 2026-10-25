import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

// Xem asset.jobs.test.ts — không dùng jest.fn().mock.calls vì resetMocks:true
// xoá lịch sử gọi trước MỖI test, kể cả call đã xảy ra lúc import module.
const mockRegistered: Array<[string, string, Processor]> = [];
const mockCronDefs: Array<{ schedulerId: string; queue: string; jobName: string; pattern: string }> =
  [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
  defineCron: (def: { schedulerId: string; queue: string; jobName: string; pattern: string }) => {
    mockCronDefs.push(def);
  },
}));

jest.mock("../repositories", () => {
  const { InMemoryBiometricCredentialRepository } = jest.requireActual(
    "../repositories/biometric-credential.repository.inmemory"
  );
  return { PrismaBiometricCredentialRepository: InMemoryBiometricCredentialRepository };
});

import "../jobs/biometric.jobs";
import { InMemoryBiometricCredentialRepository } from "../repositories/biometric-credential.repository.inmemory";

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("auth/biometric.jobs", () => {
  let repo: InMemoryBiometricCredentialRepository;

  beforeEach(() => {
    InMemoryBiometricCredentialRepository.clearStore();
    repo = new InMemoryBiometricCredentialRepository();
  });

  it("đăng ký processor cron/auth.biometric-cleanup", () => {
    expect(mockRegistered).toContainEqual(["cron", "auth.biometric-cleanup", expect.any(Function)]);
  });

  it("khai lịch chạy hàng tuần đúng pattern be.md (0 4 * * 1)", () => {
    expect(mockCronDefs).toContainEqual(
      expect.objectContaining({
        schedulerId: "auth.biometric-cleanup",
        queue: "cron",
        jobName: "auth.biometric-cleanup",
        pattern: "0 4 * * 1",
      })
    );
  });

  it("chuyển ACTIVE quá hạn sang REVOKED EXPIRED, không đụng ACTIVE còn hạn", async () => {
    const expired = await repo.create({
      userId: "u1",
      deviceId: "d1",
      platform: "ANDROID",
      biometryKind: "FINGERPRINT",
      secretHash: "hash1",
      activeKey: "u1:d1",
      expiresAt: new Date(Date.now() - 1000),
    });
    const alive = await repo.create({
      userId: "u1",
      deviceId: "d2",
      platform: "ANDROID",
      biometryKind: "FACE",
      secretHash: "hash2",
      activeKey: "u1:d2",
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const processor = getProcessor("cron", "auth.biometric-cleanup");
    await processor({} as Job);

    const updatedExpired = await repo.findById(expired.id);
    expect(updatedExpired?.status).toBe("REVOKED");
    expect(updatedExpired?.revokeReason).toBe("EXPIRED");
    expect(updatedExpired?.activeKey).toBe(`revoked:${expired.id}`);

    const updatedAlive = await repo.findById(alive.id);
    expect(updatedAlive?.status).toBe("ACTIVE");
  });

  it("xoá REVOKED có revokedAt quá 180 ngày, giữ lại REVOKED còn mới", async () => {
    const old = await repo.create({
      userId: "u1",
      deviceId: "d3",
      platform: "IOS",
      biometryKind: "FACE",
      secretHash: "hash3",
      activeKey: "u1:d3",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await repo.update(old.id, {
      status: "REVOKED",
      activeKey: `revoked:${old.id}`,
      revokeReason: "USER_DISABLED",
      revokedAt: new Date(Date.now() - 181 * 24 * 3600_000),
    });

    const recent = await repo.create({
      userId: "u1",
      deviceId: "d4",
      platform: "IOS",
      biometryKind: "FACE",
      secretHash: "hash4",
      activeKey: "u1:d4",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    await repo.update(recent.id, {
      status: "REVOKED",
      activeKey: `revoked:${recent.id}`,
      revokeReason: "USER_DISABLED",
      revokedAt: new Date(Date.now() - 1 * 24 * 3600_000),
    });

    const processor = getProcessor("cron", "auth.biometric-cleanup");
    await processor({} as Job);

    expect(await repo.findById(old.id)).toBeNull();
    expect(await repo.findById(recent.id)).not.toBeNull();
  });
});
