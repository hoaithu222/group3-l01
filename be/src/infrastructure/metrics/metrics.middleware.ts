import type { Request, Response, NextFunction } from "express";
import { httpRequestDuration } from "./metrics.client";
import { env } from "../../core/config";

/**
 * Ghi `http_request_duration_seconds` cho mỗi request. Gắn sớm trong `app.ts`
 * (sau `requestIdMiddleware`) để đo cả thời gian các middleware phía sau.
 * `route` lấy từ `req.route` (chỉ có sau khi Express match route) — request
 * không match route nào (404) dùng `req.path` thay thế.
 */
export function httpRequestMetrics(req: Request, res: Response, next: NextFunction): void {
  if (!env.METRICS_ENABLED) {
    next();
    return;
  }
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route ? `${req.baseUrl}${(req.route as { path: string }).path}` : req.path;
    httpRequestDuration.observe(
      { method: req.method, route, status: String(res.statusCode) },
      durationSeconds
    );
  });
  next();
}
