/**
 * Unit — `adapters/member-contact.port.impl.ts` (p1-02: `MemberCard.actions.canMessage/canCall` do server tính).
 * Mock đúng 3 phụ thuộc bên ngoài: điều kiện D-16 (`checkDirectEligibility`), cờ `voice` (runtime) và máy chủ media.
 */
const mockCheckDirectEligibility = jest.fn();
jest.mock("../services/eligibility.service", () => ({
  checkDirectEligibility: (...args: unknown[]) => mockCheckDirectEligibility(...args),
}));

const mockIsFeatureEnabled = jest.fn();
jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: { isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args) },
}));

const mockIsConfigured = jest.fn();
jest.mock("../../../infrastructure/media", () => ({
  getLiveKit: () => ({ isConfigured: () => mockIsConfigured() }),
}));

import { MemberContactPortImpl } from "../adapters/member-contact.port.impl";

describe("MemberContactPortImpl.evaluate", () => {
  const port = new MemberContactPortImpl();

  beforeEach(() => {
    mockCheckDirectEligibility.mockReset();
    mockIsFeatureEnabled.mockReset().mockResolvedValue(true);
    mockIsConfigured.mockReset().mockReturnValue(true);
  });

  it("đủ điều kiện D-16 + voice bật + LiveKit cấu hình → nhắn được và gọi được", async () => {
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
    expect(await port.evaluate("u1", "u2")).toEqual({ canMessage: true, canCall: true });
    expect(mockCheckDirectEligibility).toHaveBeenCalledWith("u1", "u2");
  });

  it.each(["BLOCKED", "NO_SHARED_WORKSPACE", "SELF"] as const)("không đủ điều kiện (%s) → cả hai cờ false, không tra cờ gọi", async (reason) => {
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: false, reason });
    expect(await port.evaluate("u1", "u2")).toEqual({ canMessage: false, canCall: false });
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  it("phân hệ gọi tắt → nhắn được nhưng KHÔNG gọi được", async () => {
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
    mockIsFeatureEnabled.mockResolvedValue(false);
    expect(await port.evaluate("u1", "u2")).toEqual({ canMessage: true, canCall: false });
  });

  it("chưa cấu hình máy chủ media → KHÔNG gọi được (giống CALL_012 ở calls.routes)", async () => {
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
    mockIsConfigured.mockReturnValue(false);
    expect(await port.evaluate("u1", "u2")).toEqual({ canMessage: true, canCall: false });
  });

  it("lỗi khi đọc cờ runtime → canCall=false, canMessage giữ nguyên (không 500)", async () => {
    mockCheckDirectEligibility.mockResolvedValue({ canMessage: true, reason: null });
    mockIsFeatureEnabled.mockRejectedValue(new Error("redis down"));
    expect(await port.evaluate("u1", "u2")).toEqual({ canMessage: true, canCall: false });
  });
});
