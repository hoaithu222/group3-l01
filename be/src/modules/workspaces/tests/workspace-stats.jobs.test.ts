/**
 * Unit — cron `workspace.stats-daily` (p1-01 §7): đếm TIN/TỆP thật theo ngày trong
 * múi giờ `CRON_TZ`, thay cho `messages/files` cố định 0. Mock Prisma; kiểm khoảng
 * thời gian, bộ lọc đếm, upsert idempotent, backfill, lỗi từng workspace.
 */
import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;
interface CronDef {
  schedulerId: string;
  queue: string;
  jobName: string;
  pattern: string;
  opts?: Record<string, unknown>;
}
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

jest.mock("../../../core/config", () => ({ env: { CRON_TZ: "Asia/Ho_Chi_Minh" } }));

const mockWorkspaceFindMany = jest.fn();
const mockMessageCount = jest.fn();
const mockMessageFindMany = jest.fn();
const mockMembershipCount = jest.fn();
const mockStatUpsert = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    workspace: { findMany: (...a: unknown[]) => mockWorkspaceFindMany(...a) },
    message: {
      count: (...a: unknown[]) => mockMessageCount(...a),
      findMany: (...a: unknown[]) => mockMessageFindMany(...a),
    },
    workspaceMembership: { count: (...a: unknown[]) => mockMembershipCount(...a) },
    workspaceDailyStat: { upsert: (...a: unknown[]) => mockStatUpsert(...a) },
  },
}));

const mockWarn = jest.fn();
jest.mock("../../../infrastructure/logger", () => ({
  logger: { info: jest.fn(), warn: (...a: unknown[]) => mockWarn(...a), error: jest.fn(), debug: jest.fn() },
}));

import "../jobs/workspace-stats.jobs";

const WS1 = "a1".repeat(12);
const WS2 = "a2".repeat(12);

function processor(): Processor {
  const found = mockRegistered.find((c) => c[0] === "reports" && c[1] === "workspace.stats-daily");
  if (!found) throw new Error("Chưa đăng ký processor workspace.stats-daily");
  return found[2];
}

