const mockEnqueue = jest.fn();
const mockCancelJob = jest.fn();
jest.mock("../../../infrastructure/queue", () => ({
  enqueue: (...a: unknown[]) => mockEnqueue(...a),
  cancelJob: (...a: unknown[]) => mockCancelJob(...a),
  toSafeJobId: (id: string) => id.replace(/:/g, "_"),
}));

const mockGetClient = jest.fn();
jest.mock("../../../infrastructure/redis", () => ({ redis: { getClient: () => mockGetClient() } }));

const mockDispatch = jest.fn();
jest.mock("../live-quiz.container", () => ({ getLiveQuizContainer: () => ({ bus: { dispatch: (c: unknown) => mockDispatch(c) } }) }));

import { COMMAND_CHANNEL, QuizCommandBus, jobIdOf } from "../realtime/live-quiz.command-bus";
import type { QuizCommand } from "../entities/live-quiz.commands";
import { quizCommandProcessor } from "../jobs/quiz-command.processor";
import { oid } from "./support/quiz-fakes";

/**
 * Bus lệnh hẹn giờ (be.md §7): jobId an toàn (không `:`), timer trong tiến trình + job bền, worker thuần đánh thức API qua pub/sub
 * (worker không có `getIO()`), subscriber nhận lệnh, processor job chỉ `dispatch`.
 */
const SID = oid(0xabc);
const close: QuizCommand = { type: "close", sessionId: SID, index: 2 };
const advance: QuizCommand = { type: "advance", sessionId: SID, index: 2 };
const hostTimeout: QuizCommand = { type: "host-timeout", sessionId: SID, lastSeenMs: 1_700_000_000_123 };

beforeEach(() => {
  jest.useFakeTimers();
  mockEnqueue.mockResolvedValue(undefined);
  mockCancelJob.mockResolvedValue(undefined);
});
afterEach(() => {
  jest.useRealTimers();
});

describe("jobIdOf", () => {
  it("theo be.md §7 rồi qua toSafeJobId: KHÔNG có dấu ':' (BullMQ từ chối id tự đặt có ≥ 3 dấu ':')", () => {
    expect(jobIdOf(close)).toBe(`quiz.question-deadline_quiz_${SID}_2`);
    expect(jobIdOf(advance)).toBe(`quiz.auto-advance_quiz_${SID}_2`);
    expect(jobIdOf(hostTimeout)).toBe(`quiz.host-timeout_quiz_${SID}_1700000000123`);
    for (const c of [close, advance, hostTimeout]) expect(jobIdOf(c)).not.toContain(":");
  });

  it("mỗi (phiên, câu) / (phiên, lần rời) một id riêng — không đè nhau", () => {
    expect(jobIdOf({ ...close, index: 3 })).not.toBe(jobIdOf(close));
    expect(jobIdOf({ ...hostTimeout, lastSeenMs: 5 })).not.toBe(jobIdOf(hostTimeout));
  });
});

