/**
 * Chốt an toàn cho test GHI/XOÁ dữ liệu (`deleteMany({})` ở `afterEach`): chỉ được chạy trên Mongo memory replset do
 * `src/tests/global-setup.ts` khởi động khi `TEST_DB=memory`.
 *
 * - Không set `TEST_DB=memory` ⇒ `describeMemoryDb` = `describe.skip` (không đụng DB nào, kể cả `DATABASE_URL` trong `.env`
 *   — thường là cụm MongoDB thật của người dùng).
 * - Set nhưng `DATABASE_URL` không phải loopback (cấu hình sai) ⇒ `assertMemoryDatabase()` ném lỗi TRƯỚC khi test nào ghi/xoá.
 *
 * Mẫu giống `live-quiz.persistence.test.ts` (`describeDb` + kiểm loopback).
 */
export const describeMemoryDb: jest.Describe = process.env.TEST_DB === "memory" ? describe : describe.skip;

export function assertMemoryDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) {
    throw new Error("Từ chối chạy: DATABASE_URL không phải Mongo memory (loopback) — chạy bằng TEST_DB=memory");
  }
}
