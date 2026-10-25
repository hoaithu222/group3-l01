import type { Response } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: unknown;
  code?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface CursorResponse<T> {
  data: T[];
  meta: CursorMeta;
}

/**
 * Response format thống nhất:
 *
 * Success: { success: true, message, data, timestamp }
 * Paginated: { success: true, message, data, meta, timestamp }
 * Error: { success: false, error: { code, message, details? }, timestamp, requestId }
 *
 * Lưu ý: Error responses được xử lý bởi errorHandler middleware,
 * KHÔNG nên gọi ResponseUtils.error() trực tiếp — hãy throw AppError thay vì dùng các method error bên dưới.
 */
export class ResponseUtils {
  static success<T>(res: Response, data: T, message = "Thành công", statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static paginated<T>(
    res: Response,
    data: PaginatedResponse<T>,
    message = "Thành công",
    statusCode = 200
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data: data.data,
      meta: data.meta,
      timestamp: new Date().toISOString(),
    });
  }

  /** Cursor-based pagination response (audit log, inbox, các danh sách theo thời gian). */
  static cursor<T>(res: Response, payload: CursorResponse<T>, message = "Thành công"): Response {
    return res.status(200).json({
      success: true,
      message,
      data: payload.data,
      meta: payload.meta,
      timestamp: new Date().toISOString(),
    });
  }
}
