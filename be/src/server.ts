// ⛔ p0-11: `instrument` PHẢI đứng ĐẦU — Sentry (nếu có DSN) chỉ đo được http/express nạp SAU khi nó chạy. Thiếu DSN thì không làm gì.
import "./infrastructure/observability/instrument";
import "dotenv/config";
import http from "http";
import app from "./app";
import { env, validateRuntime } from "./core/config";
import { logger } from "./infrastructure/logger";
import { flushObservability } from "./infrastructure/observability/sentry";
import { startDrain } from "./infrastructure/observability/drain";
import { connectDatabase, disconnectDatabase } from "./infrastructure/database";
import { ensureManualIndexesBestEffort } from "./infrastructure/database/ensure-manual-indexes";
import { redis } from "./infrastructure/redis";
import { initSocketServer, tryGetIO } from "./infrastructure/socket";
import { bindPermissionPorts } from "./infrastructure/permission-ports";
import { initRuntimeConfig, startRuntimeConfigSync, stopRuntimeConfigSync } from "./core/config/runtime-config";
import { PrismaSystemConfigRepository } from "./modules/system-config/repositories/system-config.repository.prisma";
import {
  startWorkers,
  closeWorkers,
  closeQueues,
  syncCronSchedulers,
  startOutboxRelay,
  stopOutboxRelay,
} from "./infrastructure/queue";
import { registerAllJobs } from "./infrastructure/queue/register-jobs";
import type { Worker } from "bullmq";

// ─── Process-level error handlers ────────────────────────────────────────────
// Bắt tất cả lỗi không được handle, tránh server crash không dấu vết.

