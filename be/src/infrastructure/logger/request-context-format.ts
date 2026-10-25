import winston from "winston";
import { getRequestContext } from "../../core/middlewares/request-context";

/**
 * Winston format (p0-11): gắn `requestId`/`userId` từ ngữ cảnh request (`AsyncLocalStorage`) vào MỌI dòng log phát sinh trong request — kể cả log ở service/repository
 * không nhận `req`. Giá trị call-site đặt sẵn (`createContextLogger({ requestId })`, `logger.info(..., { userId })`) được giữ nguyên, không bị ghi đè.
 * Ngoài request (worker, khởi động) `getRequestContext()` trả `undefined` ⇒ không thêm gì.
 */
export const injectRequestContext = winston.format((info) => {
  const context = getRequestContext();
  if (!context) return info;
  if (info.requestId === undefined) info.requestId = context.requestId;
  const userId = context.userId;
  if (userId && info.userId === undefined) info.userId = userId;
  return info;
});
