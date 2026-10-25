import { BLOCKED_DATABASE_URL, guardAgainstRealDatabase } from "./global-setup";

/**
 * Chốt an toàn của jest `globalSetup` (xem chú thích đầu `global-setup.ts`): thiếu `TEST_DB=memory` thì `DATABASE_URL` phải bị
 * chặn để không test nào lỡ đọc/ghi/xoá DB thật (sự cố 2026-09-25: `--selectProjects unit` chạy nguyên project trên Atlas).
 */
const ATLAS = "mongodb+srv://user:secret@cluster0.example.mongodb.net/mydb?retryWrites=true";

describe("guardAgainstRealDatabase", () => {
  it("không có TEST_DB ⇒ DATABASE_URL trỏ Atlas bị đổi sang địa chỉ chặn", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: ATLAS };

    expect(guardAgainstRealDatabase(env)).toBe(true);
    expect(env.DATABASE_URL).toBe(BLOCKED_DATABASE_URL);
    expect(env.DATABASE_URL).not.toContain("mongodb.net");
  });

  it("không có DATABASE_URL trong môi trường (sẽ nạp từ .env) vẫn bị chặn", () => {
    const env: NodeJS.ProcessEnv = {};

    expect(guardAgainstRealDatabase(env)).toBe(true);
    expect(env.DATABASE_URL).toBe(BLOCKED_DATABASE_URL);
  });

  it("TEST_DB=memory ⇒ không đụng DATABASE_URL (globalSetup tự ghi đè bằng Mongo memory)", () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: ATLAS, TEST_DB: "memory" };

    expect(guardAgainstRealDatabase(env)).toBe(false);
    expect(env.DATABASE_URL).toBe(ATLAS);
  });

  it("ALLOW_REAL_DB_TESTS=1 (cố ý, DB riêng cho test) ⇒ giữ nguyên", () => {
    const env: NodeJS.ProcessEnv = {
      ALLOW_REAL_DB_TESTS: "1",
      DATABASE_URL: "mongodb://127.0.0.1:27017/test",
    };

    expect(guardAgainstRealDatabase(env)).toBe(false);
    expect(env.DATABASE_URL).toBe("mongodb://127.0.0.1:27017/test");
  });

  it("chỉ đúng giá trị '1' mới là đồng ý; 'true'/'yes' thì vẫn chặn", () => {
    for (const value of ["true", "yes", "0", ""]) {
      const env: NodeJS.ProcessEnv = { ALLOW_REAL_DB_TESTS: value, DATABASE_URL: ATLAS };
      expect(guardAgainstRealDatabase(env)).toBe(true);
    }
  });

  it("địa chỉ chặn là loopback (khớp chốt `assertMemoryDatabase` của các suite ghi/xoá DB)", () => {
    expect(BLOCKED_DATABASE_URL).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/);
  });

  it("bất biến end-to-end: trong tiến trình jest này DATABASE_URL luôn là loopback (Mongo memory hoặc địa chỉ chặn)", () => {
    // Khi CỐ Ý dùng DB riêng cho test (`ALLOW_REAL_DB_TESTS=1`) thì bỏ qua — đó là quyết định của người chạy.
    if (process.env.ALLOW_REAL_DB_TESTS === "1") return;

    expect(process.env.DATABASE_URL ?? "").toMatch(
      /^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/
    );
  });
});
