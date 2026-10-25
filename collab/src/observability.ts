import type { CollabConfig } from "./config";
import type { Logger } from "./logger";
import { errorMeta } from "./logger";

export type ReportError = (err: unknown, context?: Record<string, unknown>) => void;

/**
 * Báo lỗi: luôn ghi log JSON mức error; nếu có `SENTRY_DSN` thì gửi thêm lên Sentry (nạp `@sentry/node` khi cần, không tốn
 * tài nguyên khi không dùng). Không bao giờ ném lỗi ra ngoài (báo lỗi không được làm hỏng luồng chính).
 */
export async function initErrorReporting(config: CollabConfig, logger: Logger): Promise<ReportError> {
  let capture: ((err: unknown, context?: Record<string, unknown>) => void) | undefined;
  if (config.sentryDsn) {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.init({ dsn: config.sentryDsn, environment: config.nodeEnv, release: `collab@${config.appVersion}`, serverName: config.instanceId, tracesSampleRate: 0 });
      capture = (err, context) => {
        Sentry.captureException(err, context ? { extra: context } : undefined);
      };
      logger.info("Sentry đã bật");
    } catch (err) {
      logger.warn("không khởi tạo được Sentry — chỉ ghi log", errorMeta(err));
    }
  }
  return (err, context) => {
    logger.error("lỗi", { ...context, ...errorMeta(err) });
    try {
      capture?.(err, context);
    } catch {
      /* bỏ qua */
    }
  };
}
