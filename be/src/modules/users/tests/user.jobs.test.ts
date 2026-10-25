import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

// Xem asset.jobs.test.ts / biometric.jobs.test.ts — không dùng jest.fn().mock.calls
// vì resetMocks:true (jest.config.ts) xoá lịch sử gọi trước MỖI test, kể cả
// call đã xảy ra lúc import module (side-effect registerJob/defineCron).
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

const mockFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { user: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

const mockDisconnect = jest.fn();
jest.mock("../../../infrastructure/socket", () => ({
  disconnectUserSockets: (...args: unknown[]) => mockDisconnect(...args),
}));

const mockAnonymize = jest.fn();
jest.mock("../services/user-anonymizer", () => ({
  UserAnonymizer: jest.fn().mockImplementation(() => ({
    anonymize: (...args: unknown[]) => mockAnonymize(...args),
  })),
}));

import "../jobs/user.jobs";

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("modules/users/jobs/user.jobs", () => {
  beforeEach(() => {
    mockFindMany.mockReset().mockResolvedValue([]);
    mockDisconnect.mockReset();
    mockAnonymize.mockReset().mockResolvedValue(new Date());
  });

  it("đăng ký đúng 2 job: notifications/realtime.disconnect-user và cron/user.anonymize", () => {
    expect(mockRegistered).toContainEqual([
      "notifications",
      "realtime.disconnect-user",
      expect.any(Function),
    ]);
    expect(mockRegistered).toContainEqual(["cron", "user.anonymize", expect.any(Function)]);
  });

  it("khai lịch chạy user.anonymize hàng ngày 3h sáng (0 3 * * *)", () => {
    expect(mockCronDefs).toContainEqual(
      expect.objectContaining({
        schedulerId: "user.anonymize",
        queue: "cron",
        jobName: "user.anonymize",
        pattern: "0 3 * * *",
      })
    );
  });

  it("realtime.disconnect-user gọi disconnectUserSockets đúng userId/reason", async () => {
    const processor = getProcessor("notifications", "realtime.disconnect-user");
    await processor({ data: { userId: "u1", reason: "account-deletion-requested" } } as Job);

    expect(mockDisconnect).toHaveBeenCalledWith("u1", "account-deletion-requested");
  });

  it("user.anonymize gọi anonymizer cho mỗi user PENDING_DELETION quá hạn", async () => {
    mockFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);

    const processor = getProcessor("cron", "user.anonymize");
    await processor({} as Job);

    expect(mockAnonymize).toHaveBeenCalledWith("a");
    expect(mockAnonymize).toHaveBeenCalledWith("b");
    expect(mockAnonymize).toHaveBeenCalledTimes(2);
  });

  it("lỗi ẩn danh hoá 1 user KHÔNG chặn user khác trong cùng lô", async () => {
    mockFindMany.mockResolvedValue([{ id: "fails" }, { id: "ok" }]);
    mockAnonymize.mockImplementation((id: string) =>
      id === "fails" ? Promise.reject(new Error("boom")) : Promise.resolve(new Date())
    );

    const processor = getProcessor("cron", "user.anonymize");
    await expect(processor({} as Job)).resolves.not.toThrow();

    expect(mockAnonymize).toHaveBeenCalledWith("fails");
    expect(mockAnonymize).toHaveBeenCalledWith("ok");
  });
});
