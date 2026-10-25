/**
 * Sentry (p0-11): thiếu DSN ⇒ NO-OP TUYỆT ĐỐI (không nạp SDK, giữ ConsoleTracker); có DSN ⇒ init đúng tuỳ chọn + `SentryTracker` gắn requestId/userId, bỏ lỗi 4xx, và
 * `beforeSend` là chốt che dữ liệu nhạy cảm. SDK được mock — không gọi mạng.
 */
const envState: Record<string, unknown> = {};

jest.mock("../../../core/config", () => ({ env: envState }));

const sdk = {
  init: jest.fn(),
  flush: jest.fn(),
  withScope: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
};
// Đếm số lần SDK được NẠP (module registry giữ lại giữa các test nên ca "thiếu DSN" phải chạy TRƯỚC các ca có DSN).
let sdkLoads = 0;
jest.mock("@sentry/node", () => {
  sdkLoads += 1;
  return sdk;
});

import { AppError, NotFoundError } from "../../../core/exceptions";
import { ConsoleTracker } from "../../error-tracker/console-tracker";
import { getErrorTracker, setErrorTracker } from "../../error-tracker";
import { FILTERED } from "../scrub";
import { flushObservability, initSentry, isSentryActive, resetSentryForTests, SentryTracker } from "../sentry";

function scopeMock() {
  return { setTag: jest.fn(), setUser: jest.fn(), setContext: jest.fn(), setExtra: jest.fn() };
}

beforeEach(() => {
  for (const key of Object.keys(envState)) delete envState[key];
  Object.assign(envState, { SENTRY_ENVIRONMENT: "staging", SENTRY_TRACES_SAMPLE_RATE: 0.2, INSTANCE_ID: "api-1", PROCESS_ROLE: "api" });
  resetSentryForTests();
  setErrorTracker(new ConsoleTracker());
  sdk.init.mockReset();
  sdk.flush.mockReset().mockResolvedValue(true);
  sdk.withScope.mockReset();
  sdk.captureException.mockReset();
  sdk.captureMessage.mockReset();
  sdk.setUser.mockReset();
});

describe("initSentry — thiếu DSN", () => {
  it("không nạp SDK, không đổi tracker, không init", () => {
    expect(initSentry()).toBe(false);
    expect(isSentryActive()).toBe(false);
    expect(sdkLoads).toBe(0);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(getErrorTracker()).toBeInstanceOf(ConsoleTracker);
  });

  it("flushObservability trả về ngay, không gọi SDK", async () => {
    await expect(flushObservability(50)).resolves.toBeUndefined();
    expect(sdk.flush).not.toHaveBeenCalled();
  });
});

describe("initSentry — có DSN", () => {
  beforeEach(() => {
    envState.SENTRY_DSN = "https://public@o1.ingest.sentry.io/2";
    envState.SENTRY_RELEASE = "abc1234";
  });

  it("init với environment/release/sample rate, sendDefaultPii=false; thay tracker bằng SentryTracker", () => {
    expect(initSentry()).toBe(true);
    expect(sdkLoads).toBe(1);
    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@o1.ingest.sentry.io/2",
        environment: "staging",
        release: "abc1234",
        tracesSampleRate: 0.2,
        sendDefaultPii: false,
        serverName: "api-1",
      })
    );
    expect(isSentryActive()).toBe(true);
    expect(getErrorTracker()).toBeInstanceOf(SentryTracker);
  });

  it("gọi lần hai không init lại", () => {
    initSentry();
    initSentry();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("beforeSend/beforeSendTransaction/beforeBreadcrumb che dữ liệu nhạy cảm (OPS-01)", () => {
    initSentry();
    const options = sdk.init.mock.calls[0][0] as {
      beforeSend: (e: unknown) => { request: { headers: Record<string, string>; data: Record<string, unknown> } };
      beforeSendTransaction: (e: unknown) => { request: { headers: Record<string, string> } };
      beforeBreadcrumb: (b: unknown) => { data: Record<string, unknown> };
    };
    const request = { headers: { authorization: "Bearer x", cookie: "a=b" }, data: { password: "p", content: "riêng", ok: 1 } };
    const sent = options.beforeSend({ request });
    expect(sent.request.headers).toEqual({ authorization: FILTERED, cookie: FILTERED });
    expect(sent.request.data).toEqual({ password: FILTERED, content: FILTERED, ok: 1 });
    expect(options.beforeSendTransaction({ request: { headers: { authorization: "Bearer y" } } }).request.headers.authorization).toBe(FILTERED);
    expect(options.beforeBreadcrumb({ category: "http", data: { body: "x", url: "/a?token=1" } }).data).toEqual({ url: `/a?token=${encodeURIComponent(FILTERED)}` });
  });

  it("SDK ném lỗi lúc init → không sập, giữ ConsoleTracker", () => {
    sdk.init.mockImplementation(() => {
      throw new Error("Invalid Dsn");
    });
    expect(initSentry()).toBe(false);
    expect(getErrorTracker()).toBeInstanceOf(ConsoleTracker);
    expect(isSentryActive()).toBe(false);
  });

  it("flushObservability gọi SDK.flush với hạn; lỗi flush bị nuốt", async () => {
    initSentry();
    await flushObservability(1234);
    expect(sdk.flush).toHaveBeenCalledWith(1234);
    sdk.flush.mockRejectedValue(new Error("mạng"));
    await expect(flushObservability(10)).resolves.toBeUndefined();
  });
});

