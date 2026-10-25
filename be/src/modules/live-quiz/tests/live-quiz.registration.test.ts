const mockContainer = {
  service: { isParticipant: jest.fn(), hostReturned: jest.fn(), runCommand: jest.fn(), persistResults: jest.fn(), expireStale: jest.fn() },
  bus: { setExecutor: jest.fn(), startSubscriber: jest.fn(), dispatch: jest.fn(), stop: jest.fn() },
};
jest.mock("../live-quiz.container", () => ({ getLiveQuizContainer: () => mockContainer }));

const mockRegistered: Array<[string, string, (job: { id?: string; data: unknown }) => Promise<unknown>]> = [];
const mockCrons: Array<Record<string, unknown>> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, name: string, fn: (job: { id?: string; data: unknown }) => Promise<unknown>) => mockRegistered.push([queue, name, fn]),
  defineCron: (def: Record<string, unknown>) => mockCrons.push(def),
}));

import { readFileSync } from "fs";
import { join } from "path";
import { AVAILABLE_MODULES, DEFAULT_FEATURE_FLAGS, MODULES } from "../../../core/constants/modules";
import { logger } from "../../../infrastructure/logger";
import { clearRoomGuards, resolveJoinable } from "../../../infrastructure/socket/socket.rooms";
import { buildCapabilities } from "../../capabilities/capabilities.service";
import { registerLiveQuizModule } from "..";
import "../jobs/persist-results.job";
import "../jobs/expire-stale.job";
import "../jobs/question-deadline.job";
import "../jobs/auto-advance.job";
import "../jobs/host-timeout.job";
import { oid } from "./support/quiz-fakes";

/**
 * Đăng ký module (be.md §1/§9): `AVAILABLE_MODULES`, cờ mặc định TẮT, phụ thuộc `study` lúc khởi động, guard room `quiz`, bộ thực thi lệnh hẹn giờ,
 * và các job/cron của worker (`register-jobs.ts` nạp các file này).
 */
describe("AVAILABLE_MODULES + cờ", () => {
  it("live-quiz có mã (available) nhưng cờ mặc định TẮT — capabilities báo { enabled:false, available:true }", async () => {
    expect(AVAILABLE_MODULES).toContain(MODULES.LIVE_QUIZ);
    expect(DEFAULT_FEATURE_FLAGS[MODULES.LIVE_QUIZ]).toBe(false);
    const cap = await buildCapabilities();
    expect(cap.features["live-quiz"]).toEqual({ enabled: false, available: true });
  });
});

describe("validateRuntime — live-quiz cần study (be.md §9)", () => {
  const ORIGINAL = process.env;
  afterEach(() => {
    process.env = ORIGINAL;
  });
  function messages(flags: string): Array<{ level: string; message: string }> {
    process.env = { ...ORIGINAL, FEATURE_FLAGS: flags };
    jest.resetModules();
    const { validateRuntime } = require("../../../core/config/validate-runtime") as typeof import("../../../core/config/validate-runtime");
    return validateRuntime();
  }

  it("live-quiz=true mà study tắt → LỖI khởi động", () => {
    expect(messages("live-quiz=true")).toContainEqual({ level: "error", message: expect.stringContaining("live-quiz cần bật study") });
  });

  it("bật cả hai, hoặc chỉ study → không có lỗi phụ thuộc", () => {
    for (const flags of ["study=true,live-quiz=true", "study=true", ""]) {
      expect(messages(flags).some((c) => c.level === "error" && c.message.includes("live-quiz cần"))).toBe(false);
    }
  });
});

