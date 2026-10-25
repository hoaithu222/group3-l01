/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp p3-04b (mời email / khách / duyệt tham gia): bật cờ `communication`,
 * mock hạ tầng (Redis có STATE, user-status, audit, outbox signal, queue: bắt `registerJob` để gọi tay processor, `enqueue`/`cancelJob`
 * là mock — không có Redis/BullMQ thật). KHÔNG phải test (không khớp `*.test.ts`).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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

export const mockAuditRecord = jest.fn();
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: (...a: unknown[]) => mockAuditRecord(...a) })),
}));

// Không có Redis: `outboxSignal()` chờ hết 1 giây sau MỖI transaction có outbox — bỏ qua cho nhanh.
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => ({
  ...jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer"),
  outboxSignal: jest.fn().mockResolvedValue(undefined),
}));

export type Processor = (job: { data: unknown }) => Promise<unknown>;
export const mockRegistered: Array<[string, string, Processor]> = [];
export const mockEnqueue = jest.fn();
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: (...a: unknown[]) => mockEnqueue(...a),
    cancelJob: jest.fn().mockResolvedValue(undefined),
  };
});

import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";

/** Processor đã đăng ký qua `registerJob` (side-effect lúc import file job) — gọi tay để chạy job trong test. */
export function processor(jobName: string): Processor {
  const found = mockRegistered.find((c) => c[1] === jobName);
  if (!found) throw new Error(`Chưa đăng ký processor ${jobName}`);
  return found[2];
}

/** `resetMocks: true` (jest.config) xoá implementation trước MỖI test → gọi lại trong `beforeEach`. */
export function installMocks(): void {
  redisStore.clear();
  mockAuditRecord.mockResolvedValue(undefined);
  mockEnqueue.mockResolvedValue(undefined);
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
  (redis.hset as jest.Mock).mockResolvedValue(undefined);
  (redis.hgetall as jest.Mock).mockResolvedValue({});
  (redis.hdel as jest.Mock).mockResolvedValue(undefined);
  (redis.scanKeys as jest.Mock).mockResolvedValue([]);
  (redis.ping as jest.Mock).mockResolvedValue(true);
  (redis.getClient as jest.Mock).mockReturnValue(null);
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
}
