/**
 * Unit — cron `threads.counters-rebuild` (be.md p1-06 §7): lưới an toàn tính lại số liệu
 * phi chuẩn hoá của thread có hoạt động 24h gần nhất từ nguồn `Message` (threadKey = id tin gốc).
 * `replyCount` đếm CẢ reply đã thu hồi (không nhảy số); lỗi 1 thread không chặn cả lượt.
 */
import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
const mockCronDefs: Array<Record<string, unknown>> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
  defineCron: (def: Record<string, unknown>) => {
    mockCronDefs.push(def);
  },
}));

const mockThreadFindMany = jest.fn();
const mockThreadUpdate = jest.fn();
const mockMessageCount = jest.fn();
const mockMessageFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    thread: {
      findMany: (...a: unknown[]) => mockThreadFindMany(...a),
      update: (...a: unknown[]) => mockThreadUpdate(...a),
    },
    message: {
      count: (...a: unknown[]) => mockMessageCount(...a),
      findMany: (...a: unknown[]) => mockMessageFindMany(...a),
    },
  },
}));

const mockWarn = jest.fn();
jest.mock("../../../infrastructure/logger", () => ({
  logger: { info: jest.fn(), warn: (...a: unknown[]) => mockWarn(...a), error: jest.fn(), debug: jest.fn() },
}));

import "../jobs/threads-counters-rebuild.job";

const ROOT_1 = "1".repeat(24);
const ROOT_2 = "2".repeat(24);
const U1 = "a".repeat(24);
const U2 = "b".repeat(24);
const U3 = "c".repeat(24);
const U4 = "d".repeat(24);

function processor(): Processor {
  const found = mockRegistered.find((c) => c[0] === "cron" && c[1] === "threads.counters-rebuild");
  if (!found) throw new Error("Chưa đăng ký processor threads.counters-rebuild");
  return found[2];
}

describe("threads.counters-rebuild", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-09-19T20:30:00.000Z") });
    mockThreadUpdate.mockResolvedValue(undefined);
  });
  afterEach(() => jest.useRealTimers());

  it("đăng ký processor queue cron + lịch 03:30 hằng đêm, không retry", () => {
    expect(mockRegistered).toContainEqual(["cron", "threads.counters-rebuild", expect.any(Function)]);
    expect(mockCronDefs).toContainEqual({
      schedulerId: "threads.counters-rebuild",
      queue: "cron",
      jobName: "threads.counters-rebuild",
      pattern: "30 3 * * *",
      opts: { attempts: 1 },
    });
  });

  it("chỉ quét thread có hoạt động trong 24h gần nhất (updatedAt hoặc lastReplyAt)", async () => {
    mockThreadFindMany.mockResolvedValue([]);
    await processor()({} as Job);
    const since = new Date("2026-09-18T20:30:00.000Z");
    expect(mockThreadFindMany).toHaveBeenCalledWith({
      where: { OR: [{ updatedAt: { gte: since } }, { lastReplyAt: { gte: since } }] },
      select: { id: true, parentMessageId: true },
    });
    expect(mockThreadUpdate).not.toHaveBeenCalled();
  });

  it("tính lại từ nguồn: replyCount = SỐ reply (kể cả đã thu hồi), lastReplySeq/At theo reply mới nhất, lastReplierIds mới nhất trước, không trùng, ≤ 3", async () => {
    mockThreadFindMany.mockResolvedValue([{ id: "t1", parentMessageId: ROOT_1 }]);
    mockMessageCount.mockResolvedValue(7);
    const newest = new Date("2026-09-19T20:00:00.000Z");
    mockMessageFindMany.mockResolvedValue([
      { seq: 7, authorId: U1, createdAt: newest },
      { seq: 6, authorId: U1, createdAt: new Date() }, // trùng người → gộp
      { seq: 5, authorId: U2, createdAt: new Date() },
      { seq: 4, authorId: null, createdAt: new Date() }, // không tác giả → bỏ
      { seq: 3, authorId: U3, createdAt: new Date() },
      { seq: 2, authorId: U4, createdAt: new Date() }, // vượt trần 3 → bỏ
    ]);

    await processor()({} as Job);

    expect(mockMessageCount).toHaveBeenCalledWith({ where: { scopeType: "CHANNEL", threadKey: ROOT_1 } }); // KHÔNG lọc deletedAt
    expect(mockMessageFindMany).toHaveBeenCalledWith({
      where: { scopeType: "CHANNEL", threadKey: ROOT_1 },
      orderBy: { seq: "desc" },
      take: 20,
      select: { seq: true, authorId: true, createdAt: true },
    });
    expect(mockThreadUpdate).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { replyCount: 7, lastReplySeq: 7, lastReplyAt: newest, lastReplierIds: [U1, U2, U3] },
    });
  });

  it("thread không còn reply nào trong nguồn → bỏ qua (không ghi số 0 đè)", async () => {
    mockThreadFindMany.mockResolvedValue([{ id: "t1", parentMessageId: ROOT_1 }]);
    mockMessageCount.mockResolvedValue(0);
    mockMessageFindMany.mockResolvedValue([]);
    await processor()({} as Job);
    expect(mockThreadUpdate).not.toHaveBeenCalled();
  });

  it("1 thread lỗi không chặn thread còn lại (cảnh báo, không throw)", async () => {
    mockThreadFindMany.mockResolvedValue([
      { id: "t1", parentMessageId: ROOT_1 },
      { id: "t2", parentMessageId: ROOT_2 },
    ]);
    mockMessageCount.mockImplementation(async (args: { where: { threadKey: string } }) => {
      if (args.where.threadKey === ROOT_1) throw new Error("mongo timeout");
      return 2;
    });
    mockMessageFindMany.mockResolvedValue([{ seq: 2, authorId: U1, createdAt: new Date() }]);

    await expect(processor()({} as Job)).resolves.toBeUndefined();

    expect(mockThreadUpdate).toHaveBeenCalledTimes(1);
    expect(mockThreadUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t2" } }));
    expect(mockWarn).toHaveBeenCalledWith(
      "[threads.counters-rebuild] Lỗi tính lại 1 thread, bỏ qua",
      expect.objectContaining({ threadId: "t1", error: "mongo timeout" })
    );
  });
});