describe("registerLiveQuizModule", () => {
  beforeEach(() => {
    clearRoomGuards();
    mockContainer.service.isParticipant.mockResolvedValue(true);
    mockContainer.service.hostReturned.mockResolvedValue(undefined);
  });
  afterEach(() => clearRoomGuards());

  it("đặt bộ thực thi lệnh (service.runCommand) và mở subscriber; subscribe:false thì không mở", async () => {
    registerLiveQuizModule({ subscribe: false });
    expect(mockContainer.bus.startSubscriber).not.toHaveBeenCalled();
    registerLiveQuizModule();
    expect(mockContainer.bus.startSubscriber).toHaveBeenCalledTimes(1);
    const executor = mockContainer.bus.setExecutor.mock.calls[0][0] as (cmd: unknown) => Promise<void>;
    await executor({ type: "close", sessionId: oid(1), index: 0 });
    expect(mockContainer.service.runCommand).toHaveBeenCalledWith({ type: "close", sessionId: oid(1), index: 0 });
  });

  it("guard room `quiz`: người tham gia → được join (và host được đánh dấu quay lại); người ngoài/lỗi → PERM_404 (đóng); hostReturned lỗi không chặn join", async () => {
    registerLiveQuizModule({ subscribe: false });
    const user = { id: oid(1), email: "a@e.com", role: "user" } as never;
    expect(await resolveJoinable(user, "quiz", oid(9))).toEqual({ room: `quiz:${oid(9)}` });
    expect(mockContainer.service.hostReturned).toHaveBeenCalledWith(oid(1), oid(9));
    mockContainer.service.hostReturned.mockRejectedValue(new Error("Redis chậm"));
    expect(await resolveJoinable(user, "quiz", oid(9))).toEqual({ room: `quiz:${oid(9)}` });
    mockContainer.service.isParticipant.mockResolvedValue(false);
    expect(await resolveJoinable(user, "quiz", oid(9))).toEqual({ room: null, code: "PERM_404" });
    mockContainer.service.isParticipant.mockRejectedValue(new Error("Redis down"));
    expect(await resolveJoinable(user, "quiz", oid(9))).toEqual({ room: null, code: "PERM_404" });
  });
});

describe("job/cron của worker", () => {
  const run = (queue: string, name: string, data: unknown) => {
    const found = mockRegistered.find(([q, n]) => q === queue && n === name);
    if (!found) throw new Error(`Chưa đăng ký ${queue}/${name}`);
    return found[2]({ id: "j", data });
  };

  it("đăng ký đủ 5 processor đúng queue/tên (be.md §7) và MỘT cron TĨNH mỗi 15 phút (không scheduler theo phiên)", () => {
    expect(mockRegistered.map(([q, n]) => `${q}/${n}`).sort()).toEqual(
      ["cron/live-quiz.expire-stale", "reports/live-quiz.persist", "reports/quiz.auto-advance", "reports/quiz.host-timeout", "reports/quiz.question-deadline"].sort()
    );
    expect(mockCrons).toEqual([expect.objectContaining({ schedulerId: "live-quiz.expire-stale", queue: "cron", jobName: "live-quiz.expire-stale", pattern: "*/15 * * * *" })]);
  });

  it("register-jobs.ts nạp đủ file job — worker riêng (không import router.ts) chỉ chạy job nằm trong danh sách này", () => {
    const source = readFileSync(join(__dirname, "../../../infrastructure/queue/register-jobs.ts"), "utf8");
    for (const file of ["persist-results", "expire-stale", "question-deadline", "auto-advance", "host-timeout"]) {
      expect(source).toContain(`modules/live-quiz/jobs/${file}.job`);
    }
  });

  it("live-quiz.persist: payload hợp lệ → persistResults; payload rác → bỏ qua; -1 (Redis đã mất) → log lỗi để điều tra", async () => {
    mockContainer.service.persistResults.mockResolvedValue(3);
    await run("reports", "live-quiz.persist", { sessionId: oid(7) });
    expect(mockContainer.service.persistResults).toHaveBeenCalledWith(oid(7));
    mockContainer.service.persistResults.mockClear();
    await run("reports", "live-quiz.persist", { sessionId: "x" });
    expect(mockContainer.service.persistResults).not.toHaveBeenCalled();
    mockContainer.service.persistResults.mockResolvedValue(-1);
    await run("reports", "live-quiz.persist", { sessionId: oid(7) });
    expect(logger.error).toHaveBeenCalled();
  });

  it("live-quiz.expire-stale: gọi service.expireStale", async () => {
    mockContainer.service.expireStale.mockResolvedValue(2);
    await run("cron", "live-quiz.expire-stale", {});
    expect(mockContainer.service.expireStale).toHaveBeenCalledTimes(1);
  });

  it("ba job hẹn giờ chỉ đánh thức bus (dispatch), không chạm service trực tiếp — worker không có getIO()", async () => {
    mockContainer.bus.dispatch.mockResolvedValue(undefined);
    await run("reports", "quiz.question-deadline", { type: "close", sessionId: oid(7), index: 1 });
    await run("reports", "quiz.auto-advance", { type: "advance", sessionId: oid(7), index: 1 });
    await run("reports", "quiz.host-timeout", { type: "host-timeout", sessionId: oid(7), lastSeenMs: 5 });
    expect(mockContainer.bus.dispatch.mock.calls.map(([c]) => (c as { type: string }).type)).toEqual(["close", "advance", "host-timeout"]);
    expect(mockContainer.service.runCommand).not.toHaveBeenCalled();
  });
});
