/**
 * Integration test — dùng MongoMemoryReplSet thật (qua `TEST_DB=memory`,
 * `global-setup.ts`) cho phần Prisma/transaction/unique index. Phần đụng tới
 * BullMQ thật (`enqueue`) được MOCK (giống `cron.registry.test.ts`/
 * `asset.jobs.test.ts`) — test này không cần Redis.
 */
const mockEnqueue = jest.fn().mockResolvedValue(undefined);
jest.mock("../../queues", () => {
  const actual = jest.requireActual("../../queues");
  return {
    ...actual,
    enqueue: (...args: unknown[]) => mockEnqueue(...(args as [])),
  };
});

import { Prisma } from "@prisma/client";
import { prisma } from "../../../database";
import { outbox } from "../../outbox/outbox.writer";
import { drainOutboxBatch } from "../../outbox/outbox.relay";
import { outboxFailedTotal } from "../../../metrics";

/**
 * `dispatchClaimed()` dùng `jobId` đã thay `:` → `_` từ `dedupeKey` (BullMQ
 * `Job.create()` ném lỗi cho jobId có `:` trừ đúng 3 phần/2 dấu `:` — phát
 * hiện lúc viết integration test p1-02 gọi thật qua relay). `dedupeKey` gốc
 * (dùng làm unique key Mongo) vẫn giữ nguyên, chỉ `jobId` truyền BullMQ đổi.
 */
function toSafeJobId(dedupeKey: string): string {
  return dedupeKey.replace(/:/g, "_");
}

