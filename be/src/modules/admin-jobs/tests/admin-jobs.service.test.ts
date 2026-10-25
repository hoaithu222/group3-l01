/**
 * `getQueue()` chạm BullMQ/Redis thật, `prisma` chạm MongoDB thật — mock cả
 * hai (giống `cron.registry.test.ts`/`asset.jobs.test.ts`) để test service
 * logic thuần, không cần hạ tầng thật.
 */
const mockQueueInstance = {
  getJobCounts: jest.fn(),
  isPaused: jest.fn(),
  getJobSchedulers: jest.fn(),
  getJobs: jest.fn(),
  getFailedCount: jest.fn(),
  getJob: jest.fn(),
};
const mockOutboxSignal = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../infrastructure/queue", () => ({
  getQueue: jest.fn(() => mockQueueInstance),
  QUEUE_NAMES: [
    "notifications",
    "push",
    "media",
    "reports",
    "gamification",
    "integrations",
    "cron",
    "calls",
  ],
  outboxSignal: (...args: unknown[]) => mockOutboxSignal(...args),
}));

const mockPrisma = {
  outboxEvent: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};
jest.mock("../../../infrastructure/database", () => ({ prisma: mockPrisma }));

import { getQueue, QUEUE_NAMES } from "../../../infrastructure/queue";
import {
  AdminJobsService,
  type AuditRecorder,
} from "../admin-jobs.service";
import {
  JobNotFoundError,
  JobNotRetryableError,
  OutboxEventNotFailedError,
} from "../../../core/exceptions";
import { maskPayload } from "../mask-payload";

class FakeAuditRecorder implements AuditRecorder {
  calls: Array<Parameters<AuditRecorder["record"]>[0]> = [];
  async record(input: Parameters<AuditRecorder["record"]>[0]): Promise<void> {
    this.calls.push(input);
  }
}

