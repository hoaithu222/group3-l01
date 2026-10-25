import IORedis from "ioredis";
import { env } from "../../core/config";

/**
 * BullMQ cần kết nối ioredis riêng, KHÔNG dùng chung với client `redis` (node-redis)
 * đang có ở `infrastructure/redis` — BullMQ yêu cầu `maxRetriesPerRequest: null`.
 * `lazyConnect: true` — chỉ mở socket khi Queue/Worker đầu tiên thật sự dùng tới,
 * tránh crash khi Redis chưa sẵn sàng lúc import module.
 */
export const queueConnection = new IORedis(env.REDIS_URL, {
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});
