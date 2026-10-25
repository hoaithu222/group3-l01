/**
 * Unit — `ReportService` (be.md p1-08 §5.2): MOD-01 idempotent (lần 2 trả bản cũ, không thêm Report/outbox), race P2002-tương-đương
 * (`ReportDuplicateError`) đọc lại NGOÀI transaction, outbox `report.created` không chứa nội dung. Repo in-memory.
 */
const mockOutboxAdd = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
jest.mock("../../../infrastructure/queue", () => ({
  outbox: { add: (...args: unknown[]) => mockOutboxAdd(...args) },
}));

import { ReportService } from "../services/report.service";
import type { ReportTargetResolver } from "../services/report-target.resolver";
import { InMemoryReportRepository } from "../repositories/report.repository.inmemory";
import { ReportDuplicateError } from "../repositories/report.repository.interface";
import type { ResolvedReportTarget } from "../entities/report.interface";
import { AUTHOR, CHANNEL_ID, MSG_ID, REPORTER, WS, oid } from "./report-fixtures";

const TARGET: ResolvedReportTarget = {
  targetType: "MESSAGE",
  targetId: MSG_ID,
  groupKey: `MESSAGE:${MSG_ID}`,
  scopeType: "CHANNEL",
  scopeId: CHANNEL_ID,
  scopeIsPrivate: false,
  workspaceId: WS,
  targetAuthorId: AUTHOR,
  handlerLevel: "SCOPE",
};

const resolverOf = (target = TARGET) => ({ resolve: jest.fn().mockResolvedValue(target) }) as unknown as jest.Mocked<ReportTargetResolver>;

describe("ReportService.create", () => {
  beforeEach(() => mockOutboxAdd.mockReset());

  it("MOD-01: cùng người báo cáo cùng tin 2 lần → 1 Report, lần 2 trả bản cũ (alreadyReported) và KHÔNG thêm outbox/không tra đích lại", async () => {
    const repo = new InMemoryReportRepository();
    const resolver = resolverOf();
    const service = new ReportService(repo, resolver);
    const dto = { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" } as const;

    const first = await service.create(REPORTER, dto);
    const second = await service.create(REPORTER, dto);

    expect(first.alreadyReported).toBe(false);
    expect(second).toMatchObject({ id: first.id, alreadyReported: true, status: "OPEN" });
    expect(repo.reports).toHaveLength(1);
    expect(mockOutboxAdd).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
  });

  it("lưu phạm vi/tác giả/handlerLevel từ resolver, description rỗng → null, outbox `report.created` chỉ mang id (không nội dung)", async () => {
    const repo = new InMemoryReportRepository();
    const service = new ReportService(repo, resolverOf());

    await service.create(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "OTHER", description: "" });

    expect(repo.reports[0]).toMatchObject({
      reporterId: REPORTER.id,
      groupKey: TARGET.groupKey,
      scopeType: "CHANNEL",
      workspaceId: WS,
      targetAuthorId: AUTHOR,
      handlerLevel: "SCOPE",
      status: "OPEN",
      description: null,
      resolvedAt: null,
      resolution: null,
    });
    const event = mockOutboxAdd.mock.calls[0][1] as { jobName: string; dedupeKey: string; payload: Record<string, unknown> };
    expect(event.jobName).toBe("report.events");
    expect(event.dedupeKey).toBe(`report.created:${repo.reports[0].id}`);
    expect(Object.keys(event.payload).sort()).toEqual(["event", "groupKey", "reportId"]);
  });

  it("2 người báo cáo cùng tin → 2 Report cùng groupKey (gộp ở hàng đợi)", async () => {
    const repo = new InMemoryReportRepository();
    const service = new ReportService(repo, resolverOf());
    const dto = { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" } as const;

    await service.create(REPORTER, dto);
    await service.create({ ...REPORTER, id: oid("5") }, dto);

    expect(repo.reports.map((r) => r.groupKey)).toEqual([TARGET.groupKey, TARGET.groupKey]);
  });

  it("race: 2 request cùng lúc — bản thua ném ReportDuplicateError → đọc lại NGOÀI transaction, trả bản thắng (alreadyReported)", async () => {
    const repo = new InMemoryReportRepository();
    const winner = await repo.create({} as never, {
      reporterId: REPORTER.id,
      ...TARGET,
      reason: "SPAM",
      description: null,
    });
    // Mô phỏng: lúc kiểm sớm chưa thấy (return null), lúc create thì đã có → ReportDuplicateError, đọc lại thấy `winner`.
    jest.spyOn(repo, "findByUnique").mockResolvedValueOnce(null).mockResolvedValue(winner);
    const service = new ReportService(repo, resolverOf());

    const result = await service.create(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" });

    expect(result).toMatchObject({ id: winner.id, alreadyReported: true });
    expect(repo.reports).toHaveLength(1);
    expect(mockOutboxAdd).not.toHaveBeenCalled();
  });

  it("lỗi khác ReportDuplicateError được ném lại nguyên vẹn", async () => {
    const repo = new InMemoryReportRepository();
    jest.spyOn(repo, "create").mockRejectedValue(new Error("db down"));
    const service = new ReportService(repo, resolverOf());
    await expect(service.create(REPORTER, { targetType: "MESSAGE", targetId: MSG_ID, reason: "SPAM" })).rejects.toThrow("db down");
    expect(new ReportDuplicateError()).toBeInstanceOf(Error);
  });
});

describe("ReportService.myReports", () => {
  it("chỉ báo cáo của mình, không có nội dung/đích chi tiết, cursor phân trang", async () => {
    const repo = new InMemoryReportRepository();
    const service = new ReportService(repo, resolverOf());
    for (const c of ["a", "b", "c"]) {
      await repo.create({} as never, { reporterId: REPORTER.id, ...TARGET, targetId: oid(c), groupKey: `MESSAGE:${oid(c)}`, reason: "SPAM", description: "riêng tư" });
    }
    await repo.create({} as never, { reporterId: oid("5"), ...TARGET, targetId: oid("f"), groupKey: `MESSAGE:${oid("f")}`, reason: "SPAM", description: null });

    const page1 = await service.myReports(REPORTER.id, { limit: 2 });

    expect(page1.data).toHaveLength(2);
    expect(page1.meta.hasMore).toBe(true);
    expect(Object.keys(page1.data[0]).sort()).toEqual(["createdAt", "id", "reason", "resolution", "status", "targetType"]);

    const page2 = await service.myReports(REPORTER.id, { limit: 2, cursor: page1.meta.nextCursor ?? undefined });
    expect(page2.data).toHaveLength(1);
    expect(page2.meta.hasMore).toBe(false);
  });
});
