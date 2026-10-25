import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;
interface CronDef {
  schedulerId: string;
  queue: string;
  jobName: string;
  pattern: string;
  opts?: Record<string, unknown>;
}

// KHÔNG dùng jest.fn().mock.calls — `resetMocks: true` (jest.config.ts) xoá
// lịch sử gọi trước MỖI test, kể cả call đã xảy ra lúc import module
// (side-effect `registerJob`/`defineCron`) — xem tiền lệ `user.jobs.test.ts`.
const mockRegistered: Array<[string, string, Processor]> = [];
const mockCronDefs: CronDef[] = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
  defineCron: (def: CronDef) => {
    mockCronDefs.push(def);
  },
}));

const mockCount = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { inviteLink: { count: (...args: unknown[]) => mockCount(...args) } },
}));

const mockLoggerInfo = jest.fn();
jest.mock("../../../infrastructure/logger", () => ({
  logger: { info: (...args: unknown[]) => mockLoggerInfo(...args), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import "../jobs/invites-expire.job";

function getProcessor(): Processor {
  const call = mockRegistered.find((c) => c[0] === "cron" && c[1] === "invites.expire");
  if (!call) throw new Error("Không tìm thấy processor invites.expire đã đăng ký");
  return call[2];
}

describe("invites-expire.job (cron invites.expire)", () => {
  beforeEach(() => {
    mockCount.mockReset();
    mockLoggerInfo.mockClear();
  });

  it("đăng ký processor trên queue cron, jobName invites.expire", () => {
    expect(mockRegistered).toContainEqual(["cron", "invites.expire", expect.any(Function)]);
  });

  it("defineCron() với schedulerId/queue/jobName/pattern đúng be.md §7 (mỗi giờ, attempts:1)", () => {
    expect(mockCronDefs).toContainEqual({
      schedulerId: "invites.expire",
      queue: "cron",
      jobName: "invites.expire",
      pattern: "0 * * * *",
      opts: { attempts: 1 },
    });
  });

  it("đếm InviteLink hết hạn (chưa revoked, expiresAt<=now, còn remainingUses) và không throw", async () => {
    mockCount.mockResolvedValue(3);
    const processor = getProcessor();
    await expect(processor({ data: {} } as Job)).resolves.toBeUndefined();

    expect(mockCount).toHaveBeenCalledWith({
      where: { revokedAt: null, expiresAt: { lte: expect.any(Date) }, remainingUses: { gt: 0 } },
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "[invites.expire] Thống kê lời mời hết hạn",
      { expiredCount: 3 }
    );
  });

  it("expiredCount = 0 → vẫn chạy xong, không throw", async () => {
    mockCount.mockResolvedValue(0);
    const processor = getProcessor();
    await expect(processor({ data: {} } as Job)).resolves.toBeUndefined();
  });
});