describe("AdminJobsService", () => {
  let audit: FakeAuditRecorder;
  let service: AdminJobsService;

  beforeEach(() => {
    audit = new FakeAuditRecorder();
    service = new AdminJobsService(audit);

    (getQueue as jest.Mock).mockReturnValue(mockQueueInstance);
    mockQueueInstance.getJobCounts.mockResolvedValue({
      waiting: 1,
      active: 2,
      delayed: 3,
      failed: 4,
      completed: 5,
    });
    mockQueueInstance.isPaused.mockResolvedValue(false);
    mockQueueInstance.getJobSchedulers.mockResolvedValue([]);
    mockQueueInstance.getJobs.mockResolvedValue([]);
    mockQueueInstance.getFailedCount.mockResolvedValue(0);
    mockQueueInstance.getJob.mockResolvedValue(undefined);

    mockPrisma.outboxEvent.findUnique.mockReset();
    mockPrisma.outboxEvent.update.mockReset();
    mockPrisma.outboxEvent.findMany.mockReset();
    mockOutboxSignal.mockClear();
  });

  describe("getQueues", () => {
    it("trả về 1 summary cho mỗi QUEUE_NAMES với counts/paused/schedulers", async () => {
      mockQueueInstance.getJobSchedulers.mockResolvedValue([
        { key: "outbox.relay", pattern: "* * * * *", next: 123 },
      ]);

      const result = await service.getQueues();

      expect(result).toHaveLength(QUEUE_NAMES.length);
      expect(result[0]).toEqual({
        name: QUEUE_NAMES[0],
        waiting: 1,
        active: 2,
        delayed: 3,
        failed: 4,
        completed: 5,
        paused: false,
        schedulers: [{ id: "outbox.relay", pattern: "* * * * *", next: 123 }],
      });
    });
  });

  describe("getFailedJobs", () => {
    it("che dataPreview theo maskPayload và tổng total = getFailedCount", async () => {
      mockQueueInstance.getJobs.mockResolvedValue([
        {
          id: "job-1",
          name: "mail.send",
          failedReason: "SMTP timeout",
          attemptsMade: 2,
          timestamp: 1000,
          finishedOn: 2000,
          data: { email: "user@example.com", template: "welcome" },
        },
      ]);
      mockQueueInstance.getFailedCount.mockResolvedValue(1);

      const result = await service.getFailedJobs("notifications", 0, 30);

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        queue: "notifications",
        jobId: "job-1",
        failedReason: "SMTP timeout",
        attemptsMade: 2,
      });
      expect(result.items[0]?.dataPreview).toEqual({ email: "***", template: "welcome" });
    });

    it("gộp nhiều queue khi không truyền `queue`", async () => {
      mockQueueInstance.getJobs.mockResolvedValue([
        { id: "1", name: "x", failedReason: null, attemptsMade: 1, timestamp: 1, finishedOn: null, data: {} },
      ]);
      mockQueueInstance.getFailedCount.mockResolvedValue(1);

      const result = await service.getFailedJobs(undefined, 0, 30);

      expect(getQueue).toHaveBeenCalledTimes(QUEUE_NAMES.length);
      expect(result.total).toBe(QUEUE_NAMES.length); // 1 mỗi queue (mock trả giống nhau)
    });
  });

  describe("retryJob", () => {
    it("JOB_001 khi không tìm thấy job", async () => {
      mockQueueInstance.getJob.mockResolvedValue(undefined);
      await expect(service.retryJob("cron", "missing", "lý do đủ dài để hợp lệ", "actor-1")).rejects.toBeInstanceOf(
        JobNotFoundError
      );
    });

    it("JOB_002 khi job không ở trạng thái failed", async () => {
      const job = { isFailed: jest.fn().mockResolvedValue(false), retry: jest.fn() };
      mockQueueInstance.getJob.mockResolvedValue(job);
      await expect(
        service.retryJob("cron", "job-1", "lý do đủ dài để hợp lệ", "actor-1")
      ).rejects.toBeInstanceOf(JobNotRetryableError);
      expect(job.retry).not.toHaveBeenCalled();
    });

    it("chạy lại thành công + ghi audit system.job-retry", async () => {
      const job = { isFailed: jest.fn().mockResolvedValue(true), retry: jest.fn().mockResolvedValue(undefined) };
      mockQueueInstance.getJob.mockResolvedValue(job);

      await service.retryJob("cron", "job-1", "lý do đủ dài để hợp lệ", "actor-1", "ADMIN");

      expect(job.retry).toHaveBeenCalledTimes(1);
      expect(audit.calls).toHaveLength(1);
      expect(audit.calls[0]).toMatchObject({
        actorId: "actor-1",
        actorRole: "ADMIN",
        action: "system.job-retry",
        targetType: "QueueJob",
        targetId: "cron:job-1",
      });
    });
  });

  describe("removeJob", () => {
    it("JOB_001 khi không tìm thấy job", async () => {
      mockQueueInstance.getJob.mockResolvedValue(undefined);
      await expect(
        service.removeJob("cron", "missing", "lý do đủ dài để hợp lệ", "actor-1")
      ).rejects.toBeInstanceOf(JobNotFoundError);
    });

    it("xoá thành công + ghi audit system.job-remove", async () => {
      const job = { remove: jest.fn().mockResolvedValue(undefined) };
      mockQueueInstance.getJob.mockResolvedValue(job);

      await service.removeJob("cron", "job-1", "lý do đủ dài để hợp lệ", "actor-1");

      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(audit.calls[0]).toMatchObject({ action: "system.job-remove", targetId: "cron:job-1" });
    });
  });

  describe("requeueOutbox", () => {
    it("JOB_003 khi không tìm thấy event", async () => {
      mockPrisma.outboxEvent.findUnique.mockResolvedValue(null);
      await expect(
        service.requeueOutbox("507f1f77bcf86cd799439011", "lý do đủ dài để hợp lệ", "actor-1")
      ).rejects.toBeInstanceOf(OutboxEventNotFailedError);
    });

    it("JOB_003 khi event không ở trạng thái FAILED", async () => {
      mockPrisma.outboxEvent.findUnique.mockResolvedValue({ id: "x", status: "PENDING" });
      await expect(
        service.requeueOutbox("507f1f77bcf86cd799439011", "lý do đủ dài để hợp lệ", "actor-1")
      ).rejects.toBeInstanceOf(OutboxEventNotFailedError);
    });

    it("đặt lại PENDING + báo outboxSignal + ghi audit khi event đang FAILED", async () => {
      mockPrisma.outboxEvent.findUnique.mockResolvedValue({
        id: "evt-1",
        status: "FAILED",
        type: "test.type",
        queue: "cron",
        jobName: "test.job",
      });
      mockPrisma.outboxEvent.update.mockResolvedValue({});

      await service.requeueOutbox("evt-1", "lý do đủ dài để hợp lệ", "actor-1");

      expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "evt-1" },
          data: expect.objectContaining({ status: "PENDING", attempts: 0 }),
        })
      );
      expect(mockOutboxSignal).toHaveBeenCalledTimes(1);
      expect(audit.calls[0]).toMatchObject({ action: "system.job-outbox-requeue", targetId: "evt-1" });
    });
  });

  describe("hoạt động không có AuditRecorder (optional)", () => {
    it("retryJob vẫn chạy được khi audit không truyền vào (constructor không tham số)", async () => {
      const noAuditService = new AdminJobsService();
      const job = { isFailed: jest.fn().mockResolvedValue(true), retry: jest.fn().mockResolvedValue(undefined) };
      mockQueueInstance.getJob.mockResolvedValue(job);

      await expect(
        noAuditService.retryJob("cron", "job-1", "lý do đủ dài để hợp lệ", "actor-1")
      ).resolves.toBeUndefined();
    });
  });
});

