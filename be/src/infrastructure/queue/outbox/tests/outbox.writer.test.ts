/**
 * `queueConnection` (ioredis) dùng `maxRetriesPerRequest: null` — lệnh KHÔNG
 * tự reject khi Redis mất kết nối, nó treo chờ reconnect vô thời hạn. Test
 * này khoá lại hành vi bắt buộc: `outboxSignal()` phải LUÔN trả về trong một
 * mốc thời gian cố định, kể cả khi `publish()` không bao giờ resolve/reject —
 * nếu thiếu timeout, `await outboxSignal()` (gọi đồng bộ trong
 * `withTransaction`, trên đường xử lý request) sẽ treo request mãi mãi.
 */
const mockPublish = jest.fn();
const mockOn = jest.fn();
const mockDuplicate = jest.fn();

jest.mock("../../queue.client", () => ({
  queueConnection: { duplicate: () => mockDuplicate() },
}));

import { outboxSignal } from "../outbox.writer";

describe("outboxSignal", () => {
  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá SẠCH implementation trước MỖI
    // test, kể cả implementation gán lúc khai báo `jest.fn(() => ...)` —
    // phải gán lại ở đây, không chỉ `mockClear()` (xem `cron.registry.test.ts`).
    mockPublish.mockImplementation(() => new Promise<never>(() => undefined)); // không bao giờ resolve/reject
    mockOn.mockImplementation(() => undefined);
    mockDuplicate.mockImplementation(() => ({ publish: mockPublish, on: mockOn }));
  });

  it("trả về trong ~1s dù publish() treo vô hạn (Redis mất kết nối)", async () => {
    const startedAt = Date.now();
    await outboxSignal();
    const elapsedMs = Date.now() - startedAt;

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeLessThan(1500);
  }, 3000);
});
