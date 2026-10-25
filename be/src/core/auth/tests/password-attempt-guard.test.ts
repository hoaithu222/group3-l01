import { PasswordAttemptGuard } from "../password-attempt-guard";
import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";

/** Redis giả có trạng thái + TTL theo `Date.now()` (đủ cho `incr/expire/set/get/del`). */
const data = new Map<string, { value: string; expiresAt: number | null }>();
let redisUp = true;

jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn() },
}));

function live(key: string) {
  const e = data.get(key);
  if (!e) return undefined;
  if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
    data.delete(key);
    return undefined;
  }
  return e;
}

function installRedis(): void {
  (redis.incr as jest.Mock).mockImplementation(async (key: string) => {
    if (!redisUp) return null;
    const prev = live(key);
    const next = Number(prev?.value ?? 0) + 1;
    data.set(key, { value: String(next), expiresAt: prev?.expiresAt ?? null });
    return next;
  });
  (redis.expire as jest.Mock).mockImplementation(async (key: string, ttl: number) => {
    const e = live(key);
    if (e) e.expiresAt = Date.now() + ttl * 1000;
  });
  (redis.set as jest.Mock).mockImplementation(async (key: string, value: unknown, ttl?: number) => {
    data.set(key, { value: String(value), expiresAt: ttl ? Date.now() + ttl * 1000 : null });
  });
  (redis.get as jest.Mock).mockImplementation(async (key: string) => {
    const e = live(key);
    if (!e) return null;
    try {
      return JSON.parse(e.value) as unknown;
    } catch {
      return e.value;
    }
  });
  (redis.del as jest.Mock).mockImplementation(async (key: string) => {
    data.delete(key);
  });
}

describe("PasswordAttemptGuard", () => {
  const EMAIL = "nguoi.dung@example.com";

  beforeEach(() => {
    data.clear();
    redisUp = true;
    installRedis();
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    jest.setSystemTime(new Date("2026-09-25T10:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("dưới ngưỡng ⇒ không khoá; chạm ngưỡng (5 lần sai) ⇒ justLocked đúng ở lần thứ 5 và assertNotLocked ném 429 RATE_002", async () => {
    const guard = new PasswordAttemptGuard("login");

    for (let i = 1; i <= 4; i++) {
      await expect(guard.recordFailure(EMAIL)).resolves.toEqual({ justLocked: false, retryAfterSeconds: 0 });
      await expect(guard.assertNotLocked(EMAIL)).resolves.toBeUndefined();
    }
    await expect(guard.recordFailure(EMAIL)).resolves.toEqual({ justLocked: true, retryAfterSeconds: 900 });

    await expect(guard.assertNotLocked(EMAIL)).rejects.toMatchObject({
      statusCode: 429,
      errorCode: "RATE_002",
      details: { retryAfterSeconds: 900 },
    });
  });

  it("khoá tự hết sau lockSeconds, thời gian còn lại giảm dần", async () => {
    const guard = new PasswordAttemptGuard("login", { maxFailures: 2, lockSeconds: 600 });
    await guard.recordFailure(EMAIL);
    await guard.recordFailure(EMAIL);

    jest.setSystemTime(Date.now() + 300_000);
    await expect(guard.assertNotLocked(EMAIL)).rejects.toMatchObject({ details: { retryAfterSeconds: 300 } });

    jest.setSystemTime(Date.now() + 301_000);
    await expect(guard.assertNotLocked(EMAIL)).resolves.toBeUndefined();
  });

  it("bộ đếm quay về 0 sau windowSeconds nếu chưa chạm ngưỡng", async () => {
    const guard = new PasswordAttemptGuard("login", { maxFailures: 3, windowSeconds: 60 });
    await guard.recordFailure(EMAIL);
    await guard.recordFailure(EMAIL);

    jest.setSystemTime(Date.now() + 61_000);
    const third = await guard.recordFailure(EMAIL); // cửa sổ mới: đây là lần sai thứ 1

    expect(third.justLocked).toBe(false);
  });

  it("reset() (đăng nhập thành công / đặt lại mật khẩu) xoá cả bộ đếm lẫn khoá", async () => {
    const guard = new PasswordAttemptGuard("login", { maxFailures: 2 });
    await guard.recordFailure(EMAIL);
    await guard.recordFailure(EMAIL);
    await expect(guard.assertNotLocked(EMAIL)).rejects.toBeDefined();

    await guard.reset(EMAIL);

    await expect(guard.assertNotLocked(EMAIL)).resolves.toBeUndefined();
    await expect(guard.recordFailure(EMAIL)).resolves.toMatchObject({ justLocked: false });
  });

  it("các scope độc lập: khoá đăng nhập không khoá luồng đổi mật khẩu của cùng định danh", async () => {
    const login = new PasswordAttemptGuard("login", { maxFailures: 1 });
    const reauth = new PasswordAttemptGuard("reauth", { maxFailures: 1 });

    await login.recordFailure(EMAIL);

    await expect(login.assertNotLocked(EMAIL)).rejects.toBeDefined();
    await expect(reauth.assertNotLocked(EMAIL)).resolves.toBeUndefined();
  });

  it("định danh khác nhau đếm riêng; khoá Redis dùng HASH (không chứa email thô)", async () => {
    const guard = new PasswordAttemptGuard("login", { maxFailures: 1 });

    await guard.recordFailure(EMAIL);

    await expect(guard.assertNotLocked("nguoi.khac@example.com")).resolves.toBeUndefined();
    const keys = [...data.keys()];
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => !k.includes("@") && !k.includes("nguoi.dung"))).toBe(true);
  });

  it("Redis không sẵn sàng (incr trả null) ⇒ FAIL-OPEN: không khoá, không ném lỗi, có cảnh báo", async () => {
    redisUp = false;
    const guard = new PasswordAttemptGuard("login", { maxFailures: 1 });

    await expect(guard.recordFailure(EMAIL)).resolves.toEqual({ justLocked: false, retryAfterSeconds: 0 });
    await expect(guard.assertNotLocked(EMAIL)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("Redis ném lỗi ⇒ vẫn fail-open, không làm hỏng luồng đăng nhập", async () => {
    (redis.incr as jest.Mock).mockRejectedValue(new Error("ECONNRESET"));
    (redis.get as jest.Mock).mockRejectedValue(new Error("ECONNRESET"));
    const guard = new PasswordAttemptGuard("login");

    await expect(guard.recordFailure(EMAIL)).resolves.toMatchObject({ justLocked: false });
    await expect(guard.assertNotLocked(EMAIL)).resolves.toBeUndefined();
    await expect(guard.reset(EMAIL)).resolves.toBeUndefined();
  });

  it("dùng mặc định từ LIMITS.auth.passwordAttempts (5 lần / 15 phút / khoá 15 phút)", async () => {
    const guard = new PasswordAttemptGuard("login");

    for (let i = 0; i < 4; i++) await guard.recordFailure(EMAIL);
    const fifth = await guard.recordFailure(EMAIL);

    expect(fifth).toEqual({ justLocked: true, retryAfterSeconds: 900 });
  });
});
