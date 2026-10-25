/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp của ví: bật cờ `wallet` trước khi
 * `core/constants/modules` tính `FEATURE_FLAGS`, và đăng ký các mock hạ tầng (không có Redis thật).
 * Redis mock có STATE thật (Map) để `idempotencyKey`/`scopeLimiter`/cache quyền chạy đúng hành vi.
 */
process.env.FEATURE_FLAGS = "wallet=true";

export const redisStore = new Map<string, unknown>();
export const mockAuditRecord = jest.fn();

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

jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: (...args: unknown[]) => mockAuditRecord(...args) })),
}));

// Không có Redis: `outboxSignal()` sẽ chờ hết 1 s timeout sau MỖI transaction có outbox — bỏ qua cho nhanh.
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => ({
  ...jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer"),
  outboxSignal: jest.fn().mockResolvedValue(undefined),
}));

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
  (redis.ping as jest.Mock).mockResolvedValue(true);
  (redis.getClient as jest.Mock).mockReturnValue(null);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  mockAuditRecord.mockResolvedValue(undefined);
}
