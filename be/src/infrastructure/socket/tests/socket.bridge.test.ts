/**
 * Cầu nối worker → socket (`socket.bridge.ts`): `@socket.io/redis-emitter` THẬT + publisher Redis GIẢ.
 *
 * `notepack.io` (bộ mã hoá msgpack của emitter) bị thay bằng bộ mã hoá đồng nhất để test đọc được gói LOGIC `[uid, packet, opts]` mà emitter
 * ghi lên Redis; định dạng byte thật được kiểm ở `integration/socket.bridge.redis.test.ts` (adapter THẬT giải mã, cần Redis).
 *
 * Trọng tâm: cầu nối KHÔNG BAO GIỜ ném/treo lời gọi emit của job worker khi Redis lỗi/chậm (bài học `outboxSignal`).
 */
jest.mock("notepack.io", () => ({ encode: (value: unknown) => value, decode: (value: unknown) => value }));
jest.mock("../../../core/config", () => ({ env: { SOCKET_ADAPTER: "redis" } }));

import { logger } from "../../logger";
import {
  BRIDGE_RECHECK_EVENT,
  SOCKET_IO_REDIS_KEY,
  closeSocketBridge,
  getSocketBridge,
  initSocketBridge,
  setSocketBridgeForTests,
  type BridgePublisher,
  type SocketBridge,
} from "../socket.bridge";

type PublishFn = jest.Mock<Promise<number>, [string, unknown]>;

interface Harness {
  bridge: SocketBridge;
  publish: PublishFn;
  ready: { value: boolean };
}

function setup(options: { timeoutMs?: number; maxInflight?: number; closeTimeoutMs?: number; receivers?: number } = {}): Harness {
  const { receivers, ...bridgeOptions } = options;
  const ready = { value: true };
  const publish: PublishFn = jest.fn<Promise<number>, [string, unknown]>();
  publish.mockResolvedValue(receivers ?? 2);
  const publisher: BridgePublisher = {
    isReady: () => ready.value,
    publish: (channel, message) => publish(channel, message),
  };
  const bridge = initSocketBridge({ publisher, ...bridgeOptions });
  return { bridge, publish, ready };
}

/** Cho các microtask (`.then` của lệnh PUBLISH) chạy xong. */
const flush = async (times = 5): Promise<void> => {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
};

const published = (h: Harness, index = 0): { channel: string; message: unknown } => {
  const call = h.publish.mock.calls[index];
  if (!call) throw new Error(`Chưa có lệnh PUBLISH thứ ${index}`);
  return { channel: call[0], message: call[1] };
};

beforeEach(() => {
  setSocketBridgeForTests(null);
});

afterEach(() => {
  jest.useRealTimers();
  setSocketBridgeForTests(null);
});

