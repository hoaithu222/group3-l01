import type { Request, Response, NextFunction } from "express";
import { logger } from "../../infrastructure/logger";

/**
 * Request Logger middleware — ghi chi tiết request/response bao gồm:
 * - Method, URL, status code
 * - Duration (ms)
 * - Request ID (correlation)
 * - User ID (nếu authenticated)
 * - Request body (chỉ trong development, ẩn password)
 *
 * Dùng thay thế hoặc bổ sung cho Morgan.
 */
/**
 * Từ khoá tìm kiếm (`?q=`) là nội dung riêng tư của người dùng (tìm tin/tệp/người trong nhóm) — KHÔNG ghi vào log
 * (conventions §7.9, be.md p5-04 §5 "không bao giờ log từ khoá"). Giữ nguyên các tham số khác để vẫn truy vết được request.
 */
export function redactSearchQuery(url: string): string {
  return url.replace(/([?&]q=)[^&#]*/g, "$1[redacted]");
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Lưu original end để hook vào
  const originalEnd = res.end;

  // Override res.end để capture timing
  res.end = function (...args: Parameters<typeof originalEnd>) {
    const duration = Date.now() - start;
    const logData: Record<string, unknown> = {
      method: req.method,
      url: redactSearchQuery(req.originalUrl),
      status: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    };

    // Thêm userId nếu authenticated
    if (req.user?.id) {
      logData.userId = req.user.id;
    }

    // Log request body trong development (ẩn sensitive fields)
    if (process.env.NODE_ENV !== "production" && req.body && Object.keys(req.body).length > 0) {
      logData.body = sanitizeBody(req.body);
    }

    // Log theo status code
    if (res.statusCode >= 500) {
      logger.error("Request completed", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("Request completed", logData);
    } else {
      logger.info("Request completed", logData);
    }

    return originalEnd.apply(res, args);
  } as typeof originalEnd;

  next();
}

/**
 * Ẩn sensitive fields trong body trước khi log.
 */
const SENSITIVE_FIELDS = ["password", "passwordHash", "token", "refreshToken", "secret", "apiKey"];

function sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
