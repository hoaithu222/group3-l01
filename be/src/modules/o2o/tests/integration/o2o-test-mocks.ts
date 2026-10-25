/**
 * PHẢI import ĐẦU TIÊN trong mỗi test tích hợp của `o2o`: bật cờ `o2o` trước khi `core/constants/modules` tính `FEATURE_FLAGS`,
 * mock Redis bằng Map CÓ TRẠNG THÁI (khoá PIN, cache quyền theo dữ liệu, `idempotencyKey`/`scopeLimiter` chạy đúng hành vi) —
 * mẫu `wallet-test-mocks.ts`. `getClient()` trả client "sẵn sàng" để khoá PIN (fail-closed khi Redis mất) không chặn.
 */
process.env.FEATURE_FLAGS = "o2o=true";

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

const parse = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v) as unknown;
  } catch {
    return v;
  }
};

/** `resetMocks: true` (jest.config) xoá mọi implementation trước MỖI test → gọi lại trong `beforeEach`. */
export function installMocks(): void {
  (redis.get as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.has(k) ? parse(redisStore.get(k)) : null));
  (redis.set as jest.Mock).mockImplementation((k: string, v: unknown) => {
    redisStore.set(k, typeof v === "string" ? v : JSON.stringify(v));
    return Promise.resolve();
  });
  (redis.del as jest.Mock).mockImplementation((k: string) => {
    redisStore.delete(k);
    return Promise.resolve();
  });
  (redis.getdel as jest.Mock).mockImplementation((k: string) => {
    const v = redisStore.has(k) ? parse(redisStore.get(k)) : null;
    redisStore.delete(k);
    return Promise.resolve(v);
  });
  (redis.incr as jest.Mock).mockImplementation((k: string) => {
    const next = Number(redisStore.get(k) ?? 0) + 1;
    redisStore.set(k, String(next));
    return Promise.resolve(next);
  });
  (redis.expire as jest.Mock).mockResolvedValue(undefined);
  (redis.ping as jest.Mock).mockResolvedValue(true);
  (redis.getClient as jest.Mock).mockReturnValue({ isReady: true });
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
}
