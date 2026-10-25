import { newObjectId } from "../../../core/utils/object-id";
import { getReportTargetExtension } from "../../../shared/ports/report.port";
import { getNotificationType } from "../../notifications/public";
import { clearPortfolioEventSinks, registerPortfolioEventSink } from "../services/portfolio-event-sinks";

/**
 * `jobs/portfolio.jobs.ts` (be.md §7): processor đúng queue/jobName, lượt thử cuối của build, sink `skill.revoked` (chỉ thu hồi, jobId an toàn), fan-out `portfolio.events`,
 * consumer ẩn danh hoá, hai cron TĨNH. Hạ tầng queue/career và container được giả để chạm ĐÚNG lớp keo của file job.
 */
type Job = { id?: string; data: unknown; attemptsMade: number; opts: { attempts?: number } };
type Processor = (job: Job) => Promise<unknown>;

const mockProcessors = new Map<string, Processor>();
const mockCrons: Array<Record<string, unknown>> = [];
const mockEnqueued: Array<{ queue: string; job: string; data: unknown; opts: Record<string, unknown> }> = [];
const mockSinks = new Map<string, (payload: Record<string, unknown>) => Promise<void>>();
const mockContainer = {
  portfolios: { findById: async () => null },
  build: { run: jest.fn(), reapStale: jest.fn() },
  events: { onSkillRevoked: jest.fn(), onUserAnonymized: jest.fn(), purgeBuild: jest.fn(), cleanupReservations: jest.fn() },
};

jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, name: string, fn: Processor) => mockProcessors.set(`${queue}/${name}`, fn),
  defineCron: (def: Record<string, unknown>) => mockCrons.push(def),
  enqueue: (queue: string, job: string, data: unknown, opts: Record<string, unknown>) => {
    mockEnqueued.push({ queue, job, data, opts });
    return Promise.resolve();
  },
  toSafeJobId: (id: string) => id.replace(/:/g, "_"),
}));
jest.mock("../../career/public", () => ({
  registerSkillEventSink: (name: string, sink: (payload: Record<string, unknown>) => Promise<void>) => mockSinks.set(name, sink),
}));
jest.mock("../portfolio.container", () => ({ getPortfolioContainer: () => mockContainer }));

const pf = newObjectId();
const user = newObjectId();
const skill = newObjectId();
const at = "2026-09-26T03:00:00.000Z";

beforeAll(async () => {
  await import("../jobs/portfolio.jobs");
});

beforeEach(() => {
  mockEnqueued.length = 0;
  clearPortfolioEventSinks();
});

/** `attempts: null` = job không khai `opts.attempts`. */
const job = (data: unknown, attemptsMade = 0, attempts: number | null = 3): Job => ({ id: "j1", data, attemptsMade, opts: { attempts: attempts ?? undefined } });
const proc = (key: string): Processor => {
  const p = mockProcessors.get(key);
  if (!p) throw new Error(`processor ${key} chưa đăng ký`);
  return p;
};

it("đăng ký đủ processor đúng queue/jobName của be.md §7 và hai cron TĨNH", () => {
  expect([...mockProcessors.keys()].sort()).toEqual(
    [
      "cron/portfolio.slug-reservation-cleanup",
      "cron/portfolio.stale-build-reaper",
      "gamification/portfolio.on-skill-revoked",
      "notifications/portfolio.on-user-anonymized",
      "reports/portfolio.build",
      "reports/portfolio.events",
      "reports/portfolio.purge-build",
    ].sort()
  );
  expect(mockCrons).toEqual([
    { schedulerId: "portfolio.slug-reservation-cleanup", queue: "cron", jobName: "portfolio.slug-reservation-cleanup", pattern: "10 3 * * *", opts: { attempts: 1 } },
    { schedulerId: "portfolio.stale-build-reaper", queue: "cron", jobName: "portfolio.stale-build-reaper", pattern: "*/10 * * * *", opts: { attempts: 1 } },
  ]);
});

it("đăng ký loại thông báo và đích báo cáo PORTFOLIO ở phía worker", () => {
  expect(getNotificationType("portfolio.build-failed")).toBeDefined();
  expect(getNotificationType("portfolio.taken-down")).toBeDefined();
  expect(getReportTargetExtension("PORTFOLIO")).toBeDefined();
});

describe("reports/portfolio.build", () => {
  it("lượt đầu: không retry, chưa phải lượt cuối; lượt cuối: retry + finalAttempt", async () => {
    const payload = { event: "portfolio.build", portfolioId: pf, buildVersion: 2 };
    mockContainer.build.run.mockResolvedValue("READY");
    await proc("reports/portfolio.build")(job(payload, 0, 3));
    expect(mockContainer.build.run).toHaveBeenLastCalledWith({ event: "portfolio.build", portfolioId: pf, buildVersion: 2 }, { retry: false, finalAttempt: false });
    await proc("reports/portfolio.build")(job(payload, 1, 3));
    expect(mockContainer.build.run).toHaveBeenLastCalledWith(expect.anything(), { retry: true, finalAttempt: false });
    await proc("reports/portfolio.build")(job(payload, 2, 3));
    expect(mockContainer.build.run).toHaveBeenLastCalledWith(expect.anything(), { retry: true, finalAttempt: true });
    await proc("reports/portfolio.build")(job(payload, 0, null)); // không khai attempts → lượt duy nhất = lượt cuối
    expect(mockContainer.build.run).toHaveBeenLastCalledWith(expect.anything(), { retry: false, finalAttempt: true });
  });

  it("payload sai hợp đồng → bỏ qua, không dựng", async () => {
    mockContainer.build.run.mockClear();
    await proc("reports/portfolio.build")(job({ portfolioId: "x" }));
    await proc("reports/portfolio.build")(job({ event: "portfolio.build", portfolioId: pf, buildVersion: 0 }));
    expect(mockContainer.build.run).not.toHaveBeenCalled();
  });

  it("lỗi của build được ném lại cho BullMQ (retry/failed set)", async () => {
    mockContainer.build.run.mockRejectedValueOnce(new Error("storage down"));
    await expect(proc("reports/portfolio.build")(job({ event: "portfolio.build", portfolioId: pf, buildVersion: 1 }))).rejects.toThrow("storage down");
  });
});