describe("socket.bridge — gói ghi lên Redis đúng giao thức adapter", () => {
  it("emit tới MỘT room → kênh `socket.io#/#<room>#`, gói EVENT có room/except đúng", () => {
    const h = setup();
    h.bridge.broadcaster.to("user:u1").emit("call:ended", { v: 1, callId: "c1" });

    expect(h.publish).toHaveBeenCalledTimes(1);
    const { channel, message } = published(h);
    expect(channel).toBe("socket.io#/#user:u1#");
    expect(message).toEqual([
      "emitter", // uid ≠ uid mọi adapter ⇒ MỖI instance API xử lý, không instance nào bỏ qua "gói của chính mình"
      { type: 2, data: ["call:ended", { v: 1, callId: "c1" }], nsp: "/" },
      { rooms: ["user:u1"], flags: {}, except: [] },
    ]);
  });

  it("emit tới NHIỀU room (emitToUsers) → kênh gốc `socket.io#/#` (adapter lọc phòng phía nhận)", () => {
    const h = setup();
    h.bridge.broadcaster.to(["user:u1", "user:u2"]).emit("e", { a: 1 });

    const { channel, message } = published(h);
    expect(channel).toBe("socket.io#/#");
    expect(message).toMatchObject([ "emitter", { data: ["e", { a: 1 }] }, { rooms: ["user:u1", "user:u2"], except: [] }]);
  });

  it("except() (exceptUserIds) được mang theo trong gói", () => {
    const h = setup();
    h.bridge.broadcaster.to("ws:w1").except(["user:blocked"]).emit("presence:updated", { userId: "u9" });

    expect(published(h).message).toMatchObject(["emitter", { data: ["presence:updated", { userId: "u9" }] }, { rooms: ["ws:w1"], except: ["user:blocked"] }]);
  });

  it("emit toàn cục (emitToAll) → không room, kênh gốc", () => {
    const h = setup();
    h.bridge.broadcaster.emit("config:updated", { keys: [] });

    const { channel, message } = published(h);
    expect(channel).toBe("socket.io#/#");
    expect(message).toMatchObject(["emitter", { data: ["config:updated", { keys: [] }] }, { rooms: [], except: [] }]);
  });

  it("socketsLeave/socketsJoin/disconnectSockets → kênh request JSON (REMOTE_LEAVE=3, REMOTE_JOIN=2, REMOTE_DISCONNECT=4)", () => {
    const h = setup();
    h.bridge.broadcaster.in(["user:u1"]).socketsLeave(["ch:c1", "ch:c2"]);
    h.bridge.broadcaster.in(["user:u1"]).socketsJoin("ws:w1");
    h.bridge.broadcaster.in("user:u2").disconnectSockets(true);

    const requests = [0, 1, 2].map((i) => {
      const { channel, message } = published(h, i);
      expect(channel).toBe("socket.io-request#/#");
      return JSON.parse(message as string) as Record<string, unknown>;
    });
    expect(requests[0]).toEqual({ type: 3, opts: { rooms: ["user:u1"], except: [] }, rooms: ["ch:c1", "ch:c2"] });
    expect(requests[1]).toEqual({ type: 2, opts: { rooms: ["user:u1"], except: [] }, rooms: ["ws:w1"] });
    expect(requests[2]).toEqual({ type: 4, opts: { rooms: ["user:u2"], except: [] }, close: true });
  });

  it("serverSideEmit (lệnh recheck) → kênh request, uid `emitter`, data = [event, payload]", () => {
    const h = setup();
    h.bridge.serverSideEmit(BRIDGE_RECHECK_EVENT, { room: "ch:c1", event: "e" });

    const { channel, message } = published(h);
    expect(channel).toBe("socket.io-request#/#");
    expect(JSON.parse(message as string)).toEqual({ uid: "emitter", type: 6, data: [BRIDGE_RECHECK_EVENT, { room: "ch:c1", event: "e" }] });
  });

  it("dùng đúng khoá kênh chung với adapter (SOCKET_IO_REDIS_KEY) — đổi key phải đổi CẢ hai phía", () => {
    expect(SOCKET_IO_REDIS_KEY).toBe("socket.io");
    const h = setup();
    h.bridge.broadcaster.to("r").emit("e", {});
    expect(published(h).channel.startsWith(`${SOCKET_IO_REDIS_KEY}#`)).toBe(true);
  });

  it("payload đi qua ngữ nghĩa JSON: Date → ISO, toJSON được tôn trọng, `undefined` bị bỏ — y hệt đường trực tiếp", () => {
    const h = setup();
    const at = new Date("2026-09-25T10:00:00.000Z");
    h.bridge.broadcaster.to("r").emit("e", { at, who: { toJSON: () => "u1" }, gone: undefined, n: 1 });

    expect(published(h).message).toMatchObject([ "emitter", { data: ["e", { at: "2026-09-25T10:00:00.000Z", who: "u1", n: 1 }] }, {}]);
    const payload = ((published(h).message as unknown[])[1] as { data: [string, Record<string, unknown>] }).data[1];
    expect("gone" in payload).toBe(false);
  });
});

