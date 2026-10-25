/**
 * `requestCleanup` chỉ xếp job vào BullMQ + ghi audit — mock `getQueue`/`enqueue`
 * (không cần Redis) và `prisma` (service import nó nhưng đường cleanup không chạm),
 * giống `admin-jobs.service.test.ts`.
 */
const mockGetJob = jest.fn();
const mockEnqueue = jest.fn();

jest.mock("../../../infrastructure/queue", () => ({
  getQueue: jest.fn(),
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));
jest.mock("../../../infrastructure/database", () => ({ prisma: {} }));

import { getQueue } from "../../../infrastructure/queue";
import { AdminStorageService, hourKey, type AuditRecorder } from "../admin-storage.service";

class FakeAuditRecorder implements AuditRecorder {
  calls: Array<Parameters<AuditRecorder["record"]>[0]> = [];
  async record(input: Parameters<AuditRecorder["record"]>[0]): Promise<void> {
    this.calls.push(input);
  }
}

describe("hourKey", () => {
  it("định dạng yyyyMMddHH theo UTC", () => {
    expect(hourKey(new Date("2026-09-19T07:45:12.000Z"))).toBe("2026091907");
    expect(hourKey(new Date("2026-01-02T23:59:59.999Z"))).toBe("2026010223");
  });

  it("jobId ghép ra đúng 2 dấu ':' (BullMQ chỉ nhận jobId tuỳ biến có ':' khi đúng 3 phần)", () => {
    const jobId = `assets.cleanup:manual:${hourKey(new Date())}`;
    expect(jobId.split(":")).toHaveLength(3);
  });
});

describe("AdminStorageService.requestCleanup", () => {
  let audit: FakeAuditRecorder;
  let service: AdminStorageService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-19T07:45:00.000Z"));
    audit = new FakeAuditRecorder();
    service = new AdminStorageService(audit);
    // `resetMocks: true` (jest.config.ts) xoá implementation khai trong factory — dựng lại mỗi test.
    (getQueue as jest.Mock).mockReturnValue({ getJob: mockGetJob });
    mockGetJob.mockResolvedValue(undefined);
    mockEnqueue.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("xếp job assets.cleanup vào queue cron với jobId theo giờ + ghi audit system.storage-cleanup", async () => {
    const result = await service.requestCleanup("Dọn thủ công trước đợt kiểm kê", "admin-1", "admin");

    expect(result).toEqual({ jobId: "assets.cleanup:manual:2026091907", alreadyQueued: false });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "cron",
      "assets.cleanup",
      { trigger: "manual", requestedBy: "admin-1" },
      { jobId: "assets.cleanup:manual:2026091907" }
    );
    expect(audit.calls).toEqual([
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "system.storage-cleanup",
        targetType: "QueueJob",
        targetId: "cron:assets.cleanup:manual:2026091907",
        reason: "Dọn thủ công trước đợt kiểm kê",
      }),
    ]);
  });

  it("giờ này đã có lượt thủ công → alreadyQueued, không enqueue, không audit", async () => {
    mockGetJob.mockResolvedValue({ id: "assets.cleanup:manual:2026091907" });

    const result = await service.requestCleanup("Dọn thủ công lần hai trong giờ", "admin-1", "admin");

    expect(result).toEqual({ jobId: "assets.cleanup:manual:2026091907", alreadyQueued: true });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(audit.calls).toHaveLength(0);
  });

  it("sang giờ mới → jobId mới, xếp lại được", async () => {
    await service.requestCleanup("Dọn thủ công giờ thứ nhất", "admin-1");
    jest.setSystemTime(new Date("2026-09-19T08:00:00.000Z"));
    const second = await service.requestCleanup("Dọn thủ công giờ thứ hai", "admin-1");

    expect(second.jobId).toBe("assets.cleanup:manual:2026091908");
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("enqueue lỗi → ném lỗi, KHÔNG ghi audit (chưa có gì xảy ra)", async () => {
    mockEnqueue.mockRejectedValue(new Error("redis down"));

    await expect(service.requestCleanup("Dọn thủ công khi Redis lỗi", "admin-1")).rejects.toThrow("redis down");
    expect(audit.calls).toHaveLength(0);
  });
});
