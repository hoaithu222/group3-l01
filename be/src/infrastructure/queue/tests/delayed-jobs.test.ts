/** `getQueue()`/`enqueue()` chạm BullMQ/Redis thật — mock `../queues` (giống `cron.registry.test.ts`). */
const mockJob = { getState: jest.fn(), remove: jest.fn() };
const mockQueue = { getJob: jest.fn() };
const mockEnqueue = jest.fn().mockResolvedValue(undefined);

jest.mock("../queues", () => ({
  getQueue: jest.fn(() => mockQueue),
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

import { getQueue } from "../queues";
import { scheduleAt, cancelJob, rescheduleJob } from "../delayed-jobs";

describe("delayed-jobs", () => {
  beforeEach(() => {
    (getQueue as jest.Mock).mockReturnValue(mockQueue);
    mockQueue.getJob.mockReset();
    mockJob.getState.mockReset();
    mockJob.remove.mockReset().mockResolvedValue(undefined);
    mockEnqueue.mockReset().mockResolvedValue(undefined);
  });

  describe("scheduleAt", () => {
    it("enqueue với jobId + delay = runAt - now (làm tròn, >= 0)", async () => {
      const runAt = new Date(Date.now() + 5000);
      await scheduleAt("cron", "job.x", "job-1", { a: 1 }, runAt);

      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      const [queue, jobName, data, opts] = mockEnqueue.mock.calls[0] as [
        string,
        string,
        unknown,
        { jobId: string; delay: number },
      ];
      expect(queue).toBe("cron");
      expect(jobName).toBe("job.x");
      expect(data).toEqual({ a: 1 });
      expect(opts.jobId).toBe("job-1");
      expect(opts.delay).toBeGreaterThan(0);
      expect(opts.delay).toBeLessThanOrEqual(5000);
    });

    it("clamp delay về 0 khi runAt đã ở quá khứ", async () => {
      await scheduleAt("cron", "job.x", "job-2", {}, new Date(Date.now() - 10_000));
      const opts = mockEnqueue.mock.calls[0]?.[3] as { delay: number };
      expect(opts.delay).toBe(0);
    });
  });

  describe("cancelJob", () => {
    it("bỏ qua êm khi job không tồn tại", async () => {
      mockQueue.getJob.mockResolvedValue(undefined);
      await expect(cancelJob("cron", "missing")).resolves.toBeUndefined();
      expect(mockJob.remove).not.toHaveBeenCalled();
    });

    it("xoá job đang ở trạng thái delayed", async () => {
      mockQueue.getJob.mockResolvedValue(mockJob);
      mockJob.getState.mockResolvedValue("delayed");
      await cancelJob("cron", "job-1");
      expect(mockJob.remove).toHaveBeenCalledTimes(1);
    });

    it("xoá job đang ở trạng thái waiting", async () => {
      mockQueue.getJob.mockResolvedValue(mockJob);
      mockJob.getState.mockResolvedValue("waiting");
      await cancelJob("cron", "job-1");
      expect(mockJob.remove).toHaveBeenCalledTimes(1);
    });

    it("KHÔNG xoá job đã active/completed", async () => {
      mockQueue.getJob.mockResolvedValue(mockJob);
      mockJob.getState.mockResolvedValue("active");
      await cancelJob("cron", "job-1");
      expect(mockJob.remove).not.toHaveBeenCalled();
    });
  });

  describe("rescheduleJob", () => {
    it("huỷ job cũ rồi thêm job mới — chỉ job mới được enqueue, job cũ bị xoá", async () => {
      mockQueue.getJob.mockResolvedValue(mockJob);
      mockJob.getState.mockResolvedValue("waiting");

      const runAt = new Date(Date.now() + 2000);
      await rescheduleJob("cron", "job.x", "old-1", "new-1", { v: 2 }, runAt);

      expect(mockJob.remove).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      const [, , data, opts] = mockEnqueue.mock.calls[0] as [string, string, unknown, { jobId: string }];
      expect(data).toEqual({ v: 2 });
      expect(opts.jobId).toBe("new-1");
    });

    it("job cũ không tồn tại vẫn tạo job mới bình thường (idempotent)", async () => {
      mockQueue.getJob.mockResolvedValue(undefined);
      await rescheduleJob("cron", "job.x", "old-missing", "new-2", {}, new Date(Date.now() + 1000));
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });
  });
});
