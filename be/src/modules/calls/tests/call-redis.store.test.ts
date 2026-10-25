import { CallLockTimeoutError, CallRedisStore, InMemoryCallRedisPort, NodeRedisCallPort } from "../services/call-redis.store";

jest.mock("../../../infrastructure/redis", () => ({ redis: { getClient: jest.fn() } }));
import { redis } from "../../../infrastructure/redis";

describe("CallRedisStore (cổng in-memory có đồng hồ giả)", () => {
  let clock = 0;
  let port: InMemoryCallRedisPort;
  let store: CallRedisStore;
  beforeEach(() => {
    clock = 1_000;
    port = new InMemoryCallRedisPort(() => clock);
    store = new CallRedisStore(port, 21_600, 21_600);
  });

  it("acquireActive NX: người thứ hai nhận existing; cùng callId coi như đã giữ", async () => {
    expect(await store.acquireActive("CONVERSATION", "c1", "callA")).toEqual({ acquired: true });
    expect(await store.acquireActive("CONVERSATION", "c1", "callB")).toEqual({ acquired: false, existing: "callA" });
    expect(await store.acquireActive("CONVERSATION", "c1", "callA")).toEqual({ acquired: true });
    expect(await store.acquireActive("CONVERSATION", "c2", "callB")).toEqual({ acquired: true });
  });

  it("releaseActive compare-delete: KHÔNG xoá khoá của cuộc gọi khác (CL-15)", async () => {
    await store.acquireActive("CONVERSATION", "c1", "callA");
    expect(await store.releaseActive("CONVERSATION", "c1", "callB")).toBe(false);
    expect(await store.peekActive("CONVERSATION", "c1")).toBe("callA");
    expect(await store.releaseActive("CONVERSATION", "c1", "callA")).toBe(true);
    expect(await store.peekActive("CONVERSATION", "c1")).toBeNull();
  });

  it("khoá active hết hạn sau 90 s nếu không promote; promote kéo dài theo TTL cấu hình", async () => {
    await store.acquireActive("CONVERSATION", "c1", "callA");
    clock += 80_000;
    expect(await store.promoteActive("CONVERSATION", "c1", "callA")).toBe(true);
    clock += 3_600_000; // 1 giờ sau vẫn còn (TTL 6 giờ)
    expect(await store.peekActive("CONVERSATION", "c1")).toBe("callA");
    clock += 21_600_000;
    expect(await store.peekActive("CONVERSATION", "c1")).toBeNull();
    expect(await store.promoteActive("CONVERSATION", "c1", "callA")).toBe(false);
  });

  it("acquireBusy NX + peekBusy MGET + releaseBusy compare-delete", async () => {
    expect(await store.acquireBusy("u1", "callA")).toEqual({ acquired: true });
    expect(await store.acquireBusy("u1", "callB")).toEqual({ acquired: false, existing: "callA" });
    expect(await store.acquireBusy("u1", "callA")).toEqual({ acquired: true });
    expect([...(await store.peekBusy(["u1", "u2"]))]).toEqual([["u1", "callA"]]);
    expect(await store.releaseBusy("u1", "callB")).toBe(false);
    expect(await store.releaseBusy("u1", "callA")).toBe(true);
    expect((await store.peekBusy(["u1"])).size).toBe(0);
  });

  it("withLock: loại trừ lẫn nhau, thử lại rồi thành công khi khoá nhả; hết thời gian → CallLockTimeoutError", async () => {
    const order: string[] = [];
    let release!: () => void;
    const first = store.withLock("c", () => new Promise<void>((resolve) => {
      order.push("first-start");
      release = () => { order.push("first-end"); resolve(); };
    }));
    await Promise.resolve();
    const second = store.withLock("c", async () => { order.push("second"); }, { retries: 50, delayMs: 5 });
    await new Promise((r) => setTimeout(r, 30));
    release();
    await first;
    await second;
    expect(order).toEqual(["first-start", "first-end", "second"]);

    let hold!: () => void;
    const held = store.withLock("d", () => new Promise<void>((resolve) => { hold = resolve; }));
    await Promise.resolve();
    await expect(store.withLock("d", async () => undefined, { retries: 1, delayMs: 1 })).rejects.toBeInstanceOf(CallLockTimeoutError);
    hold();
    await held;
  });

  it("khoá lock tự hết hạn (PX) và không bị nhả nhầm bởi chủ cũ", async () => {
    await port.setNxPx("call:lock:x", "tokenB", 5000);
    expect(await port.compareAndDelete("call:lock:x", "tokenA")).toBe(false);
    clock += 6000;
    expect(await port.setNxPx("call:lock:x", "tokenC", 5000)).toBe(true);
  });

  it("FLUSHDB giữa chừng: khoá mất hết (tầng 2 Mongo activeKey mới là chốt chặn)", async () => {
    await store.acquireActive("CONVERSATION", "c1", "callA");
    port.flushAll();
    expect(await store.peekActive("CONVERSATION", "c1")).toBeNull();
    expect(await store.acquireActive("CONVERSATION", "c1", "callB")).toEqual({ acquired: true });
  });
});

describe("NodeRedisCallPort — lệnh Redis thật (client giả để kiểm tham số Lua/NX)", () => {
  const client = { isOpen: true, isReady: true, set: jest.fn(), get: jest.fn(), mGet: jest.fn(), eval: jest.fn() };
  beforeEach(() => {
    (redis.getClient as jest.Mock).mockReturnValue(client);
  });

  it("setNx dùng NX+EX, setNxPx dùng NX+PX; áp REDIS_KEY_PREFIX", async () => {
    client.set.mockResolvedValue("OK");
    const port = new NodeRedisCallPort();
    expect(await port.setNx("call:active:CONVERSATION:1", "c", 90)).toBe(true);
    expect(client.set).toHaveBeenLastCalledWith(expect.stringMatching(/call:active:CONVERSATION:1$/), "c", { NX: true, EX: 90 });
    client.set.mockResolvedValue(null);
    expect(await port.setNxPx("call:lock:1", "t", 5000)).toBe(false);
    expect(client.set).toHaveBeenLastCalledWith(expect.stringMatching(/call:lock:1$/), "t", { NX: true, PX: 5000 });
  });

  it("compare-delete/expire gọi Lua với KEYS/ARGV đúng và đọc kết quả số", async () => {
    const port = new NodeRedisCallPort();
    client.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect(await port.compareAndDelete("call:busy:u", "callA")).toBe(true);
    expect(client.eval.mock.calls[0][0]).toContain('redis.call("DEL"');
    expect(client.eval.mock.calls[0][1]).toEqual({ keys: [expect.stringMatching(/call:busy:u$/)], arguments: ["callA"] });
    expect(await port.compareAndExpire("call:active:X:1", "callA", 21600)).toBe(false);
    expect(client.eval.mock.calls[1][1].arguments).toEqual(["callA", "21600"]);
  });

  it("Redis không sẵn sàng → 503 SYS_503 (KHÔNG fail-open cho khoá gọi)", async () => {
    (redis.getClient as jest.Mock).mockReturnValue(null);
    await expect(new NodeRedisCallPort().setNx("k", "v", 1)).rejects.toMatchObject({ statusCode: 503, errorCode: "SYS_503" });
  });
});
