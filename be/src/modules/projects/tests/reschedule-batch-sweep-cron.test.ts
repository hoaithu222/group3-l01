/**
 * `reschedule-batch.sweep` PHẢI là cron TĨNH (`defineCron`): `syncCronSchedulers()` xoá mọi scheduler không có trong registry tĩnh
 * (bài học p3-04 — scheduler theo-thực-thể bị dọn), nên kiểm nó được upsert đúng lịch và không bị dọn, còn processor gọi đúng sweeper.
 */
import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

// Không dùng jest.fn().mock.calls cho việc đăng ký lúc import: `resetMocks` xoá lịch sử trước MỖI test (xem biometric.jobs.test.ts).
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
  // `defineCron` THẬT (ghi vào registry tĩnh) để `syncCronSchedulers()` bên dưới thấy đúng thứ job file đã khai.
  defineCron: jest.requireActual("../../../infrastructure/queue/cron.registry").defineCron,
}));
jest.mock("../../../infrastructure/queue/queues", () => ({
  ...jest.requireActual("../../../infrastructure/queue/queues"),
  getQueue: jest.fn(),
}));

const mockSweep = jest.fn();
jest.mock("../projects.container", () => ({
  getProjectsContainer: () => ({ rescheduleBatchSweeper: { sweep: (...args: unknown[]) => mockSweep(...args) } }),
}));

import { syncCronSchedulers } from "../../../infrastructure/queue/cron.registry";
import { getQueue } from "../../../infrastructure/queue/queues";
import "../jobs/task-reschedule-bulk.job";

const upsertJobScheduler = jest.fn();
const removeJobScheduler = jest.fn();
const existing: { key: string }[] = [];

describe("cron TĨNH reschedule-batch.sweep (p4-04 be.md §5.6)", () => {
  beforeEach(() => {
    // `resetMocks` xoá cài đặt của jest.fn trước MỖI test ⇒ dựng lại hàng đợi giả ở đây.
    (getQueue as jest.Mock).mockReturnValue({
      upsertJobScheduler: (...args: unknown[]) => upsertJobScheduler(...args),
      getJobSchedulers: () => Promise.resolve(existing),
      removeJobScheduler: (...args: unknown[]) => removeJobScheduler(...args),
    });
  });

  it("được upsert với schedulerId/pattern `*/10 * * * *`/job cùng tên/attempts 1; scheduler đang có KHÔNG bị dọn", async () => {
    existing.length = 0;
    existing.push({ key: "reschedule-batch.sweep" });
    await syncCronSchedulers();
    const call = upsertJobScheduler.mock.calls.find((c) => c[0] === "reschedule-batch.sweep");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ pattern: "*/10 * * * *" });
    expect(call?.[2]).toMatchObject({ name: "reschedule-batch.sweep", opts: { attempts: 1 } });
    expect(removeJobScheduler).not.toHaveBeenCalledWith("reschedule-batch.sweep");
  });

  it("processor `cron/reschedule-batch.sweep` gọi sweeper của container đúng một lần", async () => {
    mockSweep.mockResolvedValue({ scanned: 2, failed: 1 });
    const entry = mockRegistered.find((c) => c[0] === "cron" && c[1] === "reschedule-batch.sweep");
    expect(entry).toBeDefined();
    await entry?.[2]({ id: "cron-1", data: {}, opts: {} } as unknown as Job);
    expect(mockSweep).toHaveBeenCalledTimes(1);
  });
});
