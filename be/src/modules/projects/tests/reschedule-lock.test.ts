const store = new Map<string, unknown>();
let redisDown = false;

jest.mock("../../../infrastructure/redis", () => ({
  redis: { setNx: jest.fn(), exists: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import { redis } from "../../../infrastructure/redis";
import { InMemoryRescheduleLock, RedisRescheduleLock, RESCHEDULE_LOCK_TTL_SECONDS, rescheduleLockKey } from "../services/reschedule-lock";

beforeEach(() => {
  store.clear();
  redisDown = false;
  // Mô phỏng wrapper `redis`: khi Redis mất kết nối `setNx` trả false và `exists` trả false (đúng như redis.client.ts).
  (redis.setNx as jest.Mock).mockImplementation((key: string, value: string) => {
    if (redisDown || store.has(key)) return Promise.resolve(false);
    store.set(key, value);
    return Promise.resolve(true);
  });
  (redis.exists as jest.Mock).mockImplementation((key: string) => Promise.resolve(!redisDown && store.has(key)));
  (redis.get as jest.Mock).mockImplementation((key: string) => Promise.resolve(redisDown ? null : (store.get(key) ?? null)));
  (redis.del as jest.Mock).mockImplementation((key: string) => {
    store.delete(key);
    return Promise.resolve();
  });
});

describe("RedisRescheduleLock (reschedule:board:<boardId>, TTL 60 s)", () => {
  const lock = new RedisRescheduleLock();

  it("chiếm khoá theo bảng với TTL 60 s; bảng đang bị giữ → null; bảng khác không bị ảnh hưởng", async () => {
    const h1 = await lock.acquire("board1");
    expect(h1).toMatchObject({ key: rescheduleLockKey("board1") });
    expect(rescheduleLockKey("board1")).toBe("reschedule:board:board1");
    expect(redis.setNx).toHaveBeenCalledWith("reschedule:board:board1", expect.stringMatching(/^rs-/), RESCHEDULE_LOCK_TTL_SECONDS);
    expect(RESCHEDULE_LOCK_TTL_SECONDS).toBe(60);
    expect(await lock.acquire("board1")).toBeNull();
    expect(await lock.acquire("board2")).not.toBeNull();
  });

  it("nhả khoá của mình; sau đó chiếm lại được", async () => {
    const h1 = await lock.acquire("board1");
    await lock.release(h1!);
    expect(store.has("reschedule:board:board1")).toBe(false);
    expect(await lock.acquire("board1")).not.toBeNull();
  });

  it("KHÔNG nhả nhầm khoá của lệnh khác (khoá hết TTL rồi bị chiếm lại)", async () => {
    const mine = await lock.acquire("board1");
    store.set("reschedule:board:board1", "rs-cua-lenh-khac");
    await lock.release(mine!);
    expect(store.get("reschedule:board:board1")).toBe("rs-cua-lenh-khac");
  });

  it("Redis mất kết nối → 503 SYS_503 (KHÔNG fail-open, không nhầm với 'bảng đang bận'); lỗi lúc nhả bị nuốt", async () => {
    redisDown = true;
    const e = (await lock.acquire("board1").catch((x: unknown) => x)) as AppError;
    expect([e.statusCode, e.errorCode]).toEqual([503, "SYS_503"]);

    redisDown = false;
    const handle = await lock.acquire("board1");
    (redis.get as jest.Mock).mockRejectedValueOnce(new Error("mất kết nối"));
    await expect(lock.release(handle!)).resolves.toBeUndefined();
  });
});

describe("InMemoryRescheduleLock", () => {
  it("một khoá mỗi bảng, nhả đúng token", async () => {
    const lock = new InMemoryRescheduleLock();
    const first = await lock.acquire("b");
    expect(await lock.acquire("b")).toBeNull();
    await lock.release({ key: first!.key, token: "sai-token" });
    expect(await lock.acquire("b")).toBeNull();
    await lock.release(first!);
    expect(await lock.acquire("b")).not.toBeNull();
  });
});
