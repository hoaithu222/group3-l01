/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp của `admin-media-ops`: bật cờ `meeting` + `voice` (chưa nằm trong `AVAILABLE_MODULES` tới khi điều phối viên thêm — test tự thêm qua mock),
 * đặt env LiveKit giả TRƯỚC khi `core/config` được nạp, mock Redis có STATE (Map) và bỏ `outboxSignal` (không có Redis thật). Cùng khuôn `meetings/tests/integration/meetings-test-mocks.ts`.
 */
process.env.FEATURE_FLAGS = "meeting=true,voice=true";
process.env.LIVEKIT_URL = "http://localhost:7880";
process.env.LIVEKIT_PUBLIC_URL = "ws://localhost:7880";
process.env.LIVEKIT_API_KEY = "devkey";
process.env.LIVEKIT_API_SECRET = "devsecretdevsecretdevsecretdevsecret1234";

jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.VOICE, actual.MODULES.MEETING] };
});

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

/** `resetMocks: true` (jest.config) xoá mọi implementation trước MỖI test → gọi lại trong `beforeEach`. */
export function installMocks(): void {
  (redis.get as jest.Mock).mockImplementation((k: string) => Promise.resolve(redisStore.has(k) ? redisStore.get(k) : null));
  (redis.set as jest.Mock).mockImplementation((k: string, v: unknown) => (redisStore.set(k, v), Promise.resolve()));
  (redis.del as jest.Mock).mockImplementation((k: string) => (redisStore.delete(k), Promise.resolve()));
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
  (redis.hset as jest.Mock).mockResolvedValue(undefined);
  (redis.hgetall as jest.Mock).mockResolvedValue({});
  (redis.hdel as jest.Mock).mockResolvedValue(undefined);
  (redis.scanKeys as jest.Mock).mockResolvedValue([]);
  (redis.ping as jest.Mock).mockResolvedValue(true);
  (redis.getClient as jest.Mock).mockReturnValue(null);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
}
