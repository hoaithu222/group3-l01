/**
 * `validate-runtime.ts` đọc `FEATURE_FLAGS`/`env` một lần lúc module được
 * require (qua `constants/modules.ts`) — mỗi test phải `jest.resetModules()`
 * rồi `require` lại sau khi đổi `process.env.FEATURE_FLAGS` để nạp lại cờ.
 */
describe("validateRuntime", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // "Thiếu LIVEKIT_*" là tiền đề của các ca voice/meeting bên dưới — đặt TƯỜNG MINH (chuỗi rỗng, không xoá: xoá thì Prisma nạp lại từ `be/.env`
    // khi có module khởi tạo PrismaClient) thay vì trông vào môi trường của người chạy. Ca nào cần LiveKit tự đặt lại (xem ca pomodoro).
    for (const key of ["LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) process.env[key] = "";
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("FEATURE_FLAGS=ai=true → lỗi 'AI đang tạm dừng' (D-13)", () => {
    process.env.FEATURE_FLAGS = "ai=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks).toContainEqual(
      expect.objectContaining({ level: "error", message: expect.stringContaining("AI đang tạm dừng") })
    );
  });

  it("FEATURE_FLAGS=voice=true thiếu LIVEKIT_* → lỗi", () => {
    process.env.FEATURE_FLAGS = "voice=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(
      checks.some((c) => c.level === "error" && c.message.includes("LIVEKIT"))
    ).toBe(true);
  });

  it("CFG-01 (p0-07): cờ env bật module chưa available (vd custom-roles; p7-03 đã đưa burnout vào AVAILABLE_MODULES) → CẢNH BÁO, không lỗi, coi như tắt", () => {
    process.env.FEATURE_FLAGS = "custom-roles=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks).toContainEqual(
      expect.objectContaining({ level: "warn", message: expect.stringContaining('"custom-roles"') })
    );
    expect(checks.some((c) => c.level === "error")).toBe(false);
  });

  it("CFG-02 (p0-07): push=true (module có mã, AVAILABLE_MODULES) không cảnh báo 'chưa có mã'", () => {
    process.env.FEATURE_FLAGS = "push=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks.some((c) => c.message.includes("chưa có mã"))).toBe(false);
  });

  it("meeting=true thiếu LIVEKIT_* → lỗi (cùng nhánh với voice)", () => {
    process.env.FEATURE_FLAGS = "meeting=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks.some((c) => c.level === "error" && c.message.includes("LIVEKIT"))).toBe(true);
  });

  it("p5-02: pomodoro=true mà voice tắt → lỗi 'pomodoro cần bật voice'; bật cả hai (có LIVEKIT_*) thì không lỗi cờ này", () => {
    process.env.FEATURE_FLAGS = "pomodoro=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    expect(validateRuntime()).toContainEqual(expect.objectContaining({ level: "error", message: expect.stringContaining("pomodoro cần bật voice") }));

    jest.resetModules();
    process.env.FEATURE_FLAGS = "voice=true,pomodoro=true";
    process.env.LIVEKIT_URL = "http://localhost:7880";
    process.env.LIVEKIT_PUBLIC_URL = "ws://localhost:7880";
    process.env.LIVEKIT_API_KEY = "devkey";
    process.env.LIVEKIT_API_SECRET = "devsecretdevsecretdevsecretdevsecret1234";
    const again = require("../validate-runtime") as typeof import("../validate-runtime");
    expect(again.validateRuntime().some((c) => c.message.includes("pomodoro cần bật voice"))).toBe(false);
  });

  it("khoá lạ trong FEATURE_FLAGS → cảnh báo, không lỗi vì khoá đó", () => {
    process.env.FEATURE_FLAGS = "khoa-la=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(
      checks.some((c) => c.level === "warn" && c.message.includes('"khoa-la"'))
    ).toBe(true);
  });

  it("không cờ nào bật → không có lỗi cấu hình nào", () => {
    delete process.env.FEATURE_FLAGS;
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks.some((c) => c.level === "error")).toBe(false);
  });

  it("p0-05: PROCESS_ROLE=api KHÔNG cảnh báo thiếu sharp (không xử lý media)", () => {
    process.env.PROCESS_ROLE = "api";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks.some((c) => c.message.includes("sharp"))).toBe(false);
  });

  it("p0-05: worker (PROCESS_ROLE=all mặc định test) với sharp cài sẵn → không cảnh báo", () => {
    // Môi trường test luôn cài `sharp` thật (package.json dependencies) —
    // đảm bảo require.resolve("sharp") thành công, không cảnh báo giả.
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    expect(checks.some((c) => c.message.includes("sharp"))).toBe(false);
  });
});

