import type { Request } from "express";

/**
 * IErrorTracker — interface cho error tracking service.
 * Implement cho Sentry, Datadog, Rollbar, hoặc bất kỳ service nào.
 *
 * @example
 * // Sentry implementation
 * class SentryTracker implements IErrorTracker {
 *   captureException(error, context) {
 *     Sentry.captureException(error, { extra: context });
 *   }
 * }
 */
export interface IErrorTracker {
  /** Capture và gửi error lên service */
  captureException(error: Error, context?: ErrorContext): void;

  /** Capture message (warning, info) */
  captureMessage?(message: string, level?: "info" | "warning" | "error"): void;

  /** Set user context cho error tracking */
  setUser?(user: { id: string; email?: string }): void;
}

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  url?: string;
  method?: string;
  body?: unknown;
  [key: string]: unknown;
}

/**
 * Extract error context từ Express request.
 */
export function extractErrorContext(req: Request): ErrorContext {
  return {
    requestId: req.requestId,
    userId: req.user?.id,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  };
}
