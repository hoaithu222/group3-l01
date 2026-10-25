import type { IErrorTracker, ErrorContext } from "./error-tracker.interface";
import { logger } from "../logger";

/**
 * ConsoleTracker — implementation mặc định, chỉ log ra console/file.
 * Dùng khi chưa tích hợp Sentry/Datadog.
 * Swap bằng SentryTracker khi cần.
 */
export class ConsoleTracker implements IErrorTracker {
  captureException(error: Error, context?: ErrorContext): void {
    logger.error("Error tracked", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...context,
    });
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
    logger[level === "warning" ? "warn" : level](message);
  }
}