describe("outbox (integration — Mongo memory replset)", () => {
  beforeAll(async () => {
    // `global-setup.ts` chỉ khởi `MongoMemoryReplSet` RỖNG (không index) —
    // không chạy `prisma db push` cho mỗi lần test (tốn thời gian mọi test
    // suite khác dùng chung replset). Tự tạo index unique cần cho đúng test
    // này (JOB-05 — chặn trùng `dedupeKey`), khớp `prisma/schema.prisma`.
    await prisma.$runCommandRaw({
      createIndexes: "OutboxEvent",
      indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }],
    });
  });

  beforeEach(async () => {
    // ⛔ CHỈ xoá bản ghi của CHÍNH file test này (`dedupeKey` luôn bắt đầu
    // "test." — xem mọi `it()` dưới đây). `MongoMemoryReplSet` dùng CHUNG cho
    // toàn bộ project "integration" (globalSetup, 1 lần) — file test khác
    // (vd `modules/users/tests/integration/delete-request.test.ts`, cũng ghi
    // `OutboxEvent` qua `withTransaction`) chạy ở Jest worker KHÁC cùng lúc.
    // `deleteMany({})` KHÔNG lọc sẽ xoá mất dữ liệu file kia đang test dở.
    await prisma.outboxEvent.deleteMany({ where: { dedupeKey: { startsWith: "test." } } });
    mockEnqueue.mockReset().mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { dedupeKey: { startsWith: "test." } } });
  });

  it("transaction rollback KHÔNG tạo OutboxEvent (JOB-03)", async () => {
    const dedupeKey = `test.rollback:${Date.now()}`;

    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.add(tx, {
          type: "test.rollback",
          aggregateType: "Test",
          aggregateId: "a1",
          queue: "cron",
          jobName: "test.rollback",
          payload: { foo: "bar" },
          dedupeKey,
        });
        throw new Error("boom — rollback có chủ đích");
      })
    ).rejects.toThrow("boom");

    const found = await prisma.outboxEvent.findUnique({ where: { dedupeKey } });
    expect(found).toBeNull();
  });

  it("dedupeKey trùng bị Mongo unique index chặn (JOB-05)", async () => {
    const dedupeKey = `test.dedupe:${Date.now()}`;
    const input = {
      type: "test.dedupe",
      aggregateType: "Test",
      aggregateId: "a2",
      queue: "cron" as const,
      jobName: "test.dedupe",
      payload: { n: 1 },
      dedupeKey,
    };

    await prisma.$transaction((tx) => outbox.add(tx, input));

    await expect(prisma.$transaction((tx) => outbox.add(tx, input))).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);

    const count = await prisma.outboxEvent.count({ where: { dedupeKey } });
    expect(count).toBe(1);
  });

  it("claim lại bản ghi DISPATCHING quá lockedUntil (khoá cũ đã chết) (JOB-04)", async () => {
    const staleDoc = await prisma.outboxEvent.create({
      data: {
        type: "test.stale-lock",
        aggregateType: "Test",
        aggregateId: "a3",
        queue: "cron",
        jobName: "test.stale-lock",
        dedupeKey: `test.stale-lock:${Date.now()}`,
        payload: { schemaVersion: 1 },
        status: "DISPATCHING",
        lockedBy: "dead-instance",
        lockedUntil: new Date(Date.now() - 5_000), // đã hết hạn khoá
        attempts: 1,
      },
    });

    const processed = await drainOutboxBatch();

    // ⚠️ >= 1, KHÔNG `toBe(1)`: replset dùng chung project "integration" có
    // thể có bản ghi PENDING/hết-khoá của file test khác tới hạn CÙNG lúc —
    // cái quan trọng là ĐÚNG bản ghi của test này đã được claim (2 assert dưới).
    expect(processed).toBeGreaterThanOrEqual(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "cron",
      "test.stale-lock",
      expect.objectContaining({ schemaVersion: 1 }),
      expect.objectContaining({ jobId: toSafeJobId(staleDoc.dedupeKey) })
    );

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: staleDoc.id } });
    expect(updated.status).toBe("DISPATCHED");
    expect(updated.dispatchedAt).not.toBeNull();
    expect(updated.lockedUntil).toBeNull();
  });

  it("KHÔNG claim bản ghi DISPATCHING còn khoá hợp lệ (chưa hết lockedUntil)", async () => {
    const doc = await prisma.outboxEvent.create({
      data: {
        type: "test.active-lock",
        aggregateType: "Test",
        aggregateId: "a4",
        queue: "cron",
        jobName: "test.active-lock",
        dedupeKey: `test.active-lock:${Date.now()}`,
        payload: { schemaVersion: 1 },
        status: "DISPATCHING",
        lockedBy: "alive-instance",
        lockedUntil: new Date(Date.now() + 30_000),
        attempts: 1,
      },
    });

    await drainOutboxBatch();

    // Kiểm ĐÚNG bản ghi này (không kiểm `processed`/`mockEnqueue` toàn cục —
    // replset dùng chung có thể có claim khác từ file test song song, xem
    // ghi chú ở `beforeEach`).
    expect(mockEnqueue).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ jobId: toSafeJobId(doc.dedupeKey) })
    );
    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe("DISPATCHING");
    expect(updated.lockedBy).toBe("alive-instance");
  });

  it("dedupeKey nhiều dấu `:` (4+ phần) vẫn dispatch được — jobId đã thế `:` → `_`", async () => {
    // Mô phỏng đúng dạng dedupeKey THẬT gây lỗi (`membership.revoked:<wsId>:<userId>:<ts>`
    // — 4 phần/3 dấu `:`, BullMQ `Job.create()` ném "Custom Id cannot contain :"
    // cho MỌI số dấu `:` khác 0 hoặc 2 khi dùng thẳng làm jobId).
    const dedupeKey = `test.many.colons:${Date.now()}:userId:extra`;
    const doc = await prisma.outboxEvent.create({
      data: {
        type: "test.many.colons",
        aggregateType: "Test",
        aggregateId: "a9",
        queue: "cron",
        jobName: "test.many.colons",
        dedupeKey,
        payload: { schemaVersion: 1 },
        status: "PENDING",
        availableAt: new Date(Date.now() - 1000),
      },
    });

    await drainOutboxBatch();

    expect(mockEnqueue).toHaveBeenCalledWith(
      "cron",
      "test.many.colons",
      expect.objectContaining({ schemaVersion: 1 }),
      expect.objectContaining({ jobId: expect.not.stringContaining(":") })
    );
    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe("DISPATCHED");
  });

  it("claim + dispatch thành công 1 PENDING đã tới hạn availableAt", async () => {
    const doc = await prisma.outboxEvent.create({
      data: {
        type: "test.pending",
        aggregateType: "Test",
        aggregateId: "a5",
        queue: "notifications",
        jobName: "test.pending",
        dedupeKey: `test.pending:${Date.now()}`,
        payload: { schemaVersion: 1, hello: "world" },
        status: "PENDING",
        availableAt: new Date(Date.now() - 1000),
      },
    });

    const processed = await drainOutboxBatch();

    // ⚠️ Xem ghi chú ở test JOB-04 phía trên — không ép `toBe(1)`.
    expect(processed).toBeGreaterThanOrEqual(1);
    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe("DISPATCHED");
    expect(updated.attempts).toBe(1);
  });

  it("KHÔNG claim PENDING chưa tới hạn (availableAt trong tương lai)", async () => {
    const doc = await prisma.outboxEvent.create({
      data: {
        type: "test.future",
        aggregateType: "Test",
        aggregateId: "a6",
        queue: "cron",
        jobName: "test.future",
        dedupeKey: `test.future:${Date.now()}`,
        payload: { schemaVersion: 1 },
        status: "PENDING",
        availableAt: new Date(Date.now() + 60_000),
      },
    });

    await drainOutboxBatch();

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe("PENDING");
  });

  it("enqueue lỗi và chưa hết attempts → quay lại PENDING với availableAt trong tương lai (backoff)", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("redis tạm thời không khả dụng"));
    const doc = await prisma.outboxEvent.create({
      data: {
        type: "test.retry",
        aggregateType: "Test",
        aggregateId: "a7",
        queue: "cron",
        jobName: "test.retry",
        dedupeKey: `test.retry:${Date.now()}`,
        payload: { schemaVersion: 1 },
        status: "PENDING",
        availableAt: new Date(Date.now() - 1000),
        attempts: 0,
      },
    });

    await drainOutboxBatch();

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe("PENDING");
    expect(updated.attempts).toBe(1);
    expect(updated.lastError).toContain("redis tạm thời");
    expect(updated.availableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("enqueue lỗi và đã hết attempts (>= maxAttempts) → chuyển FAILED", async () => {
    mockEnqueue.mockRejectedValueOnce(new Error("lỗi vĩnh viễn"));
    const before = await outboxFailedTotal.get();
    const beforeValue = before.values[0]?.value ?? 0;

    const doc = await prisma.outboxEvent.create({
      data: {
        type: "test.exhausted",
        aggregateType: "Test",
        aggregateId: "a8",
        queue: "cron",
        jobName: "test.exhausted",
        dedupeKey: `test.exhausted:${Date.now()}`,
        payload: { schemaVersion: 1 },
        status: "PENDING",
        availableAt: new Date(Date.now() - 1000),
        attempts: 9, // findAndModify sẽ $inc lên 10 = LIMITS.outbox.maxAttempts
      },
    });

    await drainOutboxBatch();

    const updated = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.lastError).toContain("lỗi vĩnh viễn");

    const after = await outboxFailedTotal.get();
    const afterValue = after.values[0]?.value ?? 0;
    expect(afterValue).toBe(beforeValue + 1);
  });
});