describe("socket.bridge — KHÔNG ném, KHÔNG treo khi Redis lỗi/chậm", () => {
  it("Redis chưa sẵn sàng → bỏ sự kiện (không xếp hàng), không ném, đếm dropped", () => {
    const h = setup();
    h.ready.value = false;

    expect(() => h.bridge.broadcaster.to("user:u1").emit("e", {})).not.toThrow();
    expect(() => h.bridge.broadcaster.in("user:u1").socketsLeave("ch:c")).not.toThrow();
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.bridge.stats()).toMatchObject({ dropped: 2, published: 0, inflight: 0 });
  });

  it("Redis sống lại → sự kiện MỚI đi tiếp, sự kiện đã bỏ KHÔNG được phát lại", async () => {
    const h = setup();
    h.ready.value = false;
    h.bridge.broadcaster.to("r").emit("cu", {});
    h.ready.value = true;
    h.bridge.broadcaster.to("r").emit("moi", {});
    await flush();

    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(published(h).message).toMatchObject(["emitter", { data: ["moi", {}] }, {}]);
  });

  it("cảnh báo Redis-chưa-sẵn-sàng bị nén: 100 sự kiện → 1 dòng log (không ngập log khi Redis mất)", () => {
    const h = setup();
    h.ready.value = false;
    for (let i = 0; i < 100; i += 1) h.bridge.broadcaster.to("r").emit("e", { i });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(h.bridge.stats().dropped).toBe(100);
  });

  it("PUBLISH treo VÔ HẠN → lời gọi emit trả về NGAY; sau `timeoutMs` bỏ chờ và đếm timedOut", async () => {
    jest.useFakeTimers();
    const h = setup({ timeoutMs: 1000 });
    h.publish.mockReturnValue(new Promise<number>(() => undefined)); // không bao giờ resolve/reject

    // Trả về đồng bộ dù lệnh PUBLISH chưa xong — job worker không bao giờ phải chờ Redis.
    expect(() => h.bridge.broadcaster.to("r").emit("e", {})).not.toThrow();
    expect(h.bridge.stats().inflight).toBe(1);

    jest.advanceTimersByTime(999);
    await flush();
    expect(h.bridge.stats()).toMatchObject({ inflight: 1, timedOut: 0 });

    jest.advanceTimersByTime(1);
    await flush();
    expect(h.bridge.stats()).toMatchObject({ inflight: 0, timedOut: 1 });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("PUBLISH bị từ chối → không unhandled rejection, đếm failed, log", async () => {
    const h = setup();
    h.publish.mockRejectedValue(new Error("READONLY You can't write against a read only replica"));
    const onUnhandled = jest.fn();
    process.on("unhandledRejection", onUnhandled);
    try {
      expect(() => h.bridge.broadcaster.to("r").emit("e", {})).not.toThrow();
      await flush();
      await new Promise((resolve) => setImmediate(resolve));

      expect(h.bridge.stats()).toMatchObject({ failed: 1, inflight: 0, published: 0 });
      const [message, meta] = (logger.warn as jest.Mock).mock.calls[0] as [string, { error: string }];
      expect(message).toContain("PUBLISH bị từ chối");
      expect(meta.error).toContain("READONLY");
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("publisher ném ĐỒNG BỘ → không ném ra ngoài, đếm failed", () => {
    const h = setup();
    h.publish.mockImplementation(() => {
      throw new Error("client đã đóng");
    });

    expect(() => h.bridge.broadcaster.to("r").emit("e", {})).not.toThrow();
    expect(h.bridge.stats()).toMatchObject({ failed: 1, inflight: 0 });
  });

  it("payload không tuần tự hoá được (vòng tròn) → KHÔNG ném lên job, log error, không PUBLISH", () => {
    const h = setup();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => h.bridge.broadcaster.to("r").emit("e", circular)).not.toThrow();
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.bridge.stats().failed).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Không phát được sự kiện"), expect.objectContaining({ what: "emit:e" }));
  });

  it("tên sự kiện bị cấm (`disconnect`) → không ném lên job", () => {
    const h = setup();
    expect(() => h.bridge.broadcaster.to("r").emit("disconnect", {})).not.toThrow();
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.bridge.stats().failed).toBe(1);
  });

  it("quá `maxInflight` lệnh đang bay → bỏ bớt thay vì phình bộ nhớ", () => {
    const h = setup({ maxInflight: 3 });
    h.publish.mockReturnValue(new Promise<number>(() => undefined));
    for (let i = 0; i < 5; i += 1) h.bridge.broadcaster.to("r").emit("e", { i });

    expect(h.publish).toHaveBeenCalledTimes(3);
    expect(h.bridge.stats()).toMatchObject({ inflight: 3, dropped: 2 });
  });

  it("vòng lặp fan-out dài (5.000 emit đồng bộ) vẫn lọt hết với trần mặc định", async () => {
    const h = setup();
    for (let i = 0; i < 5000; i += 1) h.bridge.broadcaster.to(`user:${i}`).emit("notification:created", { i });
    await flush();

    expect(h.publish).toHaveBeenCalledTimes(5000);
    expect(h.bridge.stats()).toMatchObject({ dropped: 0, published: 5000, inflight: 0 });
  });

  it("PUBLISH thành công nhưng KHÔNG subscriber nào (API chưa gắn adapter/SOCKET_ADAPTER=memory) → đếm noSubscribers + cảnh báo", async () => {
    const h = setup({ receivers: 0 });
    h.bridge.broadcaster.to("r").emit("e", {});
    await flush();

    expect(h.bridge.stats()).toMatchObject({ published: 1, noSubscribers: 1 });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Không instance API nào lắng kênh"), expect.anything());
  });
});

describe("socket.bridge — vòng đời (init/close)", () => {
  it("initSocketBridge idempotent; getSocketBridge trả đúng cầu nối; chưa init → null", () => {
    expect(getSocketBridge()).toBeNull();
    const a = initSocketBridge({ publisher: { isReady: () => true, publish: () => Promise.resolve(1) } });
    const b = initSocketBridge();
    expect(b).toBe(a);
    expect(getSocketBridge()).toBe(a);
  });

  it("close(): chờ lệnh PUBLISH đang bay xong rồi mới trả về; sau đó lệnh phát muộn bị bỏ êm (không ném)", async () => {
    const h = setup();
    let resolvePublish: (n: number) => void = () => undefined;
    h.publish.mockReturnValue(new Promise<number>((resolve) => (resolvePublish = resolve)));
    h.bridge.broadcaster.to("r").emit("e", {});

    let closed = false;
    const closing = h.bridge.close().then(() => {
      closed = true;
    });
    await flush();
    expect(closed).toBe(false); // còn 1 lệnh bay

    resolvePublish(1);
    await closing;
    expect(h.bridge.stats()).toMatchObject({ published: 1, inflight: 0 });
    const [summary, summaryStats] = (logger.info as jest.Mock).mock.calls.at(-1) as [string, { published: number }];
    expect(summary).toContain("Đã đóng cầu nối"); // tổng kết một dòng khi tắt (worker không có /metrics)
    expect(summaryStats.published).toBe(1);

    expect(() => h.bridge.broadcaster.to("r").emit("muon", {})).not.toThrow();
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.bridge.stats().dropped).toBe(1);
  });

  it("close() có TRẦN thời gian: PUBLISH treo vô hạn cũng không giữ graceful shutdown của worker", async () => {
    jest.useFakeTimers();
    const h = setup({ closeTimeoutMs: 2000, timeoutMs: 60_000 });
    h.publish.mockReturnValue(new Promise<number>(() => undefined));
    h.bridge.broadcaster.to("r").emit("e", {});

    let closed = false;
    const closing = h.bridge.close().then(() => {
      closed = true;
    });
    jest.advanceTimersByTime(1999);
    await flush();
    expect(closed).toBe(false);
    jest.advanceTimersByTime(1);
    await closing;
    expect(closed).toBe(true);
  });

  it("closeSocketBridge() an toàn khi chưa init và khi gọi lặp", async () => {
    await expect(closeSocketBridge()).resolves.toBeUndefined();
    setup();
    await expect(closeSocketBridge()).resolves.toBeUndefined();
    await expect(closeSocketBridge()).resolves.toBeUndefined();
  });
});