describe("schedule / cancel", () => {
  it("API (có executor): timer tại chỗ chạy đúng hạn + job bền cùng jobId/độ trễ (3 lần thử; host-timeout 1 lần)", async () => {
    const bus = new QuizCommandBus();
    const executor = jest.fn().mockResolvedValue(undefined);
    bus.setExecutor(executor);
    await bus.schedule(close, 20_300);
    await bus.schedule(hostTimeout, 30_000);
    expect(mockEnqueue).toHaveBeenNthCalledWith(1, "reports", "quiz.question-deadline", close, { jobId: jobIdOf(close), delay: 20_300, attempts: 3 });
    expect(mockEnqueue).toHaveBeenNthCalledWith(2, "reports", "quiz.host-timeout", hostTimeout, { jobId: jobIdOf(hostTimeout), delay: 30_000, attempts: 1 });
    await jest.advanceTimersByTimeAsync(20_299);
    expect(executor).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(close);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(executor).toHaveBeenLastCalledWith(hostTimeout);
    await bus.stop();
  });

  it("worker thuần (không executor): chỉ xếp job bền, không có timer", async () => {
    const bus = new QuizCommandBus();
    await bus.schedule(close, 1_000);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("lên lịch lại cùng lệnh thay timer cũ (không chạy hai lần)", async () => {
    const bus = new QuizCommandBus();
    const executor = jest.fn().mockResolvedValue(undefined);
    bus.setExecutor(executor);
    await bus.schedule(close, 1_000);
    await bus.schedule(close, 5_000);
    await jest.advanceTimersByTimeAsync(6_000);
    expect(executor).toHaveBeenCalledTimes(1);
    await bus.stop();
  });

  it("cancel: xoá timer và huỷ ĐÚNG job (cùng jobId); job đã chạy/không có → vô hại", async () => {
    const bus = new QuizCommandBus();
    const executor = jest.fn().mockResolvedValue(undefined);
    bus.setExecutor(executor);
    await bus.schedule(hostTimeout, 30_000);
    mockCancelJob.mockRejectedValueOnce(new Error("Redis chậm"));
    await expect(bus.cancel(hostTimeout)).resolves.toBeUndefined();
    expect(mockCancelJob).toHaveBeenCalledWith("reports", jobIdOf(hostTimeout));
    await jest.advanceTimersByTimeAsync(31_000);
    expect(executor).not.toHaveBeenCalled();
  });

  it("không xếp được job (Redis lỗi) → không ném, timer trong tiến trình vẫn chạy", async () => {
    const bus = new QuizCommandBus();
    const executor = jest.fn().mockResolvedValue(undefined);
    bus.setExecutor(executor);
    mockEnqueue.mockRejectedValueOnce(new Error("Redis down"));
    await expect(bus.schedule(advance, 500)).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(500);
    expect(executor).toHaveBeenCalledWith(advance);
    await bus.stop();
  });

  it("executor ném lỗi trong timer → chỉ log, không làm sập tiến trình", async () => {
    const bus = new QuizCommandBus();
    bus.setExecutor(jest.fn().mockRejectedValue(new Error("Mongo down")));
    await bus.schedule(close, 10);
    await expect(jest.advanceTimersByTimeAsync(20)).resolves.toBeUndefined();
    await bus.stop();
  });
});

describe("dispatch", () => {
  it("tiến trình có executor (API/all): chạy tại chỗ, lỗi được ném lại cho BullMQ retry", async () => {
    const bus = new QuizCommandBus();
    const executor = jest.fn().mockRejectedValue(new Error("Mongo down"));
    bus.setExecutor(executor);
    await expect(bus.dispatch(close)).rejects.toThrow("Mongo down");
    expect(executor).toHaveBeenCalledWith(close);
  });

  it("worker thuần: publish lệnh JSON lên kênh cho tiến trình API (nơi có Socket.IO)", async () => {
    const publish = jest.fn().mockResolvedValue(1);
    mockGetClient.mockReturnValue({ isReady: true, publish });
    await new QuizCommandBus().dispatch(advance);
    expect(publish).toHaveBeenCalledWith(COMMAND_CHANNEL, JSON.stringify(advance));
  });

  it("worker thuần mà Redis chưa sẵn sàng → ném lỗi (job retry) thay vì nuốt mất lệnh", async () => {
    mockGetClient.mockReturnValue({ isReady: false });
    await expect(new QuizCommandBus().dispatch(advance)).rejects.toThrow("Redis không khả dụng");
    mockGetClient.mockReturnValue(null);
    await expect(new QuizCommandBus().dispatch(advance)).rejects.toThrow("Redis không khả dụng");
  });
});

describe("startSubscriber", () => {
  it("chờ client Redis chính sẵn sàng (không tự connect), rồi subscribe; nhận lệnh hợp lệ → executor; rác/schema sai → bỏ qua", async () => {
    let onMessage: ((m: string) => void) | undefined;
    const sub = { on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined), subscribe: jest.fn((_c: string, cb: (m: string) => void) => (onMessage = cb, Promise.resolve())), disconnect: jest.fn().mockResolvedValue(undefined) };
    const base = { isReady: false, duplicate: () => sub };
    mockGetClient.mockReturnValue(base);
    const bus = new QuizCommandBus();
    const executor = jest.fn().mockResolvedValue(undefined);
    bus.setExecutor(executor);
    expect(bus.isSubscribed()).toBe(false);
    bus.startSubscriber();
    bus.startSubscriber(); // gọi lặp: chỉ một subscriber
    await jest.advanceTimersByTimeAsync(0);
    expect(sub.subscribe).not.toHaveBeenCalled();
    expect(bus.isSubscribed()).toBe(false);
    base.isReady = true;
    await jest.advanceTimersByTimeAsync(1_000);
    expect(sub.subscribe).toHaveBeenCalledTimes(1);
    expect(sub.subscribe.mock.calls[0][0]).toBe(COMMAND_CHANNEL);
    expect(bus.isSubscribed()).toBe(true);

    onMessage?.(JSON.stringify(close));
    onMessage?.("không phải json");
    onMessage?.(JSON.stringify({ type: "close", sessionId: "không-phải-objectid", index: 1 }));
    onMessage?.(JSON.stringify({ type: "lạ", sessionId: SID }));
    await jest.advanceTimersByTimeAsync(0);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(close);
    await bus.stop();
    expect(sub.disconnect).toHaveBeenCalled();
    expect(bus.isSubscribed()).toBe(false);
  });

  const makeSub = () => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  });

  it("SUBSCRIBE lỗi → đóng client dở dang rồi thử lại sau 5 s bằng client MỚI (không tích luỹ client zombie)", async () => {
    const first = makeSub();
    first.subscribe.mockRejectedValueOnce(new Error("NOAUTH"));
    const second = makeSub();
    const subs = [first, second];
    mockGetClient.mockReturnValue({ isReady: true, duplicate: () => subs.shift() });
    const bus = new QuizCommandBus();
    bus.startSubscriber();
    await jest.advanceTimersByTimeAsync(0);
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    expect(bus.isSubscribed()).toBe(false);
    await jest.advanceTimersByTimeAsync(4_999);
    expect(second.connect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(second.subscribe).toHaveBeenCalledTimes(1);
    expect(bus.isSubscribed()).toBe(true);
    await bus.stop();
    expect(second.disconnect).toHaveBeenCalledTimes(1);
  });

  it("stop() trong lúc đang nối → client nối muộn bị đóng ngay, không bao giờ SUBSCRIBE; stop() huỷ luôn lượt thử lại đang chờ", async () => {
    let finishConnect: () => void = () => undefined;
    const late = makeSub();
    late.connect.mockReturnValue(new Promise<void>((resolve) => (finishConnect = resolve)));
    mockGetClient.mockReturnValue({ isReady: true, duplicate: () => late });
    const bus = new QuizCommandBus();
    bus.startSubscriber();
    await jest.advanceTimersByTimeAsync(0);
    await bus.stop(); // xảy ra khi connect() còn treo
    finishConnect();
    await jest.advanceTimersByTimeAsync(0);
    expect(late.subscribe).not.toHaveBeenCalled();
    expect(late.disconnect).toHaveBeenCalled();
    expect(bus.isSubscribed()).toBe(false);

    // Redis chưa sẵn sàng → có lượt thử lại chờ; stop() phải xoá nó, sau đó không còn cố nối nữa.
    const idle = { isReady: false, duplicate: jest.fn() };
    mockGetClient.mockReturnValue(idle);
    const bus2 = new QuizCommandBus();
    bus2.startSubscriber();
    await jest.advanceTimersByTimeAsync(0);
    await bus2.stop();
    idle.isReady = true;
    await jest.advanceTimersByTimeAsync(10_000);
    expect(idle.duplicate).not.toHaveBeenCalled();
  });
});

describe("quizCommandProcessor (job → dispatch)", () => {
  it("payload hợp lệ đúng loại → dispatch; sai loại/rác → bỏ qua (không ném)", async () => {
    mockDispatch.mockResolvedValue(undefined);
    await quizCommandProcessor("close")({ id: "j1", data: close } as never);
    expect(mockDispatch).toHaveBeenCalledWith(close);
    mockDispatch.mockClear();
    await quizCommandProcessor("close")({ id: "j2", data: advance } as never);
    await quizCommandProcessor("advance")({ id: "j3", data: { type: "advance", sessionId: "x" } } as never);
    await quizCommandProcessor("host-timeout")({ id: "j4", data: null } as never);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("dispatch lỗi (Redis không publish được) → ném lại để BullMQ thử lại", async () => {
    mockDispatch.mockRejectedValue(new Error("Redis không khả dụng"));
    await expect(quizCommandProcessor("host-timeout")({ id: "j5", data: hostTimeout } as never)).rejects.toThrow("Redis");
  });
});
