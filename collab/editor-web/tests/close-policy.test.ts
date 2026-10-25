import { describe, expect, it } from "vitest";
import { backoffDelayMs, decideOnClose } from "../src/close-policy";

describe("decideOnClose — theo `reason` của server (README collab §3.4)", () => {
  it.each([
    ["unauthorized", { kind: "refresh-token" }],
    ["forbidden", { kind: "stop", code: "FORBIDDEN" }],
    ["not-found", { kind: "stop", code: "NOT_FOUND" }],
    ["too-many-connections", { kind: "backoff" }],
    ["rate-limited", { kind: "backoff" }],
    ["unavailable", { kind: "backoff" }],
    ["revoked", { kind: "reconnect", archived: false }],
    ["archived", { kind: "reconnect", archived: true }],
    ["auth-timeout", { kind: "reconnect", archived: false }],
    ["unsupported-message", { kind: "stop", code: "LOAD_FAILED" }],
    ["awareness-invalid", { kind: "stop", code: "LOAD_FAILED" }],
  ])("%s", (reason, expected) => {
    expect(decideOnClose({ reason })).toMatchObject(expected);
    // Đúng cả khi provider/proxy viết hoa hoặc thừa khoảng trắng (hocuspocus/common dùng "Forbidden", "Unauthorized").
    expect(decideOnClose({ reason: ` ${reason.toUpperCase()} ` })).toMatchObject(expected);
  });

  it("`reason` ưu tiên hơn mã đóng (revoked và forbidden cùng mã 4403)", () => {
    expect(decideOnClose({ reason: "revoked", code: 4403 })).toMatchObject({ kind: "reconnect" });
    expect(decideOnClose({ reason: "forbidden", code: 4403 })).toMatchObject({ kind: "stop", code: "FORBIDDEN" });
  });
});

describe("decideOnClose — chỉ có mã đóng", () => {
  it.each([
    [4400, { kind: "stop", code: "LOAD_FAILED" }],
    [4401, { kind: "refresh-token" }],
    [4403, { kind: "reconnect" }], // thiếu reason: nối lại để xác thực lại, lần sau server báo `forbidden` rõ ràng
    [4404, { kind: "stop", code: "NOT_FOUND" }],
    [4408, { kind: "reconnect" }],
    [4409, { kind: "reconnect", archived: true }],
    [4429, { kind: "backoff" }],
    [4503, { kind: "backoff" }],
    [1009, { kind: "stop", code: "TOO_LARGE" }],
  ])("mã %i", (code, expected) => {
    expect(decideOnClose({ code })).toMatchObject(expected);
  });

  it("lỗi mạng thường và lý do lạ → bỏ qua (provider tự nối lại)", () => {
    for (const info of [{ code: 1000 }, { code: 1001 }, { code: 1005 }, { code: 1006, reason: "" }, {}, { reason: "Failed to get token during sendToken(): Error" }]) {
      expect(decideOnClose(info)).toEqual({ kind: "ignore" });
    }
  });
});

describe("backoffDelayMs", () => {
  it("tăng gấp đôi từ 2 s, trần 30 s, nhiễu ≤ 20%", () => {
    const none = () => 0;
    const max = () => 1;
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => backoffDelayMs(n, none))).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(backoffDelayMs(1, max)).toBe(2400);
    expect(backoffDelayMs(9, max)).toBe(36000);
    expect(backoffDelayMs(0, none)).toBe(2000);
  });
});
