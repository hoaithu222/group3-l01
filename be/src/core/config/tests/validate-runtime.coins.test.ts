/**
 * p7-02 be.md §9 — `validateRuntime`: bật `coins` mà `gamification` tắt → LỖI khởi động (thưởng xu đi theo `xp.awarded` của gamification). Cùng khuôn `validate-runtime.test.ts`:
 * `FEATURE_FLAGS` đọc một lần lúc nạp module nên mỗi ca `jest.resetModules()` rồi nạp lại sau khi đổi env.
 */
describe("validateRuntime — coins cần gamification", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const key of ["LIVEKIT_URL", "LIVEKIT_PUBLIC_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) process.env[key] = "";
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const run = async () => (await import("../validate-runtime")).validateRuntime();

  it("coins=true mà gamification tắt → lỗi nêu rõ cách bật", async () => {
    process.env.FEATURE_FLAGS = "coins=true";
    expect((await run()).some((c) => c.level === "error" && c.message.includes("coins cần bật gamification"))).toBe(true);
  });

  it("coins=true cùng gamification=true → không lỗi và không cảnh báo 'chưa có mã' (coins đã nằm trong AVAILABLE_MODULES)", async () => {
    process.env.FEATURE_FLAGS = "gamification=true,coins=true";
    const checks = await run();
    expect(checks.filter((c) => c.level === "error")).toEqual([]);
    expect(checks.some((c) => c.message.includes("chưa có mã"))).toBe(false);
  });

  it("chỉ gamification=true (coins tắt) → không lỗi liên quan coins", async () => {
    process.env.FEATURE_FLAGS = "gamification=true";
    expect((await run()).some((c) => c.message.includes("coins"))).toBe(false);
  });
});
