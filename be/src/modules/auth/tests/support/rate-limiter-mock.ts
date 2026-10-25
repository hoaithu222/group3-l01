/**
 * Bản giả của `core/middlewares/rateLimiter` cho test route auth/users: MỌI limiter là pass-through — các test luồng cần gọi
 * `/auth/login`… nhiều lần từ cùng một IP mà không bị 429 giữa chừng. Hành vi giới hạn tốc độ thật (tách theo endpoint,
 * `failedOnly`, khoá theo user, Redis/bộ nhớ) có test riêng ở `core/middlewares/tests/rate-limiter.test.ts`.
 *
 * Dùng: `jest.mock("<...>/core/middlewares/rateLimiter", () => require("<...>/support/rate-limiter-mock").passThroughRateLimiters())`.
 * Thêm limiter mới vào `rateLimiter.ts` ⇒ thêm tên vào đây (thiếu ⇒ route nhận `undefined` và Express ném lỗi lúc dựng router).
 */
const passThrough = (_req: unknown, _res: unknown, next: () => void): void => next();

export function passThroughRateLimiters(): Record<string, unknown> {
  return {
    globalLimiter: passThrough,
    authLimiter: passThrough,
    apiLimiter: passThrough,
    nonceLimiter: passThrough,
    createAuthLimiter: () => passThrough,
    loginLimiter: passThrough,
    biometricLoginLimiter: passThrough,
    registerLimiter: passThrough,
    forgotPasswordLimiter: passThrough,
    resetPasswordLimiter: passThrough,
    deleteCancelLimiter: passThrough,
    accountActionLimiter: passThrough,
  };
}
