/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp của `recruiter`: bật cờ `career` (env) và mock hạ tầng không có ở test (Redis có STATE thật bằng Map để blacklist
 * token/limiter/idempotency/cache quyền chạy đúng hành vi; `outboxSignal` bỏ qua để khỏi chờ 1 s timeout sau mỗi transaction có outbox). Mẫu `portfolio-test-mocks`.
 */
process.env.FEATURE_FLAGS = "career=true";
// Cấu hình runtime đọc lại mỗi lần (không cache bộ nhớ) để test bật/tắt `recruiter.enabled` qua Redis giả.
process.env.SYSTEM_CONFIG_CACHE_MS = "0";

export const redisStore = new Map<string, unknown>();

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

jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => ({
  ...jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer"),
  outboxSignal: jest.fn().mockResolvedValue(undefined),
}));

import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";

/** Bật/tắt công tắc `recruiter.enabled` (mặc định registry là TẮT) qua bản ghi cache `cfg:recruiter` — đọc bởi `requireSystemConfig`/`runtimeConfig`. */
export function setRecruiterEnabled(on: boolean): void {
  redisStore.set("cfg:recruiter", { value: { enabled: on }, version: 1 });
}

/** `resetMocks: true` (jest.config) xoá implementation trước MỖI test → gọi lại trong `beforeEach`. */
export function installMocks(): void {
  (redis.get as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.has(k) ? redisStore.get(k) : null));
  (redis.set as jest.Mock).mockImplementation((k: string, v: unknown) => {
    redisStore.set(k, JSON.parse(JSON.stringify(v)));
    return Promise.resolve();
  });
  (redis.del as jest.Mock).mockImplementation((k: string) => {
    redisStore.delete(k);
    return Promise.resolve();
  });
  (redis.incr as jest.Mock).mockImplementation((k: string) => {
    const next = ((redisStore.get(k) as number) ?? 0) + 1;
    redisStore.set(k, next);
    return Promise.resolve(next);
  });
  (redis.expire as jest.Mock).mockResolvedValue(undefined);
  (redis.exists as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.has(k)));
  (redis.setNx as jest.Mock).mockImplementation((k: string, v?: unknown) => {
    if (redisStore.has(k)) return Promise.resolve(false);
    redisStore.set(k, v ?? "1");
    return Promise.resolve(true);
  });
  (redis.scanKeys as jest.Mock).mockResolvedValue([]);
  (redis.ping as jest.Mock).mockResolvedValue(true);
  (redis.getClient as jest.Mock).mockReturnValue(null);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
}
