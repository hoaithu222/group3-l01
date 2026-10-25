import { Redis as RedisExtension } from "@hocuspocus/extension-redis";
import type { Extension } from "@hocuspocus/server";
import IORedis from "ioredis";
import type { CollabConfig } from "../config";
import type { Logger } from "../logger";
import { errorMeta } from "../logger";
import type { ResourceKind } from "../resource-kinds";

/** Lệnh quản trị cần đến MỌI instance (không biết instance nào đang giữ kết nối của user/workspace). */
export type BusMessage = {
  from: string;
  op: "kick";
  kind?: ResourceKind;
  docId?: string;
  userId?: string;
  workspaceId?: string;
  reason: "revoked" | "archived" | "forbidden";
};

export interface KickBus {
  publish(message: Omit<BusMessage, "from">): void;
  onMessage(handler: (message: BusMessage) => void): void;
  status(): "ok" | "error" | "off";
  close(): Promise<void>;
}

const noopBus: KickBus = {
  publish: () => undefined,
  onMessage: () => undefined,
  status: () => "off",
  close: async () => undefined,
};

export interface RedisParts {
  /** `undefined` khi không cấu hình `REDIS_URL` (chạy một instance). */
  extension: Extension | undefined;
  bus: KickBus;
  close(): Promise<void>;
}

const redisOptions = {
  // Không xếp hàng lệnh vô hạn khi Redis mất kết nối: lỗi sớm để tầng trên quyết định (xem README "Redis").
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  retryStrategy: (times: number) => Math.min(times * 200, 2000),
} as const;

/**
 * Nhiều instance: `@hocuspocus/extension-redis` đồng bộ update/awareness giữa các instance (kèm khoá Redlock khi lưu để chỉ một
 * instance ghi BE tại một thời điểm) + một kênh pub/sub riêng để chuyển lệnh `kick` tới mọi instance.
 * nginx VẪN nên băm theo `?doc=<id>` để một document chủ yếu nằm trên một instance (đỡ tải đồng bộ).
 */
export function createRedis(config: CollabConfig, logger: Logger): RedisParts {
  const url = config.redisUrl;
  if (!url) return { extension: undefined, bus: noopBus, close: async () => undefined };

  const extension = new RedisExtension({
    createClient: () => {
      const client = new IORedis(url, redisOptions);
      client.on("error", (err) => logger.warn("Redis (extension) lỗi", errorMeta(err)));
      return client;
    },
    prefix: `${config.redisKeyPrefix}hp`,
    identifier: config.instanceId,
  });

  const channel = `${config.redisKeyPrefix}bus`;
  const pub = new IORedis(url, redisOptions);
  const sub = new IORedis(url, redisOptions);
  for (const c of [pub, sub]) c.on("error", (err) => logger.warn("Redis (bus) lỗi", errorMeta(err)));
  const handlers: Array<(message: BusMessage) => void> = [];
  void sub.subscribe(channel).catch((err: unknown) => logger.error("không subscribe được kênh bus", errorMeta(err)));
  sub.on("message", (_channel: string, raw: string) => {
    try {
      const message = JSON.parse(raw) as BusMessage;
      if (message.from === config.instanceId) return;
      for (const h of handlers) h(message);
    } catch (err) {
      logger.warn("tin bus không đọc được", errorMeta(err));
    }
  });

  const bus: KickBus = {
    publish: (message) => {
      pub.publish(channel, JSON.stringify({ ...message, from: config.instanceId })).catch((err: unknown) => logger.warn("không phát được tin bus", errorMeta(err)));
    },
    onMessage: (handler) => {
      handlers.push(handler);
    },
    status: () => (pub.status === "ready" && sub.status === "ready" ? "ok" : "error"),
    close: async () => {
      pub.disconnect();
      sub.disconnect();
    },
  };

  return { extension, bus, close: () => bus.close() };
}
