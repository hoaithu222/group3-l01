/**
 * p0-11 OPS-01 — `POST /dev/sentry-test`: chỉ hoạt động khi DEV_TOOLS_ENABLED và KHÔNG phải production thật; lỗi ném ra đi qua errorHandler → error tracker kèm requestId.
 * Router được dựng với middleware xác thực GIẢ (không cần JWT/DB) — quyền `system-config:update` do `requirePermission` (đã có test riêng) đảm nhận.
 * Env đọc MỘT lần lúc import ⇒ mỗi ca `jest.resetModules()` rồi nạp lại TẤT CẢ module liên quan từ cùng một registry (lớp lỗi `AppError` phải cùng danh tính).
 */
import express, { type RequestHandler, type Router } from "express";
import request from "supertest";
import type { ErrorContext, IErrorTracker } from "../../../infrastructure/error-tracker";

const ORIGINAL_ENV = process.env;
const captured: Array<{ error: Error; context?: ErrorContext }> = [];
const tracker: IErrorTracker = {
  captureException: (error, context) => {
    captured.push({ error, context });
  },
};

const PROD = {
  NODE_ENV: "production",
  JWT_SECRET: "x".repeat(40),
  JWT_REFRESH_SECRET: "y".repeat(40),
  ENCRYPTION_KEY: "a".repeat(64),
  DATABASE_URL: "mongodb://localhost/x",
  ALLOWED_ORIGINS: "https://a.test",
};

function load(envOverrides: Record<string, string>) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, NODE_ENV: "test", ...envOverrides };
  const devTools = require("../dev-tools.routes") as typeof import("../dev-tools.routes");
  const middlewares = require("../../../core/middlewares") as typeof import("../../../core/middlewares");
  const errorTracker = require("../../../infrastructure/error-tracker") as typeof import("../../../infrastructure/error-tracker");
  errorTracker.setErrorTracker(tracker);
  const appWith = (routes: Router) => {
    const app = express();
    app.use(middlewares.requestIdMiddleware);
    app.use("/api/v1/dev/sentry-test", routes);
    app.use(middlewares.notFoundHandler);
    app.use(middlewares.errorHandler);
    return app;
  };
  return { ...devTools, appWith };
}

const fakeAuth: RequestHandler = (_req, _res, next) => next();

describe("dev-tools /sentry-test", () => {
  beforeEach(() => {
    captured.length = 0;
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("bật (DEV_TOOLS_ENABLED=true, không production): ném lỗi thử → 500 SYS_500 và tracker nhận lỗi kèm requestId", async () => {
    const { createDevToolsRouter, isDevToolsEnabled, appWith } = load({ DEV_TOOLS_ENABLED: "true" });
    expect(isDevToolsEnabled()).toBe(true);

    const res = await request(appWith(createDevToolsRouter([fakeAuth]))).post("/api/v1/dev/sentry-test").set("X-Request-ID", "req-ops01");

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("SYS_500");
    expect(res.body.requestId).toBe("req-ops01");
    expect(captured).toHaveLength(1);
    expect(captured[0].error.message).toContain("sentry-test");
    expect(captured[0].context).toMatchObject({ requestId: "req-ops01", method: "POST" });
  });

  it("chưa bật (mặc định) → 404 như chưa từng tồn tại, KHÔNG gọi xác thực, không có sự kiện", async () => {
    const { createDevToolsRouter, isDevToolsEnabled, appWith } = load({});
    expect(isDevToolsEnabled()).toBe(false);
    const auth = jest.fn<void, Parameters<RequestHandler>>((_req, _res, next) => next());

    const res = await request(appWith(createDevToolsRouter([auth]))).post("/api/v1/dev/sentry-test");

    expect(res.status).toBe(404);
    expect(auth).not.toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it("production THẬT (NODE_ENV=production, SENTRY_ENVIRONMENT mặc định) → 404 dù DEV_TOOLS_ENABLED=true", async () => {
    const { createDevToolsRouter, isDevToolsEnabled, appWith } = load({ ...PROD, DEV_TOOLS_ENABLED: "true" });
    expect(isDevToolsEnabled()).toBe(false);

    const res = await request(appWith(createDevToolsRouter([fakeAuth]))).post("/api/v1/dev/sentry-test");

    expect(res.status).toBe(404);
    expect(captured).toHaveLength(0);
  });

  it("staging (NODE_ENV=production + SENTRY_ENVIRONMENT=staging) → bật được", () => {
    const { isDevToolsEnabled } = load({ ...PROD, SENTRY_ENVIRONMENT: "staging", DEV_TOOLS_ENABLED: "true" });
    expect(isDevToolsEnabled()).toBe(true);
  });
});
