import { DEV_ONLY_ENV_KEYS, neutralizeDeveloperEnv } from "./global-setup";

/**
 * Chốt môi trường của jest `globalSetup` (xem chú thích trên `neutralizeDeveloperEnv`): test không được phụ thuộc `be/.env` của người
 * chạy. `.env` dev bật `FEATURE_FLAGS`/`LIVEKIT_*` làm các test giả định "cờ tắt / thiếu LiveKit" đỏ ở máy dev nhưng xanh ở CI.
 */
describe("neutralizeDeveloperEnv", () => {
  it("đặt mọi khoá 'bật dịch vụ ngoài/cờ tính năng' về chuỗi rỗng (không xoá: xoá thì Prisma nạp lại từ .env)", () => {
    const env: NodeJS.ProcessEnv = {
      FEATURE_FLAGS: "communication=true,voice=true",
      LIVEKIT_URL: "http://localhost:7880",
      LIVEKIT_API_KEY: "devkey",
      LIVEKIT_API_SECRET: "devsecret",
      FIREBASE_CREDENTIALS_JSON: "firebase-adminsdk.json",
      SMTP_HOST: "smtp.example.com",
      SENTRY_DSN: "https://x@sentry.io/1",
      PORT: "3000",
    };

    const changed = neutralizeDeveloperEnv(env);

    for (const key of DEV_ONLY_ENV_KEYS) expect(env[key]).toBe("");
    expect(Object.prototype.hasOwnProperty.call(env, "FEATURE_FLAGS")).toBe(true);
    expect(changed).toBe(DEV_ONLY_ENV_KEYS.length);
    // Khoá không thuộc danh sách thì không đụng tới.
    expect(env.PORT).toBe("3000");
  });

  it("STORAGE_TYPE luôn về local (test không bao giờ chạm Cloudinary/S3 thật)", () => {
    const env: NodeJS.ProcessEnv = { STORAGE_TYPE: "cloudinary" };
    neutralizeDeveloperEnv(env);
    expect(env.STORAGE_TYPE).toBe("local");
  });

  it("idempotent: chạy lần 2 không đổi gì", () => {
    const env: NodeJS.ProcessEnv = { FEATURE_FLAGS: "push=true" };
    neutralizeDeveloperEnv(env);
    expect(neutralizeDeveloperEnv(env)).toBe(0);
  });

  it("mọi khoá trong danh sách đều được `env.schema` chấp nhận khi rỗng (khoá .url()/enum/number làm loadEnv() ném lỗi và sập cả file test)", () => {
    const saved = { ...process.env };
    try {
      neutralizeDeveloperEnv(process.env);
      expect(() => {
        jest.isolateModules(() => {
          require("../core/config/env.schema");
        });
      }).not.toThrow();
    } finally {
      process.env = saved;
    }
  });
});

describe("môi trường của tiến trình jest này", () => {
  const untouched = ["FEATURE_FLAGS", "LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "FIREBASE_CREDENTIALS_JSON"] as const;

  it("FEATURE_FLAGS/LIVEKIT_*/FIREBASE_* rỗng dù be/.env có bật", () => {
    for (const key of untouched) expect(process.env[key] ?? "").toBe("");
  });

  it("bất biến cơ chế nạp: khởi tạo PrismaClient (Prisma nạp be/.env, không ghi đè biến đã có) KHÔNG làm các khoá đó sống lại", () => {
    jest.isolateModules(() => {
      const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
      // Không kết nối (Prisma kết nối lười) — chỉ để kích hoạt bước nạp `.env` trong constructor.
      new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "mongodb://127.0.0.1:1/superapp_test_blocked" } } });
    });
    for (const key of untouched) expect(process.env[key] ?? "").toBe("");
  });
});
