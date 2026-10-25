import express from "express";
import request from "supertest";
import { errorHandler } from "../errorHandler";
import { requestIdMiddleware } from "../requestId";
import { AppError, BadGatewayError, NotFoundError, ValidationError } from "../../exceptions";
import { getErrorTracker, setErrorTracker, ConsoleTracker, type ErrorContext, type IErrorTracker } from "../../../infrastructure/error-tracker";

/**
 * p0-11 — `errorHandler` chỉ báo lên error tracker (Sentry) lỗi 5xx / lỗi lạ, KÈM `requestId`; lỗi nghiệp vụ 4xx là kết quả bình thường nên KHÔNG gửi.
 */
class RecordingTracker implements IErrorTracker {
  readonly captured: Array<{ error: Error; context?: ErrorContext }> = [];
  captureException(error: Error, context?: ErrorContext): void {
    this.captured.push({ error, context });
  }
}

function appThrowing(error: () => unknown) {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/boom", () => {
    throw error();
  });
  app.use(errorHandler);
  return app;
}

describe("errorHandler → error tracker", () => {
  let tracker: RecordingTracker;
  const original = getErrorTracker();

  beforeEach(() => {
    tracker = new RecordingTracker();
    setErrorTracker(tracker);
  });
  afterAll(() => setErrorTracker(original instanceof ConsoleTracker ? original : new ConsoleTracker()));

  it("lỗi lạ (500) được gửi, kèm requestId trùng header X-Request-ID và url/method", async () => {
    const res = await request(appThrowing(() => new Error("hỏng bất ngờ"))).get("/boom?x=1").set("X-Request-ID", "req-abc");

    expect(res.status).toBe(500);
    expect(tracker.captured).toHaveLength(1);
    expect(tracker.captured[0].error.message).toBe("hỏng bất ngờ");
    expect(tracker.captured[0].context).toMatchObject({ requestId: "req-abc", method: "GET", url: "/boom?x=1" });
  });

  it("AppError 5xx (502) cũng được gửi", async () => {
    const res = await request(appThrowing(() => new BadGatewayError("phụ thuộc ngoài lỗi"))).get("/boom");

    expect(res.status).toBe(502);
    expect(tracker.captured).toHaveLength(1);
    expect(tracker.captured[0].error).toBeInstanceOf(AppError);
  });

  it.each([
    ["404", () => new NotFoundError("không thấy")],
    ["400", () => new ValidationError("sai dữ liệu")],
    ["429", () => new AppError("chậm lại", 429)],
  ])("AppError %s KHÔNG được gửi", async (_name, make) => {
    await request(appThrowing(make)).get("/boom");

    expect(tracker.captured).toHaveLength(0);
  });
});
