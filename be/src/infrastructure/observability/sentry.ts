import type { Scope } from "@sentry/node";
import { env } from "../../core/config";
import { AppError } from "../../core/exceptions";
import { setErrorTracker, type ErrorContext, type IErrorTracker } from "../error-tracker";
import { logger } from "../logger";
import { scrubBreadcrumb, scrubEvent, scrubUrl } from "./scrub";

/** Kiểu module SDK — chỉ dùng ở mức kiểu; SDK được `require` LƯỜI (xem `initSentry`) nên thiếu DSN thì không nạp gì cả. */
type SentryModule = typeof import("@sentry/node");

let active: SentryModule | null = null;

/** Khoá ngữ cảnh được phép gắn thành TAG (giá trị ngắn, ít biến thể) — phần còn lại của `ErrorContext` cố ý bị bỏ (body, IP, user-agent, query). */
const TAG_KEYS = ["requestId", "method", "queue", "job", "jobId", "route"] as const;

function applyContext(scope: Scope, context: ErrorContext | undefined): void {
  if (!context) return;
  for (const key of TAG_KEYS) {
    const value = context[key];
    if (typeof value === "string" || typeof value === "number") scope.setTag(key, String(value));
  }
  // Chỉ `id` — không email/IP/username (sendDefaultPii=false, conventions §7).
  if (typeof context.userId === "string" && context.userId) scope.setUser({ id: context.userId });
  if (typeof context.url === "string") {
    scope.setContext("request", { method: context.method, url: scrubUrl(context.url) });
  }
  if (typeof context.attemptsMade === "number") scope.setExtra("attemptsMade", context.attemptsMade);
}

/**
 * `IErrorTracker` gửi lên Sentry (p0-11 be.md §5.1). Chỉ lỗi 5xx/lỗi lạ được gửi: `AppError` 4xx là kết quả nghiệp vụ bình thường nên bị bỏ.
 * `beforeSend` (`scrub.ts`) là chốt chặn cuối che token/nội dung tin/payload webhook.
 */
export class SentryTracker implements IErrorTracker {
  constructor(private readonly sentry: SentryModule) {}

  captureException(error: Error, context?: ErrorContext): void {
    if (error instanceof AppError && error.statusCode < 500) return;
    this.sentry.withScope((scope) => {
      applyContext(scope, context);
      this.sentry.captureException(error);
    });
  }

  captureMessage(message: string, level: "info" | "warning" | "error" = "info"): void {
    this.sentry.captureMessage(message, level);
  }

  setUser(user: { id: string; email?: string }): void {
    this.sentry.setUser({ id: user.id });
  }
}

/**
 * Bật Sentry nếu có `SENTRY_DSN`; trả `true` khi đã bật. **Thiếu DSN ⇒ no-op tuyệt đối**: không `require` SDK, không đổi tracker (giữ `ConsoleTracker`),
 * không tạo kết nối/timer nào. Lỗi khởi tạo (DSN sai định dạng, SDK hỏng) chỉ cảnh báo — quan sát không được làm sập tiến trình.
 *
 * ⛔ Gọi từ `instrument.ts` — import ĐẦU TIÊN của `server.ts`/`worker.ts` — vì tracing tự động (http/express) chỉ móc được khi init chạy TRƯỚC khi `express`/`http` được nạp.
 */
export function initSentry(): boolean {
  if (active) return true;
  const dsn = env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    // `require` có chủ đích (không `import` tĩnh): chỉ nạp SDK (OpenTelemetry…, ~vài chục MB) khi thật sự bật Sentry.
    const sentry = require("@sentry/node") as SentryModule;
    sentry.init({
      dsn,
      environment: env.SENTRY_ENVIRONMENT,
      release: env.SENTRY_RELEASE,
      serverName: env.INSTANCE_ID,
      tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
      sendDefaultPii: false,
      maxBreadcrumbs: 50,
      initialScope: { tags: { processRole: env.PROCESS_ROLE } },
      beforeSend: (event) => scrubEvent(event),
      beforeSendTransaction: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    });
    active = sentry;
    setErrorTracker(new SentryTracker(sentry));
    return true;
  } catch (err) {
    logger.warn("[sentry] Khởi tạo thất bại — giữ ConsoleTracker", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Đợi Sentry gửi nốt sự kiện đang chờ (tối đa `timeoutMs`) — gọi trước `process.exit` ở lỗi nghiêm trọng. Không bao giờ ném; không bật Sentry thì trả về ngay. */
export async function flushObservability(timeoutMs = 2000): Promise<void> {
  if (!active) return;
  try {
    await active.flush(timeoutMs);
  } catch {
    // gửi thất bại không được chặn việc thoát
  }
}

export function isSentryActive(): boolean {
  return active !== null;
}

/** CHỈ dùng trong test: đưa module về trạng thái chưa khởi tạo. */
export function resetSentryForTests(): void {
  active = null;
}
