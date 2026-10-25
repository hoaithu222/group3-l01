/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp của `contribution`: bật cờ `project` (chưa nằm trong `AVAILABLE_MODULES` — test tự thêm qua mock) và đăng ký
 * các mock hạ tầng (không có Redis thật). Redis mock có STATE thật (Map) để `scopeLimiter`/cache quyền chạy đúng hành vi.
 */
process.env.FEATURE_FLAGS = "project=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.PROJECT] };
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

/** Bộ nhớ thay cho storage thật (Local ghi đĩa) — chỉ những gì `AssetService.createFromBuffer`/`getUrl` cần. */
export const storageObjects = new Map<string, Buffer>();
jest.mock("../../../../infrastructure/storage", () => ({
  ...jest.requireActual("../../../../infrastructure/storage"),
  storage: { putObject: jest.fn(), getSignedUrl: jest.fn(), deleteMany: jest.fn(), head: jest.fn() },
}));

import { storage } from "../../../../infrastructure/storage";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { registerWorkspacePermissionResolver } from "../../../workspaces/services/workspace-permission.resolver";
import { PrismaWorkspaceRepository } from "../../../workspaces/repositories";

registerWorkspacePermissionResolver(new PrismaWorkspaceRepository());

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
  (redis.setNx as jest.Mock).mockImplementation((k: string, v?: unknown) => {
    if (redisStore.has(k)) return Promise.resolve(false);
    redisStore.set(k, v ?? "1");
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
  (storage.putObject as jest.Mock).mockImplementation((key: string, buffer: Buffer) => {
    storageObjects.set(key, buffer);
    return Promise.resolve({ key, size: buffer.length });
  });
  (storage.getSignedUrl as jest.Mock).mockImplementation((key: string) => Promise.resolve(`https://storage.test/${key}?sig=abc&exp=60`));
  (storage.deleteMany as jest.Mock).mockImplementation((keys: string[]) => {
    for (const k of keys) storageObjects.delete(k);
    return Promise.resolve();
  });
}
