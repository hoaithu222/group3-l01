import { Job } from "bullmq";
import { enqueue, getQueue } from "../../../infrastructure/queue";
import {
  BullLiveKitEventQueue,
  LIVEKIT_ENQUEUE_TIMEOUT_MS,
  LIVEKIT_EVENT_ATTEMPTS,
  livekitEventJobId,
} from "../livekit-event.queue";

jest.mock("../../../infrastructure/queue", () => {
  const actual = jest.requireActual<typeof import("../../../infrastructure/queue")>("../../../infrastructure/queue");
  return { toSafeJobId: actual.toSafeJobId, enqueue: jest.fn(), getQueue: jest.fn() };
});

const mockEnqueue = enqueue as jest.Mock;
const mockGetQueue = getQueue as jest.Mock;

/** Chạy đúng kiểm tra jobId của BullMQ (`Job.validateOptions`) — không cần Redis. */
function bullAcceptsJobId(jobId: string): true | string {
  const fakeQueue = { opts: {}, toKey: (k: string) => k, name: "calls", keys: {}, qualifiedName: "bull:calls" };
  try {
    const job = new Job(fakeQueue as never, "livekit.event", {}, { jobId });
    (job as unknown as { validateOptions: (d: { data: string }) => void }).validateOptions({ data: "{}" });
    return true;
  } catch (err) {
    return (err as Error).message;
  }
}

describe("livekitEventJobId — bẫy dedupeKey/jobId có dấu ':'", () => {
  it("không chứa ':' và BullMQ chấp nhận; dạng ngây thơ `livekit.event:<id>` (1 dấu ':') bị BullMQ từ chối", () => {
    expect(bullAcceptsJobId("livekit.event:EV_abc")).toBe("Custom Id cannot contain :");
    const id = livekitEventJobId("EV_abc");
    expect(id).toBe("livekit.event_EV_abc");
    expect(id).not.toContain(":");
    expect(bullAcceptsJobId(id)).toBe(true);
  });

  it("tất định theo event.id (sweep/enqueue lặp cùng jobId → BullMQ dedupe)", () => {
    expect(livekitEventJobId("EV_1")).toBe(livekitEventJobId("EV_1"));
    expect(livekitEventJobId("EV_1")).not.toBe(livekitEventJobId("EV_2"));
  });
});

describe("BullLiveKitEventQueue", () => {
  const queue = new BullLiveKitEventQueue();

  it("enqueue: queue `calls`, job `livekit.event`, retry 5 × backoff mũ 2 s, jobId an toàn", async () => {
    mockEnqueue.mockResolvedValue(undefined);
    await expect(queue.enqueue("we_1", "EV_abc")).resolves.toBe(true);
    expect(mockEnqueue).toHaveBeenCalledWith(
      "calls",
      "livekit.event",
      { webhookEventId: "we_1" },
      { jobId: "livekit.event_EV_abc", attempts: LIVEKIT_EVENT_ATTEMPTS, backoff: { type: "exponential", delay: 2000 } }
    );
    expect(LIVEKIT_EVENT_ATTEMPTS).toBe(5);
  });

  it("enqueue lỗi → trả false, KHÔNG ném (webhook vẫn 200, sweep đẩy lại)", async () => {
    mockEnqueue.mockRejectedValue(new Error("Redis down"));
    await expect(queue.enqueue("we_1", "EV_abc")).resolves.toBe(false);
  });

  it("enqueue treo (ioredis maxRetriesPerRequest=null khi Redis mất) → hết hạn sau 2 s, trả false thay vì treo request", async () => {
    mockEnqueue.mockReturnValue(new Promise(() => undefined));
    jest.useFakeTimers();
    try {
      const pending = queue.enqueue("we_1", "EV_abc");
      await jest.advanceTimersByTimeAsync(LIVEKIT_ENQUEUE_TIMEOUT_MS + 1);
      await expect(pending).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("requeue: job cũ đã completed/failed bị xoá rồi thêm lại (BullMQ bỏ qua add trùng id còn lưu)", async () => {
    for (const state of ["completed", "failed"]) {
      const remove = jest.fn().mockResolvedValue(undefined);
      mockGetQueue.mockReturnValue({ getJob: jest.fn().mockResolvedValue({ getState: () => Promise.resolve(state), remove }) });
      mockEnqueue.mockResolvedValue(undefined);
      await expect(queue.requeue("we_1", "EV_abc")).resolves.toBe(true);
      expect(remove).toHaveBeenCalledTimes(1);
    }
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("requeue: job còn waiting/active/delayed thì KHÔNG xoá (không xử lý trùng); không có job → chỉ thêm", async () => {
    const remove = jest.fn();
    mockGetQueue.mockReturnValue({ getJob: jest.fn().mockResolvedValue({ getState: () => Promise.resolve("active"), remove }) });
    mockEnqueue.mockResolvedValue(undefined);
    await queue.requeue("we_1", "EV_abc");
    expect(remove).not.toHaveBeenCalled();
    mockGetQueue.mockReturnValue({ getJob: jest.fn().mockResolvedValue(undefined) });
    await expect(queue.requeue("we_1", "EV_abc")).resolves.toBe(true);
  });

  it("requeue: Redis lỗi → false, không ném", async () => {
    mockGetQueue.mockReturnValue({ getJob: jest.fn().mockRejectedValue(new Error("Redis down")) });
    await expect(queue.requeue("we_1", "EV_abc")).resolves.toBe(false);
  });
});
