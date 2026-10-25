/**
 * p0-11 — `validateRuntime()` cho quan sát: dev-tools bị CẤM ở production thật (lỗi cứng); Sentry/METRICS_TOKEN chỉ CẢNH BÁO (không chặn khởi động).
 * Cùng mẫu với `validate-runtime.test.ts`: `jest.resetModules()` rồi `require` lại sau khi đổi `process.env`.
 */
describe("validateRuntime — quan sát (p0-11)", () => {
  const ORIGINAL_ENV = process.env;
  const PROD = {
    NODE_ENV: "production",
    JWT_SECRET: "x".repeat(40),
    JWT_REFRESH_SECRET: "y".repeat(40),
    ENCRYPTION_KEY: "a".repeat(64),
    DATABASE_URL: "mongodb://localhost/x",
    ALLOWED_ORIGINS: "https://a.test",
    SOCKET_ADAPTER: "redis",
  };

  function run(envOverrides: Record<string, string>) {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, FEATURE_FLAGS: "", ...envOverrides };
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    return validateRuntime();
  }

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("production thật + DEV_TOOLS_ENABLED=true → LỖI", () => {
    expect(run({ ...PROD, DEV_TOOLS_ENABLED: "true" })).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringContaining("DEV_TOOLS_ENABLED") }));
  });

  it("staging (NODE_ENV=production, SENTRY_ENVIRONMENT=staging) bật dev-tools → không lỗi", () => {
    const checks = run({ ...PROD, SENTRY_ENVIRONMENT: "staging", DEV_TOOLS_ENABLED: "true" });
    expect(checks.some((c) => c.message.includes("DEV_TOOLS_ENABLED"))).toBe(false);
  });

  it("dev bật dev-tools → không lỗi", () => {
    expect(run({ NODE_ENV: "development", DEV_TOOLS_ENABLED: "true" }).some((c) => c.message.includes("DEV_TOOLS_ENABLED"))).toBe(false);
  });

  it("production thiếu SENTRY_DSN → CẢNH BÁO (không lỗi); có DSN hợp lệ thì hết cảnh báo", () => {
    const missing = run({ ...PROD });
    expect(missing).toContainEqual(expect.objectContaining({ level: "warn", message: expect.stringContaining("SENTRY_DSN trống") }));
    expect(missing.some((c) => c.message.includes("SENTRY_DSN") && c.level === "error")).toBe(false);
    expect(run({ ...PROD, SENTRY_DSN: "https://pub@o1.ingest.sentry.io/2" }).some((c) => c.message.includes("SENTRY_DSN"))).toBe(false);
  });

  it("SENTRY_DSN rỗng (compose truyền `${SENTRY_DSN:-}`) coi như thiếu, không làm hỏng schema", () => {
    expect(run({ ...PROD, SENTRY_DSN: "" })).toContainEqual(expect.objectContaining({ level: "warn", message: expect.stringContaining("SENTRY_DSN trống") }));
  });

  it("SENTRY_DSN sai định dạng → cảnh báo (không sập khởi động)", () => {
    expect(run({ ...PROD, SENTRY_DSN: "khong-phai-url" })).toContainEqual(expect.objectContaining({ level: "warn", message: expect.stringContaining("không phải URL hợp lệ") }));
  });

  it("production thiếu METRICS_TOKEN → CẢNH BÁO (kế hoạch ghi error — hạ xuống vì /metrics đã tự chặn 401); có token thì hết cảnh báo", () => {
    const missing = run({ ...PROD });
    expect(missing).toContainEqual(expect.objectContaining({ level: "warn", message: expect.stringContaining("METRICS_TOKEN") }));
    expect(missing.some((c) => c.message.includes("METRICS_TOKEN") && c.level === "error")).toBe(false);
    expect(run({ ...PROD, METRICS_TOKEN: "t".repeat(24) }).some((c) => c.message.includes("METRICS_TOKEN"))).toBe(false);
  });
});