describe("workspace.stats-daily", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-09-18T18:10:00.000Z") }); // 01:10 ICT ngày 19/09
    mockWorkspaceFindMany.mockResolvedValue([{ id: WS1 }]);
    mockMessageCount.mockResolvedValue(0);
    mockMessageFindMany.mockResolvedValue([]);
    mockMembershipCount.mockResolvedValue(0);
    mockStatUpsert.mockResolvedValue(undefined);
  });
  afterEach(() => jest.useRealTimers());

  it("đăng ký processor queue reports + cron 01:10 hằng ngày, retry 3 lần", () => {
    expect(mockRegistered).toContainEqual(["reports", "workspace.stats-daily", expect.any(Function)]);
    expect(mockCronDefs).toContainEqual({
      schedulerId: "workspace.stats-daily",
      queue: "reports",
      jobName: "workspace.stats-daily",
      pattern: "10 1 * * *",
      opts: { attempts: 3 },
    });
  });

  it("tổng kết HÔM QUA theo ICT: date=2026-09-18, khoảng [17/09 17:00Z, 18/09 17:00Z); messages = số tin USER trong khoảng đó", async () => {
    mockMessageCount.mockResolvedValue(42);
    mockMembershipCount.mockResolvedValue(7);

    await processor()({ data: {} } as Job);

    const from = new Date("2026-09-17T17:00:00.000Z");
    const to = new Date("2026-09-18T17:00:00.000Z");
    expect(mockMessageCount).toHaveBeenCalledWith({ where: { workspaceId: WS1, kind: "USER", createdAt: { gte: from, lt: to } } });
    expect(mockMembershipCount).toHaveBeenCalledWith({ where: { workspaceId: WS1, status: "ACTIVE" } });
    expect(mockStatUpsert).toHaveBeenCalledWith({
      where: { workspaceId_date: { workspaceId: WS1, date: "2026-09-18" } },
      create: { workspaceId: WS1, date: "2026-09-18", messages: 42, files: 0, activeMembers: 7 },
      update: { messages: 42, files: 0, activeMembers: 7 },
    });
  });

  it("files = tổng số tệp đính kèm của các tin CÓ tệp trong ngày (không phải số tin)", async () => {
    mockMessageFindMany.mockResolvedValue([
      { id: "m1", attachments: [{}, {}, {}] },
      { id: "m2", attachments: [{}] },
    ]);
    await processor()({ data: {} } as Job);

    expect(mockMessageFindMany).toHaveBeenCalledTimes(1);
    expect(mockMessageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS1, kind: "USER", attachments: { isEmpty: false } }),
        select: { id: true, attachments: true },
        take: 500,
      })
    );
    expect(mockStatUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ files: 4 }) }));
  });

  it("phân trang theo id khi có > 500 tin có tệp: cộng dồn mọi trang, dừng khi trang cuối < 500", async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ({ id: `p1-${i}`, attachments: [{}] }));
    mockMessageFindMany.mockResolvedValueOnce(fullPage).mockResolvedValueOnce([{ id: "p2-0", attachments: [{}, {}] }]);

    await processor()({ data: {} } as Job);

    expect(mockMessageFindMany).toHaveBeenCalledTimes(2);
    expect(mockMessageFindMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "p1-499" }, skip: 1 });
    expect(mockStatUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ files: 502 }) }));
  });

  it("workspace vừa lưu trữ sau đầu ngày vẫn được tổng kết (điều kiện ACTIVE hoặc archivedAt ≥ from)", async () => {
    await processor()({ data: {} } as Job);
    expect(mockWorkspaceFindMany).toHaveBeenCalledWith({
      where: { OR: [{ status: "ACTIVE" }, { archivedAt: { gte: new Date("2026-09-17T17:00:00.000Z") } }] },
      select: { id: true },
    });
  });

  it("backfill data.date: dùng đúng ngày đó, KHÔNG ghi đè activeMembers của dòng đã có", async () => {
    mockMessageCount.mockResolvedValue(5);
    mockMembershipCount.mockResolvedValue(9);
    await processor()({ data: { date: "2026-09-10" } } as Job);

    expect(mockMessageCount).toHaveBeenCalledWith({
      where: { workspaceId: WS1, kind: "USER", createdAt: { gte: new Date("2026-09-09T17:00:00.000Z"), lt: new Date("2026-09-10T17:00:00.000Z") } },
    });
    expect(mockStatUpsert).toHaveBeenCalledWith({
      where: { workspaceId_date: { workspaceId: WS1, date: "2026-09-10" } },
      create: { workspaceId: WS1, date: "2026-09-10", messages: 5, files: 0, activeMembers: 9 },
      update: { messages: 5, files: 0 },
    });
  });

  it("data.date không hợp lệ → job thất bại (BullMQ retry/ghi nhận), không ghi gì", async () => {
    await expect(processor()({ data: { date: "18/09/2026" } } as Job)).rejects.toThrow(/date không hợp lệ/);
    expect(mockStatUpsert).not.toHaveBeenCalled();
    expect(mockWorkspaceFindMany).not.toHaveBeenCalled();
  });

  it("1 workspace lỗi không chặn các workspace còn lại (cảnh báo, không throw)", async () => {
    mockWorkspaceFindMany.mockResolvedValue([{ id: WS1 }, { id: WS2 }]);
    mockMessageCount.mockImplementation(async (args: { where: { workspaceId: string } }) => {
      if (args.where.workspaceId === WS1) throw new Error("mongo timeout");
      return 3;
    });

    await expect(processor()({ data: {} } as Job)).resolves.toBeUndefined();

    expect(mockStatUpsert).toHaveBeenCalledTimes(1);
    expect(mockStatUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ workspaceId: WS2, messages: 3 }) }));
    expect(mockWarn).toHaveBeenCalledWith(
      "[workspace.stats-daily] Lỗi tính số liệu 1 workspace, bỏ qua",
      expect.objectContaining({ workspaceId: WS1, error: "mongo timeout" })
    );
  });

  it("job.data thiếu (undefined) vẫn chạy như không có date", async () => {
    await expect(processor()({} as Job)).resolves.toBeUndefined();
    expect(mockStatUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId_date: { workspaceId: WS1, date: "2026-09-18" } } }));
  });
});
