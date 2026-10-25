import { roomNames } from "../room-names";

describe("roomNames (p0-08 README §2 — MED-07)", () => {
  it("sinh tên phòng theo tiền tố call_/meet_/spike_", () => {
    expect(roomNames.call("66f1a2b3c4d5e6f708192a3b")).toBe("call_66f1a2b3c4d5e6f708192a3b");
    expect(roomNames.spike("demo-1")).toBe("spike_demo-1");
  });

  it("mã họp có gạch → bỏ gạch trong tên phòng", () => {
    expect(roomNames.meeting("abc-defg-hij")).toBe("meet_abcdefghij");
  });

  it("parse ngược từng loại", () => {
    expect(roomNames.parse("call_x1")).toEqual({ kind: "call", ref: "x1" });
    expect(roomNames.parse("meet_abcdefghij")).toEqual({ kind: "meeting", ref: "abcdefghij" });
    expect(roomNames.parse("spike_demo-1")).toEqual({ kind: "spike", ref: "demo-1" });
  });

  it("tiền tố lạ / tên rỗng / chỉ có tiền tố → unknown (nguyên tên làm ref)", () => {
    expect(roomNames.parse("abc")).toEqual({ kind: "unknown", ref: "abc" });
    expect(roomNames.parse("")).toEqual({ kind: "unknown", ref: "" });
    expect(roomNames.parse("call_")).toEqual({ kind: "unknown", ref: "call_" });
    expect(roomNames.parse("Call_x")).toEqual({ kind: "unknown", ref: "Call_x" });
  });

  it("id rỗng → ném lỗi (không sinh phòng 'call_')", () => {
    expect(() => roomNames.call("")).toThrow();
    expect(() => roomNames.meeting("---")).toThrow();
    expect(() => roomNames.spike("  ")).toThrow();
  });

  it("call(id) ↔ parse round-trip", () => {
    expect(roomNames.parse(roomNames.call("abc123"))).toEqual({ kind: "call", ref: "abc123" });
  });
});
