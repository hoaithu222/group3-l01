/**
 * @file errorHandler.ts
 * @description Global error-handling middleware (must be the LAST middleware
 * registered in Express — after all routes).
 *
 * All errors that reach this handler are normalised to a single JSON shape:
 *
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code":    "AUTH_001",
 *     "message": "Human-readable message",
 *     "details": []            // only present when non-empty
 *   },
 *   "timestamp": "2026-03-12T10:00:00.000Z",
 *   "requestId": "uuid-v4"    // injected by requestId middleware
 * }
 * ```
 *
 * Error classification (in priority order):
 *  1. `AppError` subclasses  → uses their `statusCode`, `errorCode`, `details`
 *  2. JWT library errors     → mapped to 401 + AUTH_002 / AUTH_003
 *  3. Unknown / unexpected   → 500 + SYS_500 (stack hidden in production)
 */

import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../exceptions";
import { ErrorCode } from "../utils/error.codes";
import { logger } from "../../infrastructure/logger";
import { env } from "../config";
import { getErrorTracker, extractErrorContext } from "../../infrastructure/error-tracker";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the requestId set by the `requestId` middleware, or fall back. */
function resolveRequestId(req: Request): string {
  return req.requestId ?? (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
}

/**
 * Số giây chờ lại từ `details.retryAfterSeconds` (khoá theo tài khoản `PasswordAttemptGuard`, `ScopeRateLimitError` của `scopeLimiter`):
 * làm tròn lên, > 0; không có/không hợp lệ ⇒ `undefined`.
 */
function retryAfterSecondsOf(details: unknown): number | undefined {
  const value = (details as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

/** Shape of the `error` sub-object sent to clients. */
interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** Build and send the standardised error response. */
function sendError(res: Response, status: number, body: ErrorBody, requestId: string): void {
  const payload: Record<string, unknown> = {
    success: false,
    error: {
      code: body.code,
      message: body.message,
      ...(body.details !== undefined && body.details !== null ? { details: body.details } : {}),
    },
    timestamp: new Date().toISOString(),
    requestId,
  };

  res.status(status).json(payload);
}

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler (4-argument signature required by Express)
// ─────────────────────────────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const requestId = resolveRequestId(req);

  // ── 1. AppError (all typed subclasses) ──────────────────────────────────
  if (err instanceof AppError) {
    logger.warn("AppError", {
      requestId,
      errorCode: err.errorCode,
      statusCode: err.statusCode,
      message: err.message,
      ...(env.NODE_ENV !== "production" && { stack: err.stack }),
    });

    // p0-11 — lỗi nghiệp vụ 5xx (502/503 phụ thuộc ngoài…) cũng báo lên error tracker; 4xx là kết quả bình thường nên không gửi.
    if (err.statusCode >= 500) getErrorTracker().captureException(err, extractErrorContext(req));

    // 429 có `details.retryAfterSeconds` ⇒ kèm header chuẩn `Retry-After` (giây): client/proxy đọc được mà không phải bóc body
    // (limiter của `express-rate-limit` đã tự đặt header này; lỗi 429 do nghiệp vụ ném ra thì trước đây chỉ có trong body).
    const retryAfter = err.statusCode === 429 ? retryAfterSecondsOf(err.details) : undefined;
    if (retryAfter !== undefined) res.setHeader("Retry-After", String(retryAfter));

    sendError(
      res,
      err.statusCode,
      { code: err.errorCode, message: err.message, details: err.details },
      requestId
    );
    return;
  }

  // ── 2. JWT library errors ────────────────────────────────────────────────
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name: string }).name;

    if (name === "TokenExpiredError") {
      logger.warn("JWT token expired", { requestId });
      sendError(res, 401, { code: ErrorCode.AUTH_003, message: "Token đã hết hạn" }, requestId);
      return;
    }

    if (name === "JsonWebTokenError") {
      logger.warn("JWT token invalid", { requestId });
      sendError(res, 401, { code: ErrorCode.AUTH_002, message: "Token không hợp lệ" }, requestId);
      return;
    }
  }

  // ── 3. Unknown / unexpected errors ──────────────────────────────────────
  logger.error("Unhandled error", {
    requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  // Gửi lên error tracker (Sentry, Datadog, ...)
  if (err instanceof Error) {
    getErrorTracker().captureException(err, extractErrorContext(req));
  }

  const message =
    env.NODE_ENV === "production"
      ? "Có lỗi hệ thống, vui lòng thử lại sau"
      : err instanceof Error
        ? err.message
        : String(err);

  sendError(res, 500, { code: ErrorCode.SYS_500, message }, requestId);
}

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler (registered before errorHandler, after all routes)
// ─────────────────────────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = resolveRequestId(req);

  sendError(
    res,
    404,
    {
      code: ErrorCode.RES_001,
      message: `Không tìm thấy ${req.method} ${req.url}`,
    },
    requestId
  );
}
