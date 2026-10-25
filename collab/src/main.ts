import { ConfigError, loadConfig } from "./config";
import { createLogger, errorMeta } from "./logger";
import { initErrorReporting } from "./observability";
import { createCollabServer } from "./server";

/** Điểm vào tiến trình: đọc cấu hình → khởi động → dừng êm khi nhận SIGTERM/SIGINT (lưu nốt state còn treo). */
async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    // Chưa có logger cấu hình được → in thẳng ra stderr rồi thoát.
    process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
    process.exit(1);
  }
  const logger = createLogger(config.logLevel, { service: "collab", instance: config.instanceId });
  const report = await initErrorReporting(config, logger);
  const server = createCollabServer(config, { logger });

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info("nhận tín hiệu dừng", { signal });
    server
      .stop()
      .catch((err: unknown) => report(err, { phase: "shutdown" }))
      .finally(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  // Lỗi bất đồng bộ lọt lưới: ghi + báo, KHÔNG sập tiến trình (sập là mất state đang giữ trong RAM).
  process.on("unhandledRejection", (reason) => report(reason, { source: "unhandledRejection" }));
  process.on("uncaughtException", (err) => {
    report(err, { source: "uncaughtException" });
    shutdown("uncaughtException");
  });

  await server.start();
}

main().catch((err: unknown) => {
  createLogger("error").error("không khởi động được collab", errorMeta(err));
  process.exit(1);
});
