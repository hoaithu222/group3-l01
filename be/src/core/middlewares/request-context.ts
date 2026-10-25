import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Ngữ cảnh theo request (p0-11 be.md §1): `requestId` (+ `userId` sau khi xác thực) đi theo luồng bất đồng bộ của request để LOGGER tự gắn vào mọi dòng log
 * (`infrastructure/logger/request-context-format.ts`) — không phải truyền tay `requestId` xuống từng service. File này KHÔNG import logger/Sentry (tránh vòng phụ thuộc);
 * chỉ lưu và trả ngữ cảnh.
 */
export interface RequestContext {
  requestId: string;
  /** Getter đọc `req.user` LÚC GHI LOG — `authenticateToken` chạy sau middleware này nên không thể chép sẵn giá trị. */
  readonly userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Ngữ cảnh của request đang xử lý; `undefined` ngoài request (worker, script, khởi động). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Chạy `fn` trong một ngữ cảnh (dùng cho test hoặc nơi khác cần gắn `requestId` thủ công). */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * ⚠️ Đặt SAU các body parser (`express.json`/`urlencoded`), TRƯỚC routes: parser đọc stream bằng callback của socket nên ngữ cảnh mở TRƯỚC nó bị đứt sau `next()` của parser.
 * Mở ngữ cảnh ngay trước routes thì mọi handler/service/`errorHandler` phía sau đều thấy nó.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const context: RequestContext = {
    requestId: req.requestId ?? "unknown",
    get userId() {
      return req.user?.id;
    },
  };
  storage.run(context, next);
}
