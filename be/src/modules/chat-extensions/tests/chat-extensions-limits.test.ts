/**
 * Unit — `getChatExtLimits` (p7-04 be.md §9): mặc định = `LIMITS.*`, chỉ nhận override số hữu hạn ở các khoá được phép (registry), các trường bất biến giao thức không đổi được,
 * lỗi đọc cấu hình → mặc định cứng (không làm hỏng thao tác chat).
 */
import { LIMITS } from "../../../core/constants/limits";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { getChatExtLimits } from "../services/chat-extensions-limits";

jest.mock("../../../core/config/runtime-config", () => ({ runtimeConfig: { getEffective: jest.fn() } }));

const getEffective = runtimeConfig.getEffective as jest.Mock;

it("mặc định (chưa override) = LIMITS", async () => {
  getEffective.mockResolvedValue({});
  const l = await getChatExtLimits();
  expect(l.poll).toMatchObject({ optionsMin: 2, optionsMax: 10, questionMax: 300, optionMax: 100, closesInMaxDays: 30 });
  expect(l.scheduled).toMatchObject({ pendingPerUserMax: 50, sendAtMaxDays: 30, minLeadSeconds: 60 });
  expect(l.reminder).toMatchObject({ pendingPerUserMax: 100, remindAtMaxDays: 365, minLeadSeconds: 60 });
});

it("override hợp lệ áp dụng; giá trị hỏng (chuỗi/NaN) và khoá không được phép bị bỏ qua", async () => {
  getEffective.mockImplementation(async (key: string) => {
    if (key === "limits.poll") return { optionsMax: 6, questionMax: "abc", optionsMin: 1, closeMinLeadSeconds: 0 };
    if (key === "limits.scheduledMessage") return { pendingPerUserMax: 5, minLeadSeconds: 0 };
    return { remindAtMaxDays: Number.NaN, pendingPerUserMax: 20 };
  });
  const l = await getChatExtLimits();
  expect(l.poll.optionsMax).toBe(6);
  expect(l.poll.questionMax).toBe(LIMITS.poll.questionMax);
  expect(l.poll.optionsMin).toBe(LIMITS.poll.optionsMin);
  expect(l.poll.closeMinLeadSeconds).toBe(LIMITS.poll.closeMinLeadSeconds);
  expect(l.scheduled.pendingPerUserMax).toBe(5);
  expect(l.scheduled.minLeadSeconds).toBe(LIMITS.scheduledMessage.minLeadSeconds);
  expect(l.reminder.pendingPerUserMax).toBe(20);
  expect(l.reminder.remindAtMaxDays).toBe(LIMITS.reminder.remindAtMaxDays);
});

it("lỗi đọc SystemConfig → dùng mặc định cứng", async () => {
  getEffective.mockRejectedValue(new Error("Redis/DB lỗi"));
  const l = await getChatExtLimits();
  expect(l.poll.optionsMax).toBe(LIMITS.poll.optionsMax);
  expect(l.scheduled.pendingPerUserMax).toBe(LIMITS.scheduledMessage.pendingPerUserMax);
});