describe("maskPayload", () => {
  it("che các khoá nhạy cảm theo tên (không phân biệt hoa thường), giữ nguyên khoá khác", () => {
    const input = {
      userToken: "abc",
      Password: "secret-value",
      email: "user@example.com",
      phoneNumber: "0900000000",
      content: "nội dung nhạy cảm",
      count: 5,
      nested: { secretKey: "xyz", ok: "fine" },
    };

    const masked = maskPayload(input) as Record<string, unknown>;

    expect(masked["userToken"]).toBe("***");
    expect(masked["Password"]).toBe("***");
    expect(masked["email"]).toBe("***");
    expect(masked["phoneNumber"]).toBe("***");
    expect(masked["content"]).toBe("***");
    expect(masked["count"]).toBe(5);
    expect((masked["nested"] as Record<string, unknown>)["secretKey"]).toBe("***");
    expect((masked["nested"] as Record<string, unknown>)["ok"]).toBe("fine");
  });

  it("payload mail.send: che người nhận (to) và liên kết mang token, giữ khoá lành", () => {
    const input = {
      template: "reset-password",
      to: "nguoi.nhan@example.com",
      vars: { name: "An", resetLink: "https://app/x?token=abc", avatarUrl: "https://cdn/x.png" },
      total: 3,
      photo: "p.png",
      priority: 2,
    };
    const masked = maskPayload(input) as Record<string, unknown>;
    const vars = masked["vars"] as Record<string, unknown>;

    expect(masked["to"]).toBe("***");
    expect(vars["resetLink"]).toBe("***");
    expect(vars["avatarUrl"]).toBe("***");
    // Khoá chỉ chứa chuỗi "to" ở giữa KHÔNG bị che nhầm.
    expect(masked["template"]).toBe("reset-password");
    expect(masked["total"]).toBe(3);
    expect(masked["photo"]).toBe("p.png");
    expect(masked["priority"]).toBe(2);
    expect(vars["name"]).toBe("An");
  });

  it("che phần tử nhạy cảm trong mảng object lồng nhau", () => {
    const input = { items: [{ secret: "s1" }, { name: "n1" }] };
    const masked = maskPayload(input) as { items: Array<Record<string, unknown>> };
    expect(masked.items[0]?.["secret"]).toBe("***");
    expect(masked.items[1]?.["name"]).toBe("n1");
  });

  it("cắt preview khi payload vượt 2 KiB, đánh dấu truncated", () => {
    const bigValue = "x".repeat(3000);
    const masked = maskPayload({ bigField: bigValue }) as { truncated: boolean; preview: string };
    expect(masked.truncated).toBe(true);
    expect(masked.preview.length).toBeLessThanOrEqual(2048);
  });

  it("payload nhỏ không bị đánh dấu truncated", () => {
    const masked = maskPayload({ a: 1 }) as { truncated?: boolean };
    expect(masked.truncated).toBeUndefined();
  });
});
