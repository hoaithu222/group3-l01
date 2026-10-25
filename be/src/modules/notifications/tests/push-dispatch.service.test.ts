import { PushDispatchService, pendingKeys, safeJobId, type DispatchIo, type PendingInfo } from "../services/push-dispatch.service";
import type { PushTarget } from "../entities/message-notification.types";

/** Redis + queue giả có TTL theo đồng hồ giả — đủ để kiểm cửa sổ gộp 10 s (NT-08) mà không cần Redis/BullMQ thật. */
function makeFakeIo(clock: { now: number }, opts: { open?: boolean } = {}) {
  const store = new Map<string, { value: unknown; expiresAt: number | null }>();
  const jobs: { name: string; data: Record<string, unknown>; jobId: string; delay?: number }[] = [];
  const alive = (key: string): boolean => {
    const e = store.get(key);
    if (!e) return false;
    if (e.expiresAt !== null && e.expiresAt <= clock.now) {
      store.delete(key);
      return false;
    }
    return true;
  };
  const io: DispatchIo = {
    isRedisOpen: () => opts.open ?? true,
    setNx: (key, value, ttl) => {
      if (alive(key)) return Promise.resolve(false);
      store.set(key, { value, expiresAt: clock.now + ttl * 1000 });
      return Promise.resolve(true);
    },
    get: <T>(key: string) => Promise.resolve(alive(key) ? ((store.get(key) as { value: unknown }).value as T) : null),
    set: (key, value, ttl) => {
      store.set(key, { value, expiresAt: clock.now + ttl * 1000 });
      return Promise.resolve();
    },
    incr: (key) => {
      const next = (alive(key) ? (store.get(key)!.value as number) : 0) + 1;
      store.set(key, { value: next, expiresAt: store.get(key)?.expiresAt ?? null });
      return Promise.resolve(next);
    },
    expire: (key, ttl) => {
      const e = store.get(key);
      if (e) e.expiresAt = clock.now + ttl * 1000;
      return Promise.resolve();
    },
    enqueue: (name, data, o) => {
      jobs.push({ name, data: data as Record<string, unknown>, jobId: o.jobId, delay: o.delay });
      return Promise.resolve();
    },
  };
  return { io, jobs, store };
}

const B = "64b0000000000000000000b1";
const A = "64b0000000000000000000a1";
const CONV = "64b0000000000000000000c1";
const KEY = `CONVERSATION:${CONV}`;

function target(i: number, over: Partial<PushTarget> = {}): PushTarget {
  return {
    userId: B,
    messageId: `64b00000000000000000010${i}`,
    scopeType: "CONVERSATION",
    scopeId: CONV,
    threadId: null,
    scopeKey: KEY,
    reason: "MESSAGE",
    seq: i,
    authorId: A,
    ...over,
  };
}

