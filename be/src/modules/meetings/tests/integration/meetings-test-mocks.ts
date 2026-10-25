/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp của `meetings`: bật cờ `meeting` (chưa nằm trong `AVAILABLE_MODULES` cho tới khi
 * điều phối viên thêm — test tự thêm qua mock), đặt env LiveKit giả (token ký thật, không mạng) và mock hạ tầng (không có Redis).
 * Redis mock có STATE thật (Map) để `scopeLimiter`/cache quyền chạy đúng hành vi; khoá nóng của cuộc gọi dùng cổng in-memory riêng.
 */
process.env.FEATURE_FLAGS = "meeting=true";

jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.VOICE, actual.MODULES.MEETING] };
});

export const redisStore = new Map<string, unknown>();
export const redisHashStore = new Map<string, Record<string, string>>();

jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    setNx: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    scanKeys: jest.fn(),
    getClient: jest.fn(),
  },
}));

jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

// Không có Redis: `outboxSignal()` sẽ chờ hết 1 s timeout sau MỖI transaction có outbox — bỏ qua cho nhanh.
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => ({
  ...jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer"),
  outboxSignal: jest.fn().mockResolvedValue(undefined),
}));

import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";

/** `resetMocks: true` (jest.config) xoá mọi implementation trước MỖI test → gọi lại trong `beforeEach`. */
export function installMocks(): void {
  (redis.get as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.has(k) ? redisStore.get(k) : null));
  (redis.set as jest.Mock).mockImplementation((k: string, v: unknown) => {
    redisStore.set(k, v);
    return Promise.resolve();
  });
  (redis.del as jest.Mock).mockImplementation((k: string) => {
    redisStore.delete(k);
    return Promise.resolve();
  });
  (redis.getdel as jest.Mock).mockImplementation((k: string) => {
    const v = redisStore.has(k) ? redisStore.get(k) : null;
    redisStore.delete(k);
    return Promise.resolve(v);
  });
  (redis.incr as jest.Mock).mockImplementation((k: string) => {
    const next = ((redisStore.get(k) as number) ?? 0) + 1;
    redisStore.set(k, next);
    return Promise.resolve(next);
  });
  (redis.expire as jest.Mock).mockResolvedValue(undefined);
  (redis.exists as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.has(k)));
  (redis.setNx as jest.Mock).mockImplementation((k: string) => {
    if (redisStore.has(k)) return Promise.resolve(false);
    redisStore.set(k, "1");
    return Promise.resolve(true);
  });
  (redis.hset as jest.Mock).mockImplementation((k: string, field: string, value: string) => {
    redisHashStore.set(k, { ...(redisHashStore.get(k) ?? {}), [field]: value });
    return Promise.resolve();
  });
  (redis.hgetall as jest.Mock).mockImplementation((k: string) => Promise.resolve({ ...(redisHashStore.get(k) ?? {}) }));
  (redis.hdel as jest.Mock).mockImplementation((k: string, field: string) => {
    const h = redisHashStore.get(k);
    if (h) delete h[field];
    return Promise.resolve();
  });
  (redis.scanKeys as jest.Mock).mockResolvedValue([]);
  (redis.ping as jest.Mock).mockResolvedValue(true);
  (redis.getClient as jest.Mock).mockReturnValue(null);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
}