/** p0-08 — kiểm chéo cờ voice/meeting ↔ env LiveKit (MED-08) và cấu hình spike. */
describe("validateRuntime — media LiveKit (p0-08)", () => {
  const ORIGINAL_ENV = process.env;
  const LIVEKIT_FULL = {
    LIVEKIT_URL: "http://livekit:7880",
    LIVEKIT_API_KEY: "APIkey",
    LIVEKIT_API_SECRET: "secret-secret-secret-secret-1234",
  };
  const PRODUCTION = {
    NODE_ENV: "production",
    JWT_SECRET: "j".repeat(40),
    JWT_REFRESH_SECRET: "r".repeat(40),
    ENCRYPTION_KEY: "a".repeat(64),
    DATABASE_URL: "mongodb://localhost:27017/x",
    ALLOWED_ORIGINS: "https://app.example.com",
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const k of ["LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "MEDIA_SPIKE_ENABLED", "FEATURE_FLAGS"]) {
      delete process.env[k];
    }
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const run = () => (require("../validate-runtime") as typeof import("../validate-runtime")).validateRuntime();
  const errors = (checks: ReturnType<typeof run>) => checks.filter((c) => c.level === "error").map((c) => c.message);

  it("MED-08: voice=true thiếu MỌI khoá LiveKit → LỖI khởi động, thông điệp nêu rõ tên biến", () => {
    process.env.FEATURE_FLAGS = "voice=true";
    expect(errors(run())).toContainEqual(expect.stringContaining("LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET"));
  });

  it("MED-08: voice=true thiếu riêng LIVEKIT_API_SECRET → lỗi", () => {
    process.env.FEATURE_FLAGS = "voice=true";
    Object.assign(process.env, { ...LIVEKIT_FULL, LIVEKIT_API_SECRET: "" });
    expect(errors(run()).some((m) => m.includes("LIVEKIT_API_SECRET"))).toBe(true);
  });

  it("voice=true đủ khoá + LIVEKIT_PUBLIC_URL → không lỗi LiveKit", () => {
    process.env.FEATURE_FLAGS = "voice=true";
    Object.assign(process.env, LIVEKIT_FULL, { LIVEKIT_PUBLIC_URL: "wss://lk.example.com" });
    expect(errors(run()).some((m) => m.includes("LIVEKIT"))).toBe(false);
  });

  it("dev: có LIVEKIT_URL mà thiếu LIVEKIT_PUBLIC_URL → chỉ CẢNH BÁO (suy từ LIVEKIT_URL), không lỗi", () => {
    process.env.FEATURE_FLAGS = "voice=true";
    Object.assign(process.env, LIVEKIT_FULL);
    const checks = run();
    expect(checks).toContainEqual(expect.objectContaining({ level: "warn", message: expect.stringContaining("LIVEKIT_PUBLIC_URL") }));
    expect(errors(checks).some((m) => m.includes("LIVEKIT"))).toBe(false);
  });

  it("production + meeting=true thiếu LIVEKIT_PUBLIC_URL → LỖI (URL nội bộ client không với tới)", () => {
    Object.assign(process.env, PRODUCTION, LIVEKIT_FULL, { FEATURE_FLAGS: "meeting=true" });
    expect(errors(run())).toContainEqual(expect.stringContaining("LIVEKIT_PUBLIC_URL"));
  });

  it("production, cờ voice/meeting TẮT, thiếu LIVEKIT_PUBLIC_URL → chỉ cảnh báo", () => {
    Object.assign(process.env, PRODUCTION, LIVEKIT_FULL);
    const checks = run();
    expect(errors(checks).some((m) => m.includes("LIVEKIT"))).toBe(false);
    expect(checks.some((c) => c.level === "warn" && c.message.includes("LIVEKIT_PUBLIC_URL"))).toBe(true);
  });

  it("production: LIVEKIT_PUBLIC_URL không phải wss:// → cảnh báo", () => {
    Object.assign(process.env, PRODUCTION, LIVEKIT_FULL, { LIVEKIT_PUBLIC_URL: "ws://lk.example.com" });
    expect(run().some((c) => c.level === "warn" && c.message.includes("wss://"))).toBe(true);
  });

  it("production + MEDIA_SPIKE_ENABLED=true → LỖI (endpoint spike chỉ dev/staging)", () => {
    Object.assign(process.env, PRODUCTION, { MEDIA_SPIKE_ENABLED: "true" });
    expect(errors(run())).toContainEqual(expect.stringContaining("MEDIA_SPIKE_ENABLED"));
  });

  it("dev + MEDIA_SPIKE_ENABLED=true → không lỗi", () => {
    process.env.MEDIA_SPIKE_ENABLED = "true";
    expect(errors(run()).some((m) => m.includes("MEDIA_SPIKE_ENABLED"))).toBe(false);
  });

  it("chuỗi rỗng trong .env (LIVEKIT_PUBLIC_URL=) coi như chưa đặt — không làm hỏng parse env", () => {
    Object.assign(process.env, LIVEKIT_FULL, { LIVEKIT_PUBLIC_URL: "" });
    expect(() => run()).not.toThrow();
  });
});
