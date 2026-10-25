/**
 * `getPushSender()` đọc `env.FIREBASE_*` một lần rồi memoize — mỗi test phải
 * `jest.resetModules()` rồi `require` lại sau khi đổi `process.env` (cùng
 * pattern với `core/config/tests/validate-runtime.test.ts`). Mock
 * `firebase-admin/app` để không khởi tạo app Firebase thật.
 */
jest.mock("firebase-admin/app", () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => ({ name: "push" })),
  cert: jest.fn((c: unknown) => c),
}));

describe("getPushSender", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    delete process.env.FIREBASE_CREDENTIALS_JSON;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("thiếu FIREBASE_* → NoopPushSender", () => {
    const { getPushSender } = require("../push.factory") as typeof import("../push.factory");
    const { NoopPushSender } = require("../noop-push.sender") as typeof import("../noop-push.sender");
    expect(getPushSender()).toBeInstanceOf(NoopPushSender);
  });

  it("đủ FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY → FirebasePushSender", () => {
    process.env.FIREBASE_PROJECT_ID = "demo";
    process.env.FIREBASE_CLIENT_EMAIL = "sa@demo.iam.gserviceaccount.com";
    process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n";
    const { getPushSender } = require("../push.factory") as typeof import("../push.factory");
    const { FirebasePushSender } = require("../firebase-push.sender") as typeof import("../firebase-push.sender");
    expect(getPushSender()).toBeInstanceOf(FirebasePushSender);
  });

  it("FIREBASE_CREDENTIALS_JSON không parse được → NoopPushSender, không throw", () => {
    process.env.FIREBASE_CREDENTIALS_JSON = "{not-json";
    const { getPushSender } = require("../push.factory") as typeof import("../push.factory");
    const { NoopPushSender } = require("../noop-push.sender") as typeof import("../noop-push.sender");
    expect(() => getPushSender()).not.toThrow();
    expect(getPushSender()).toBeInstanceOf(NoopPushSender);
  });

  it("gọi hai lần trả cùng instance (memoized)", () => {
    const { getPushSender } = require("../push.factory") as typeof import("../push.factory");
    expect(getPushSender()).toBe(getPushSender());
  });
});
