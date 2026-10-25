/**
 * @file worker.ts
 * @description Entry point riêng cho tiến trình worker (`PROCESS_ROLE=worker`),
 * chạy tách khỏi HTTP server để scale độc lập (`node dist/worker.js`).
 * Dev: `npm run dev:worker`. `PROCESS_ROLE=all` (mặc định dev) đã chạy worker
 * in-process trong `server.ts` — không cần chạy file này song song trong dev.
 */
// ⛔ p0-11: `instrument` PHẢI đứng ĐẦU (Sentry chỉ đo được module nạp SAU nó). Thiếu `SENTRY_DSN` thì không làm gì.
import "./infrastructure/observability/instrument";
import "dotenv/config";
import { logger } from "./infrastructure/logger";
import { flushObservability } from "./infrastructure/observability/sentry";
import { startWorkerMetricsServer, stopWorkerMetricsServer } from "./infrastructure/metrics/worker-metrics-server";
import { env } from "./core/config";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database";
import { redis } from "./infrastructure/redis";
import { initSocketBridge, closeSocketBridge } from "./infrastructure/socket/socket.bridge";
import {
  startWorkers,
  closeWorkers,
  closeQueues,
  syncCronSchedulers,
  startOutboxRelay,
  stopOutboxRelay,
} from "./infrastructure/queue";
import { registerAllJobs } from "./infrastructure/queue/register-jobs";
import { registerWorkerRegistries } from "./infrastructure/worker-registries";
import { bindPermissionPorts } from "./infrastructure/permission-ports";
import { initRuntimeConfig, startRuntimeConfigSync, stopRuntimeConfigSync } from "./core/config/runtime-config";
import { PrismaSystemConfigRepository } from "./modules/system-config/repositories/system-config.repository.prisma";
import type { Worker } from "bullmq";

process.on("uncaughtException", (error: Error) => {
  logger.error("[worker] UNCAUGHT EXCEPTION — đang tắt...", {
    error: error.message,
    stack: error.stack,
  });
  // p0-11: đợi Sentry gửi nốt lỗi (tối đa 2 s); không bật Sentry thì thoát ngay.
  void flushObservability(2000).finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[worker] UNHANDLED REJECTION", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

async function startWorkerProcess(): Promise<void> {
  // p0-11 — cổng metrics riêng (`WORKER_METRICS_PORT`, mặc định 9464): Prometheus scrape `worker:9464/metrics`. Mở SỚM để có số liệu ngay cả khi khởi động chậm.
  startWorkerMetricsServer();
  try {
    await connectDatabase();
  } catch (err) {
    logger.warn("[worker] DB kết nối thất bại, tiếp tục không có DB:", err);
  }
  try {
    await redis.connect();
  } catch (err) {
    logger.warn("[worker] Redis không khả dụng:", err);
  }

  // p0-03 — worker KHÔNG có Socket.IO `Server`: bật cầu nối (Redis emitter) TRƯỚC khi job nào chạy để mọi `emitTo*`/`leaveRooms`/
  // `disconnectUserSockets` trong processor tới được client qua các instance API (socket.bridge.ts). Đồng bộ, không cần Redis sẵn sàng.
  initSocketBridge();

  // p0-07 — job `config.broadcast` (config-changed.handler.ts) đọc
  // `RuntimeConfigService.configVersion()`, cần reader + subscriber sẵn sàng
  // TRƯỚC `registerAllJobs()`/`startWorkers()`.
  initRuntimeConfig(new PrismaSystemConfigRepository());
  await startRuntimeConfigSync();

  // p0-02 — gắn trước registerAllJobs()/startWorkers() vì processor
  // `permission.bump` (đăng ký trong permission-ports.ts) cần ports sẵn sàng.
  bindPermissionPorts();

  // p1-07 be.md §16.1 — worker riêng KHÔNG import `router.ts` nên phải tự boot các registry mà job dùng (resolver quyền, `MessageScope`,
  // hook thread/mention/đọc…). Thiếu ⇒ fan-out tin nhắn ra audience rỗng, push coi người nhận mất quyền. TRƯỚC `registerAllJobs()`/`startWorkers()`.
  await registerWorkerRegistries();

  await registerAllJobs();
  const workers: Worker[] = startWorkers();
  logger.info(`[worker] Đã khởi động ${workers.length} worker`);
  await syncCronSchedulers();
  await startOutboxRelay();

  const gracefulShutdown = (signal: string) => {
    logger.info(`[worker] ${signal} nhận được, đang tắt...`);
    // Dừng relay TRƯỚC khi đóng Worker (be.md §5.5) — không claim event mới
    // trong lúc đang đợi job hiện tại chạy xong.
    void stopOutboxRelay()
      .then(() => closeWorkers(workers))
      // Job đã xong hết ⇒ chờ (có trần) các lệnh PUBLISH realtime còn bay rồi mới đóng client Redis dùng chung bên dưới.
      .then(() => closeSocketBridge())
      .then(() => closeQueues())
      .then(() => stopRuntimeConfigSync())
      .then(() => stopWorkerMetricsServer())
      .then(() => redis.disconnect())
      .then(() => disconnectDatabase())
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error("[worker] Lỗi khi tắt:", err);
        process.exit(1);
      });

    setTimeout(() => {
      logger.error("[worker] Graceful shutdown timeout, force exit");
      process.exit(1);
    }, env.WORKER_SHUTDOWN_GRACE_MS + 5_000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

// Khởi động lỗi (vd import registry/job vỡ) ⇒ THOÁT để bộ giám sát khởi động lại; nuốt lỗi sẽ để lại tiến trình "sống" không xử lý job nào.
void startWorkerProcess().catch((err: unknown) => {
  logger.error("[worker] Khởi động thất bại — thoát", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
