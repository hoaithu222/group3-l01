import http from "node:http";
import express, { type Express } from "express";
import { env } from "../../core/config";
import { logger } from "../logger";
import { metricsHandler } from "./metrics.route";

/**
 * Cổng metrics RIÊNG của tiến trình worker (p0-11 be.md §5.5/§1): worker không có HTTP server nên `queue_jobs_total`, `outbox_dispatch_duration_seconds`,
 * `push_sent_total`, `notification_fanout_duration_seconds`… (chỉ tăng trong tiến trình worker) không bao giờ hiện ở `/metrics` của API — Prometheus phải scrape
 * `worker:9464/metrics`. Dùng lại đúng `metricsHandler` (Bearer `METRICS_TOKEN`; localhost không cần token) để một đường xác thực duy nhất.
 *
 * `GET /health/live` không cần token — Docker healthcheck của service `worker` (không mở cổng API).
 * ⚠️ Chỉ bind mạng nội bộ compose; ⛔ không publish cổng này ra ngoài host.
 */
export function createWorkerMetricsApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  app.get("/health/live", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/metrics", (req, res) => {
    metricsHandler(req, res).catch((err: unknown) => {
      logger.error("[worker-metrics] Lỗi khi tạo response /metrics:", err);
      res.status(500).end();
    });
  });

  return app;
}

let server: http.Server | null = null;

/**
 * Mở cổng metrics của worker. Trả `null` (không làm gì) khi `METRICS_ENABLED=false` hoặc `WORKER_METRICS_PORT=0`. Lỗi bind (cổng bận) chỉ cảnh báo — worker vẫn phải xử lý job.
 */
export function startWorkerMetricsServer(port: number = env.WORKER_METRICS_PORT): http.Server | null {
  if (server) return server;
  if (!env.METRICS_ENABLED || port === 0) return null;
  const created = http.createServer(createWorkerMetricsApp());
  created.on("error", (err: Error) => {
    logger.warn("[worker-metrics] Không mở được cổng metrics của worker", { port, error: err.message });
    if (server === created) server = null;
  });
  created.listen(port, () => logger.info(`[worker-metrics] Lắng nghe :${port} (/metrics, /health/live)`));
  server = created;
  return created;
}

/** Đóng cổng metrics (gọi khi worker tắt). Không ném lỗi. */
export async function stopWorkerMetricsServer(): Promise<void> {
  const current = server;
  server = null;
  if (!current?.listening) return;
  await new Promise<void>((resolve) => {
    current.close(() => resolve());
    current.closeAllConnections();
  });
}