describe("SentryTracker", () => {
  const tracker = () => new SentryTracker(sdk as unknown as ConstructorParameters<typeof SentryTracker>[0]);
  const runScope = (scope: ReturnType<typeof scopeMock>) => sdk.withScope.mockImplementation((cb: (s: unknown) => void) => cb(scope));

  it("gắn requestId/userId/route + queue/job/jobId thành tag, url đã lọc query; KHÔNG gửi body/ip/user-agent", () => {
    const scope = scopeMock();
    runScope(scope);
    const error = new Error("boom");
    tracker().captureException(error, {
      requestId: "req-9",
      userId: "u-1",
      method: "POST",
      url: "/api/v1/x?token=secret&ok=1",
      body: { password: "p" },
      ip: "1.2.3.4",
      userAgent: "curl",
      queue: "push",
      job: "push.send",
      jobId: "j1",
      attemptsMade: 3,
    });
    expect(scope.setTag).toHaveBeenCalledWith("requestId", "req-9");
    expect(scope.setTag).toHaveBeenCalledWith("method", "POST");
    expect(scope.setTag).toHaveBeenCalledWith("queue", "push");
    expect(scope.setTag).toHaveBeenCalledWith("job", "push.send");
    expect(scope.setTag).toHaveBeenCalledWith("jobId", "j1");
    expect(scope.setUser).toHaveBeenCalledWith({ id: "u-1" });
    expect(scope.setContext).toHaveBeenCalledWith("request", { method: "POST", url: `/api/v1/x?token=${encodeURIComponent(FILTERED)}&ok=1` });
    expect(scope.setExtra).toHaveBeenCalledWith("attemptsMade", 3);
    const flat = JSON.stringify([scope.setTag.mock.calls, scope.setContext.mock.calls, scope.setExtra.mock.calls]);
    expect(flat).not.toContain("1.2.3.4");
    expect(flat).not.toContain("curl");
    expect(flat).not.toContain("password");
    expect(sdk.captureException).toHaveBeenCalledWith(error);
  });

  it("AppError 4xx không được gửi; AppError 5xx và lỗi lạ được gửi", () => {
    const scope = scopeMock();
    runScope(scope);
    tracker().captureException(new NotFoundError("x"));
    expect(sdk.captureException).not.toHaveBeenCalled();
    tracker().captureException(new AppError("phụ thuộc ngoài lỗi", 502));
    tracker().captureException(new Error("lạ"));
    expect(sdk.captureException).toHaveBeenCalledTimes(2);
  });

  it("setUser chỉ chuyển id (không email); captureMessage chuyển mức", () => {
    tracker().setUser({ id: "u7", email: "a@b.c" });
    expect(sdk.setUser).toHaveBeenCalledWith({ id: "u7" });
    tracker().captureMessage("chú ý", "warning");
    expect(sdk.captureMessage).toHaveBeenCalledWith("chú ý", "warning");
  });
});