process.on("uncaughtException", (error: Error) => {
  logger.error("UNCAUGHT EXCEPTION — Server đang tắt...", {
    error: error.message,
    stack: error.stack,
    name: error.name,
  });
  // Uncaught exception = state không đáng tin cậy → tắt server (p0-11: đợi Sentry gửi nốt lỗi tối đa 2 s; không bật Sentry thì thoát ngay)
  void flushObservability(2000).finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("UNHANDLED REJECTION", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Không exit ngay, nhưng log để tracking
  // Nếu muốn strict: process.exit(1);
});

/** Chờ bao lâu sau SIGTERM rồi mới ngắt socket (p0-11 be.md §5.2) — đủ cho health `draining` tới LB/Docker. */
const DRAIN_SOCKET_DELAY_MS = 2_000;

// ─── Server startup ──────────────────────────────────────────────────────────

async function startServer() {
  try {
    // ─── Runtime config checks ────────────────────────────────────────────
    const checks = validateRuntime();
    for (const c of checks)
      (c.level === "error" ? logger.error : logger.warn)(`[config] ${c.message}`);
    if (checks.some((c) => c.level === "error")) process.exit(1);

    // ─── Database ──────────────────────────────────────────────────────────
    try {
      await connectDatabase();
      // Index 2dsphere do Prisma không quản (db push xoá) — tạo lại nền, không chặn khởi động.
      void ensureManualIndexesBestEffort();
    } catch (err) {
      logger.warn(
        "DB kết nối thất bại (đã cấu hình DATABASE_URL/MongoDB Atlas chưa?), tiếp tục không có DB:",
        err
      );
    }

    // ─── Redis ──────────────────────────────────────────────────────────────
    try {
      await redis.connect();
      logger.info("Redis đã kết nối");
    } catch (err) {
      logger.warn("Redis không khả dụng, chạy không có cache:", err);
    }

    // ─── System config runtime (p0-07) ──────────────────────────────────────
    // Gắn reader (Mongo) + subscriber `cfg:invalidate` TRƯỚC khi route/job nào
    // đọc `RuntimeConfigService` (capabilities, requireFeature/requireSystemConfig).
    initRuntimeConfig(new PrismaSystemConfigRepository());
    await startRuntimeConfigSync();

    // ─── Permission ports (p0-02) ────────────────────────────────────────────
    // Gắn TRƯỚC initSocketServer/registerAllJobs — resolver/guard/job có thể
    // gọi revokeScope/bumpVersion ngay khi có request/job đầu tiên.
    bindPermissionPorts();

    // ─── HTTP + Socket.IO ───────────────────────────────────────────────────
    const httpServer = http.createServer(app);

    // Request timeout: tự động đóng connection nếu quá lâu (default 30s)
    httpServer.timeout = 30_000;
    httpServer.keepAliveTimeout = 65_000; // > ALB idle timeout (60s)
    httpServer.headersTimeout = 66_000; // > keepAliveTimeout

    initSocketServer(httpServer);

    // ─── Workers in-process (PROCESS_ROLE=all|worker) ───────────────────────
    // `api` không xử lý job — chạy tách sang `dist/worker.js` (PROCESS_ROLE=worker).
    let workers: Worker[] = [];
    if (env.PROCESS_ROLE !== "api") {
      await registerAllJobs();
      workers = startWorkers();
      logger.info(`[queue] workers started (${workers.length})`);
      await syncCronSchedulers();
      await startOutboxRelay();
    }

    httpServer.listen(env.PORT, () => {
      logger.info(`Server đang chạy tại port ${env.PORT}`);
      logger.info(`Môi trường: ${env.NODE_ENV}`);
      logger.info(`Health check: http://localhost:${env.PORT}/api/health`);
      logger.info(`API Docs: http://localhost:${env.PORT}/api/docs`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────
    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} nhận được, đang tắt server...`);

      // p0-11 — `/api/health` từ giờ trả 503 `draining` (Docker/LB thấy replica sắp tắt; `/api/health/live` vẫn 200). Sau nhịp ngắn cho LB rút, ngắt mọi socket của replica này —
      // WebSocket giữ kết nối mở nên `httpServer.close()` KHÔNG BAO GIỜ gọi callback nếu còn socket (rồi bị force-exit mã 1); client tự kết nối lại sang replica khác.
      startDrain(tryGetIO(), DRAIN_SOCKET_DELAY_MS);

      // Ngưng nhận connection mới, đợi request đang xử lý hoàn tất
      httpServer.close(async () => {
        logger.info("HTTP server đã đóng, cleanup resources...");

        // Cleanup theo thứ tự ngược — dừng relay TRƯỚC khi đóng Worker (be.md §5.5):
        // không còn claim event mới trong lúc job đang chạy dở được đợi hoàn tất.
        const cleanups: Array<{ name: string; fn: () => Promise<void> }> = [
          {
            name: "Outbox relay",
            fn: async () => {
              await stopOutboxRelay();
            },
          },
          {
            name: "Workers",
            fn: async () => {
              await closeWorkers(workers);
              await closeQueues();
            },
          },
          {
            name: "Runtime config sync",
            fn: async () => {
              await stopRuntimeConfigSync();
            },
          },
          {
            name: "Redis",
            fn: async () => {
              await redis.disconnect();
            },
          },
          {
            name: "Database",
            fn: async () => {
              await disconnectDatabase();
            },
          },
        ];

        for (const { name, fn } of cleanups) {
          try {
            await fn();
            logger.info(`${name} đã ngắt kết nối`);
          } catch (e) {
            logger.warn(`${name} ngắt kết nối thất bại:`, e);
          }
        }

        process.exit(0);
      });

      // Force shutdown nếu graceful không xong — chờ đủ để `closeWorkers()` có
      // thời gian đợi job đang chạy (WORKER_SHUTDOWN_GRACE_MS) + biên độ cho
      // Redis/Database đóng kết nối.
      setTimeout(() => {
        logger.error("Graceful shutdown timeout, force exit");
        process.exit(1);
      }, env.WORKER_SHUTDOWN_GRACE_MS + 5_000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (err) {
    logger.error("Khởi động server thất bại:", err);
    process.exit(1);
  }
}

void startServer();