describe("reports/portfolio.purge-build", () => {
  it("gọi purgeBuild đúng tham số; thiếu tham số → bỏ qua", async () => {
    await proc("reports/portfolio.purge-build")(job({ portfolioId: pf, buildVersion: 4 }));
    expect(mockContainer.events.purgeBuild).toHaveBeenCalledWith(pf, 4);
    mockContainer.events.purgeBuild.mockClear();
    await proc("reports/portfolio.purge-build")(job({ portfolioId: pf }));
    await proc("reports/portfolio.purge-build")(job({}));
    expect(mockContainer.events.purgeBuild).not.toHaveBeenCalled();
  });
});

describe("reports/portfolio.events → sink", () => {
  const published = { event: "portfolio.published", portfolioId: pf, userId: user, slug: "an-dev", url: "https://x/p/an-dev", buildVersion: 1, at };
  const unpublished = { event: "portfolio.unpublished", portfolioId: pf, userId: user, reason: "UNPUBLISH", at };

  it("published/unpublished tới MỌI sink đã đăng ký; lỗi một sink làm job lỗi (retry) nhưng sink còn lại vẫn chạy", async () => {
    const good = jest.fn().mockResolvedValue(undefined);
    const bad = jest.fn().mockRejectedValue(new Error("sink down"));
    registerPortfolioEventSink("p6-08.talent", good);
    registerPortfolioEventSink("khac", bad);
    await expect(proc("reports/portfolio.events")(job(published))).rejects.toThrow("portfolio.events: sink lỗi: khac");
    expect(good).toHaveBeenCalledWith(expect.objectContaining({ event: "portfolio.published", slug: "an-dev" }));
    good.mockClear();
    registerPortfolioEventSink("khac", good);
    await proc("reports/portfolio.events")(job(unpublished));
    expect(good).toHaveBeenCalledWith(expect.objectContaining({ event: "portfolio.unpublished", reason: "UNPUBLISH" }));
  });

  it("payload sai hợp đồng hoặc chưa có sink → không lỗi, không gọi", async () => {
    const sink = jest.fn();
    registerPortfolioEventSink("s", sink);
    await proc("reports/portfolio.events")(job({ event: "portfolio.published", portfolioId: "x" }));
    await proc("reports/portfolio.events")(job({ event: "khac" }));
    expect(sink).not.toHaveBeenCalled();
    clearPortfolioEventSinks();
    await expect(proc("reports/portfolio.events")(job(published))).resolves.toBeUndefined();
  });
});

describe("skill.revoked (p6-06)", () => {
  const revoked = { event: "skill.revoked", userId: user, skillId: skill, code: "reactjs", name: "ReactJS", icon: "x", at };

  it("sink p6-07.portfolio CHỈ xếp job cho skill.revoked, jobId không còn dấu ':'", async () => {
    const sink = mockSinks.get("p6-07.portfolio");
    expect(sink).toBeDefined();
    await sink?.({ ...revoked, event: "skill.unlocked" });
    await sink?.({ ...revoked, event: "skill.restored" });
    expect(mockEnqueued).toHaveLength(0);
    await sink?.(revoked);
    expect(mockEnqueued).toEqual([{ queue: "gamification", job: "portfolio.on-skill-revoked", data: revoked, opts: { jobId: `portfolio.skill-revoked_${user}_${skill}_2026-09-26T03_00_00.000Z` } }]);
  });

  it("processor gọi onSkillRevoked(userId); payload sai → bỏ qua", async () => {
    await proc("gamification/portfolio.on-skill-revoked")(job(revoked));
    expect(mockContainer.events.onSkillRevoked).toHaveBeenCalledWith(user);
    mockContainer.events.onSkillRevoked.mockClear();
    await proc("gamification/portfolio.on-skill-revoked")(job({ event: "skill.revoked", userId: "x" }));
    expect(mockContainer.events.onSkillRevoked).not.toHaveBeenCalled();
  });
});

describe("ẩn danh hoá + cron", () => {
  it("on-user-anonymized: gọi theo userId; thiếu userId → bỏ qua", async () => {
    await proc("notifications/portfolio.on-user-anonymized")(job({ userId: user, schemaVersion: 1 }));
    expect(mockContainer.events.onUserAnonymized).toHaveBeenCalledWith(user);
    mockContainer.events.onUserAnonymized.mockClear();
    await proc("notifications/portfolio.on-user-anonymized")(job({}));
    expect(mockContainer.events.onUserAnonymized).not.toHaveBeenCalled();
  });

  it("cron dọn slug và cron reaper gọi đúng dịch vụ", async () => {
    mockContainer.events.cleanupReservations.mockResolvedValue(2);
    mockContainer.build.reapStale.mockResolvedValue(1);
    await proc("cron/portfolio.slug-reservation-cleanup")(job({}));
    await proc("cron/portfolio.stale-build-reaper")(job({}));
    expect(mockContainer.events.cleanupReservations).toHaveBeenCalledTimes(1);
    expect(mockContainer.build.reapStale).toHaveBeenCalledTimes(1);
  });
});
