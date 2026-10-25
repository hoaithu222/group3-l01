/**
 * `getQueue()` trả về Queue thật (kết nối BullMQ/Redis) — mock hẳn `./queues`
 * để `syncCronSchedulers()` chạy được không cần Redis, và để kiểm tra đúng
 * tham số gọi `upsertJobScheduler`/`getJobSchedulers`/`removeJobScheduler`.
 */
const mockQueue = {
  upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  getJobSchedulers: jest.fn().mockResolvedValue([]),
  removeJobScheduler: jest.fn().mockResolvedValue(true),
};

jest.mock("../queues", () => ({
  getQueue: jest.fn(() => mockQueue),
}));

import { getQueue } from "../queues";
import { defineCron, syncCronSchedulers } from "../cron.registry";

describe("cron.registry", () => {
  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá SẠCH implementation của mọi
    // mock trước mỗi test, kể cả factory `jest.fn(() => mockQueue)` ở
    // `jest.mock(...)` phía trên — phải gán lại, không chỉ riêng return value
    // của các method trên `mockQueue`.
    (getQueue as jest.Mock).mockReturnValue(mockQueue);
    mockQueue.upsertJobScheduler.mockResolvedValue(undefined);
    mockQueue.getJobSchedulers.mockResolvedValue([]);
    mockQueue.removeJobScheduler.mockResolvedValue(true);
  });

  it("upsertJobScheduler đúng schedulerId/pattern/tz cho từng def đã khai", async () => {
    defineCron({
      schedulerId: "auth.biometric-cleanup",
      queue: "cron",
      jobName: "auth.biometric-cleanup",
      pattern: "0 4 * * 1",
      opts: { attempts: 1 },
    });

    await syncCronSchedulers();

    expect(getQueue).toHaveBeenCalledWith("cron");
    expect(mockQueue.upsertJobScheduler).toHaveBeenCalledWith(
      "auth.biometric-cleanup",
      { pattern: "0 4 * * 1", tz: "Asia/Ho_Chi_Minh" },
      { name: "auth.biometric-cleanup", data: {}, opts: { attempts: 1 } }
    );
  });

  it("xoá scheduler còn trên Redis nhưng không còn khai trong registry", async () => {
    defineCron({
      schedulerId: "auth.biometric-cleanup",
      queue: "cron",
      jobName: "auth.biometric-cleanup",
      pattern: "0 4 * * 1",
    });
    mockQueue.getJobSchedulers.mockResolvedValue([
      { key: "auth.biometric-cleanup" },
      { key: "some.removed-job" },
    ]);

    await syncCronSchedulers();

    expect(mockQueue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(mockQueue.removeJobScheduler).toHaveBeenCalledWith("some.removed-job");
  });

  it("không xoá gì khi mọi scheduler trên Redis đều khớp registry", async () => {
    defineCron({
      schedulerId: "assets.cleanup",
      queue: "cron",
      jobName: "assets.cleanup",
      pattern: "0 * * * *",
    });
    mockQueue.getJobSchedulers.mockResolvedValue([{ key: "assets.cleanup" }]);

    await syncCronSchedulers();

    expect(mockQueue.removeJobScheduler).not.toHaveBeenCalled();
  });
});
