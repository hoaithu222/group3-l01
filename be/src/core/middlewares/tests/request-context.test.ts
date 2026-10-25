import express from "express";
import request from "supertest";
import { getRequestContext, requestContextMiddleware, runWithRequestContext } from "../request-context";
import { requestIdMiddleware } from "../requestId";

/**
 * p0-11 — ngữ cảnh request (AsyncLocalStorage): handler/service phía sau (kể cả sau `await`, sau body parser) thấy đúng `requestId`; `userId` đọc lười từ `req.user`.
 */
describe("requestContextMiddleware", () => {
  function buildApp() {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(express.json()); // body parser TRƯỚC ngữ cảnh — đúng thứ tự trong app.ts
    app.use(requestContextMiddleware);
    // Giả lập authenticateToken chạy SAU khi ngữ cảnh đã mở.
    app.use((req, _res, next) => {
      req.user = { id: "user-42" } as Express.Request["user"];
      next();
    });
    app.post("/echo", async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 5)); // đi qua một biên bất đồng bộ
      const ctx = getRequestContext();
      res.json({ requestId: ctx?.requestId, userId: ctx?.userId });
    });
    return app;
  }

  it("requestId của request hiện hành + userId (getter đọc req.user lúc gọi) có mặt sau await", async () => {
    const res = await request(buildApp()).post("/echo").set("X-Request-ID", "req-777").send({ a: 1 });

    expect(res.body).toEqual({ requestId: "req-777", userId: "user-42" });
  });

  it("hai request đồng thời không lẫn ngữ cảnh", async () => {
    const app = buildApp();
    const [a, b] = await Promise.all([
      request(app).post("/echo").set("X-Request-ID", "A").send({}),
      request(app).post("/echo").set("X-Request-ID", "B").send({}),
    ]);

    expect(a.body.requestId).toBe("A");
    expect(b.body.requestId).toBe("B");
  });

  it("ngoài request thì không có ngữ cảnh; runWithRequestContext mở ngữ cảnh thủ công", () => {
    expect(getRequestContext()).toBeUndefined();
    const seen = runWithRequestContext({ requestId: "manual" }, () => getRequestContext()?.requestId);
    expect(seen).toBe("manual");
    expect(getRequestContext()).toBeUndefined();
  });
});
