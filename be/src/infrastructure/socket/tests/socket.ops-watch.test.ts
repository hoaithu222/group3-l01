/**
 * `socket.ops-watch.ts` (p0-03) — khoá Redis "có admin đang xem dashboard realtime (room `admin:ops`)": socket vào room đặt + gia hạn mỗi 30 s, rời/ngắt thì dừng;
 * cron `ops.stats-broadcast` (worker) chỉ đọc khoá này.
 */
const mockStore = new Map<string, { value: unknown; ttl?: number }>();
jest.mock("../../redis", () => ({
  redis: {
    set: jest.fn((key: string, value: unknown, ttl?: number) => {
      mockStore.set(key, { value, ttl });
      return Promise.resolve();
    }),
    exists: jest.fn((key: string) => Promise.resolve(mockStore.has(key))),
  },
}));

import { redis } from "../../redis";
import { OPS_WATCH_KEY, OPS_WATCH_REFRESH_MS, OPS_WATCH_TTL_SECONDS, createOpsWatch, hasOpsWatchers, touchOpsWatch } from "../socket.ops-watch";

describe("socket.ops-watch", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockStore.clear();
    (redis.set as jest.Mock).mockImplementation((key: string, value: unknown, ttl?: number) => {
      mockStore.set(key, { value, ttl });
      return Promise.resolve();
    });
    (redis.exists as jest.Mock).mockImplementation((key: string) => Promise.resolve(mockStore.has(key)));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("touch đặt khoá với TTL 75 s (lớn hơn nhịp gia hạn 30 s); hasOpsWatchers đọc khoá", async () => {
    expect(await hasOpsWatchers()).toBe(false);
    await touchOpsWatch();
    expect(redis.set).toHaveBeenCalledWith(OPS_WATCH_KEY, "1", OPS_WATCH_TTL_SECONDS);
    expect(OPS_WATCH_TTL_SECONDS * 1000).toBeGreaterThan(OPS_WATCH_REFRESH_MS);
    expect(await hasOpsWatchers()).toBe(true);
  });

  it("Redis lỗi: touch không ném; hasOpsWatchers → false (bỏ lượt phát)", async () => {
    (redis.set as jest.Mock).mockRejectedValueOnce(new Error("down"));
    await expect(touchOpsWatch()).resolves.toBeUndefined();
    (redis.exists as jest.Mock).mockRejectedValueOnce(new Error("down"));
    expect(await hasOpsWatchers()).toBe(false);
  });

  it("start đặt khoá ngay và gia hạn mỗi 30 s; gọi start lặp không nhân đôi timer; stop dừng gia hạn", async () => {
    const watch = createOpsWatch();
    watch.start();
    watch.start(); // idempotent
    await jest.advanceTimersByTimeAsync(0);
    expect(redis.set).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(OPS_WATCH_REFRESH_MS * 2);
    expect(redis.set).toHaveBeenCalledTimes(3); // 1 lần đầu + 2 lượt gia hạn (không phải 5)

    watch.stop();
    watch.stop(); // idempotent
    await jest.advanceTimersByTimeAsync(OPS_WATCH_REFRESH_MS * 3);
    expect(redis.set).toHaveBeenCalledTimes(3);
  });

  it("stop trước khi start hoặc start lại sau stop đều an toàn", async () => {
    const watch = createOpsWatch();
    watch.stop();
    watch.start();
    await jest.advanceTimersByTimeAsync(OPS_WATCH_REFRESH_MS);
    watch.stop();
    watch.start();
    await jest.advanceTimersByTimeAsync(OPS_WATCH_REFRESH_MS);
    expect((redis.set as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(4);
    watch.stop();
  });
});
