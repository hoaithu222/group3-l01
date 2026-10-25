import express from "express";
import request from "supertest";
import { errorHandler } from "../errorHandler";
import { AppError, ScopeRateLimitError, ValidationError } from "../../exceptions";
import { ErrorCode } from "../../utils/error.codes";

/**
 * Lỗi 429 do nghiệp vụ ném ra (khoá theo tài khoản `PasswordAttemptGuard`, `scopeLimiter`) mang số giây chờ trong
 * `details.retryAfterSeconds` — nay kèm header chuẩn `Retry-After` để client/proxy đọc mà không phải bóc body.
 */
function appThrowing(error: () => Error) {
  const app = express();
  app.get("/boom", () => {
    throw error();
  });
  app.use(errorHandler);
  return app;
}

describe("errorHandler — header Retry-After cho 429", () => {
  it("AppError 429 có details.retryAfterSeconds ⇒ header Retry-After (làm tròn lên), body giữ nguyên", async () => {
    const res = await request(
      appThrowing(() => new AppError("Bạn đã nhập sai quá nhiều lần", 429, ErrorCode.RATE_002, { retryAfterSeconds: 899.2 }))
    ).get("/boom");

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("900");
    expect(res.body.error).toMatchObject({ code: "RATE_002", details: { retryAfterSeconds: 899.2 } });
  });

  it("ScopeRateLimitError (scopeLimiter) cũng có Retry-After", async () => {
    const res = await request(appThrowing(() => new ScopeRateLimitError(42))).get("/boom");

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("42");
  });

  it.each([
    ["429 không có details", () => new AppError("chậm lại", 429, ErrorCode.RATE_002)],
    ["429 với retryAfterSeconds không hợp lệ (0)", () => new AppError("chậm lại", 429, ErrorCode.RATE_002, { retryAfterSeconds: 0 })],
    ["429 với retryAfterSeconds là chuỗi", () => new AppError("chậm lại", 429, ErrorCode.RATE_002, { retryAfterSeconds: "30" })],
    ["lỗi khác 429 dù có retryAfterSeconds", () => new ValidationError("sai dữ liệu", { retryAfterSeconds: 30 })],
  ])("%s ⇒ KHÔNG đặt Retry-After", async (_name, make) => {
    const res = await request(appThrowing(make)).get("/boom");

    expect(res.headers["retry-after"]).toBeUndefined();
  });
});