describe("PushDispatchService — cửa sổ gộp 10 s (NT-08)", () => {
  it("A gửi B 5 tin trong 6 giây: tin đầu push NGAY + đúng 1 job push.send-coalesced cuối cửa sổ", async () => {
    const clock = { now: 1_000_000 };
    const { io, jobs, store } = makeFakeIo(clock);
    const svc = new PushDispatchService(io, 10, () => clock.now);

    const results: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      results.push(await svc.enqueueOne(target(i)));
      clock.now += 1_500; // 5 tin trong 6 s
    }

    expect(results).toEqual(["immediate", "coalesced", "coalesced", "coalesced", "coalesced"]);

    const sendNow = jobs.filter((j) => j.name === "push.send");
    expect(sendNow).toHaveLength(1);
    expect(sendNow[0]?.data).toMatchObject({ kind: "message", messageId: target(1).messageId, userId: B });
    expect(sendNow[0]?.jobId).toBe(safeJobId(`push.send:message:${target(1).messageId}:user:${B}`));

    const coalesced = jobs.filter((j) => j.name === "push.send-coalesced");
    // Cùng jobId cho mọi tin trong cửa sổ → BullMQ tạo một lần (ở đây fake ghi 4 lần cùng id).
    expect(new Set(coalesced.map((j) => j.jobId)).size).toBe(1);
    expect(coalesced[0]?.jobId).not.toContain(":"); // BullMQ cấm ":" (chỉ cho phép đúng 2)
    expect(coalesced[0]?.delay).toBeGreaterThan(0);
    expect(coalesced[0]?.data).toMatchObject({ kind: "message-coalesced", userId: B, scopeKey: KEY });

    const keys = pendingKeys(B, KEY);
    expect(store.get(keys.count)?.value).toBe(4); // "4 tin nhắn mới"
    expect((store.get(keys.last)?.value as PendingInfo).messageId).toBe(target(5).messageId);
  });

  it("delay job gộp = phần còn lại của cửa sổ (windowStart + 10 s − now)", async () => {
    const clock = { now: 5_000_000 };
    const { io, jobs } = makeFakeIo(clock);
    const svc = new PushDispatchService(io, 10, () => clock.now);
    await svc.enqueueOne(target(1));
    clock.now += 3_000;
    await svc.enqueueOne(target(2));
    const coalesced = jobs.find((j) => j.name === "push.send-coalesced");
    expect(coalesced?.delay).toBe(7_000);
  });

  it("hết cửa sổ 10 s: tin mới mở cửa sổ mới → gửi NGAY lần nữa", async () => {
    const clock = { now: 1_000_000 };
    const { io, jobs } = makeFakeIo(clock);
    const svc = new PushDispatchService(io, 10, () => clock.now);

    expect(await svc.enqueueOne(target(1))).toBe("immediate");
    clock.now += 11_000;
    expect(await svc.enqueueOne(target(2))).toBe("immediate");
    expect(jobs.filter((j) => j.name === "push.send")).toHaveLength(2);
  });

  it("cửa sổ tách theo (người nhận, scope): scope khác → mở cửa sổ riêng", async () => {
    const clock = { now: 1_000_000 };
    const { io, jobs } = makeFakeIo(clock);
    const svc = new PushDispatchService(io, 10, () => clock.now);

    await svc.enqueueOne(target(1));
    const other = await svc.enqueueOne(target(2, { scopeId: "64b0000000000000000000c2", scopeKey: "CONVERSATION:64b0000000000000000000c2" }));
    expect(other).toBe("immediate");
    expect(jobs.filter((j) => j.name === "push.send")).toHaveLength(2);
  });

  it("idempotent theo (messageId, userId): fan-out chạy lại không tạo push/đếm trùng", async () => {
    const clock = { now: 1_000_000 };
    const { io, jobs, store } = makeFakeIo(clock);
    const svc = new PushDispatchService(io, 10, () => clock.now);

    await svc.enqueueOne(target(1));
    expect(await svc.enqueueOne(target(1))).toBe("duplicate");
    expect(jobs).toHaveLength(1);
    expect(store.get(pendingKeys(B, KEY).count)).toBeUndefined();
  });

  it("gộp giữ lý do cao nhất trong cửa sổ (MENTION > MESSAGE)", async () => {
    const clock = { now: 1_000_000 };
    const { io, store } = makeFakeIo(clock);
    const svc = new PushDispatchService(io, 10, () => clock.now);

    await svc.enqueueOne(target(1));
    await svc.enqueueOne(target(2, { reason: "MENTION" }));
    await svc.enqueueOne(target(3, { reason: "MESSAGE" }));
    expect((store.get(pendingKeys(B, KEY).last)?.value as PendingInfo).reason).toBe("MENTION");
  });

  it("Redis không khả dụng → gửi ngay (fail-open), không gộp", async () => {
    const clock = { now: 1_000_000 };
    const { io, jobs } = makeFakeIo(clock, { open: false });
    const svc = new PushDispatchService(io, 10, () => clock.now);
    expect(await svc.enqueueOne(target(1))).toBe("immediate");
    expect(await svc.enqueueOne(target(2))).toBe("immediate");
    expect(jobs.filter((j) => j.name === "push.send")).toHaveLength(2);
  });

  it("enqueueMany: 1 người lỗi không kéo cả lô", async () => {
    const clock = { now: 1_000_000 };
    const { io, jobs } = makeFakeIo(clock);
    const failing: DispatchIo = {
      ...io,
      enqueue: (name, data, o) => {
        if ((data as { userId?: string }).userId === "x") return Promise.reject(new Error("queue down"));
        return io.enqueue(name, data, o);
      },
    };
    const svc = new PushDispatchService(failing, 10, () => clock.now);
    await svc.enqueueMany([target(1, { userId: "x" }), target(2, { userId: B })]);
    expect(jobs.filter((j) => j.name === "push.send")).toHaveLength(1);
  });
});

describe("safeJobId", () => {
  it("đổi mọi ':' thành '_' (BullMQ chỉ chấp nhận 0 hoặc đúng 2 dấu ':')", () => {
    expect(safeJobId("push.send:message:m1:user:u1")).toBe("push.send_message_m1_user_u1");
  });
});
