/**
 * Unit — tin đã lưu khi ghép cờ `isSaved` + khi ẩn danh hoá tài khoản (p1-04/p1-09):
 *  - `SavedMessageReaderImpl.savedIdsOf` trả tập con id do CHÍNH người xem lưu (1 truy vấn, không lẫn người khác);
 *  - consumer `discovery.user-anonymized` (queue `reports`) xoá MỌI tin đã lưu của user, idempotent, bỏ qua payload thiếu userId.
 */
import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

// KHÔNG dùng jest.fn().mock.calls — `resetMocks: true` xoá lịch sử gọi (kể cả side-effect `registerJob` lúc import).
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
}));

const mockDeleteMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { savedMessage: { deleteMany: (...args: unknown[]) => mockDeleteMany(...args) } },
}));

const mockWarn = jest.fn();
const mockInfo = jest.fn();
jest.mock("../../../infrastructure/logger", () => ({
  logger: {
    info: (...args: unknown[]) => mockInfo(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { InMemorySavedMessageRepository } from "../repositories/saved-message.repository.inmemory";
import { SavedMessageReaderImpl } from "../services/saved-message-reader";
import "../jobs/saved-user-anonymized.consumer";

const U1 = "b1".repeat(12);
const U2 = "b2".repeat(12);
const M1 = "d1".repeat(12);
const M2 = "d2".repeat(12);
const M3 = "d3".repeat(12);
const CH = "c1".repeat(12);

async function seedSaved(repo: InMemorySavedMessageRepository, userId: string, messageId: string): Promise<void> {
  await repo.create({ userId, messageId, scopeType: "CHANNEL", scopeId: CH, workspaceId: null, threadId: null });
}

describe("SavedMessageReaderImpl (cổng isSaved của messages)", () => {
  it("chỉ trả id do CHÍNH người xem lưu, trong tập id được hỏi", async () => {
    const repo = new InMemorySavedMessageRepository();
    await seedSaved(repo, U1, M1);
    await seedSaved(repo, U1, M3);
    await seedSaved(repo, U2, M2); // người khác lưu — không lẫn vào

    const reader = new SavedMessageReaderImpl(repo);
    expect([...(await reader.savedIdsOf(U1, [M1, M2]))]).toEqual([M1]); // M3 đã lưu nhưng không được hỏi
    expect([...(await reader.savedIdsOf(U2, [M1, M2]))]).toEqual([M2]);
    expect((await reader.savedIdsOf(U1, [])).size).toBe(0);
  });
});

describe("InMemorySavedMessageRepository.deleteAllByUser", () => {
  it("xoá MỌI bản lưu của user, không đụng người khác; chạy lại trả 0 (idempotent)", async () => {
    const repo = new InMemorySavedMessageRepository();
    await seedSaved(repo, U1, M1);
    await seedSaved(repo, U1, M2);
    await seedSaved(repo, U2, M1);

    expect(await repo.deleteAllByUser(U1)).toBe(2);
    expect(await repo.countByUser(U1)).toBe(0);
    expect(await repo.countByUser(U2)).toBe(1);
    expect(await repo.deleteAllByUser(U1)).toBe(0);
  });
});

describe("job discovery.user-anonymized", () => {
  function processor(): Processor {
    const call = mockRegistered.find((c) => c[0] === "reports" && c[1] === "discovery.user-anonymized");
    if (!call) throw new Error("Không tìm thấy processor discovery.user-anonymized đã đăng ký");
    return call[2];
  }

  beforeEach(() => {
    mockDeleteMany.mockReset();
    mockWarn.mockClear();
    mockInfo.mockClear();
  });

  it("đăng ký trên queue reports (khớp dòng outbox do UserAnonymizer ghi)", () => {
    expect(mockRegistered).toContainEqual(["reports", "discovery.user-anonymized", expect.any(Function)]);
  });

  it("xoá bản lưu theo userId trong payload", async () => {
    mockDeleteMany.mockResolvedValue({ count: 3 });
    await processor()({ id: "job-1", data: { userId: U1 } } as unknown as Job);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: U1 } });
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining("discovery.user-anonymized"), { userId: U1, deleted: 3 });
  });

  it("payload thiếu userId: cảnh báo và KHÔNG xoá gì (tránh deleteMany không điều kiện)", async () => {
    await processor()({ id: "job-2", data: {} } as unknown as Job);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalled();
  });
});
