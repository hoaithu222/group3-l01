import { maskPhone, normalizePhone } from "../phone";

describe("normalizePhone — số Việt Nam", () => {
  it.each([
    ["0912345678", "+84912345678"],
    ["0912 345 678", "+84912345678"],
    ["091.234.5678", "+84912345678"],
    ["(091) 234-5678", "+84912345678"],
    ["+84912345678", "+84912345678"],
    ["+84 912 345 678", "+84912345678"],
    ["84912345678", "+84912345678"],
    ["0084912345678", "+84912345678"],
    // Lỗi gõ phổ biến: giữ cả số 0 trung kế sau mã quốc gia.
    ["+84 (0) 912345678", "+84912345678"],
    ["+840912345678", "+84912345678"],
    // Các đầu số di động hiện hành 03/05/07/08/09.
    ["0387654321", "+84387654321"],
    ["0587654321", "+84587654321"],
    ["0787654321", "+84787654321"],
    ["0887654321", "+84887654321"],
    // Máy bàn có mã vùng (11 số).
    ["024 3812 3456", "+842438123456"],
    ["02838123456", "+842838123456"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("cắt khoảng trắng đầu/cuối", () => {
    expect(normalizePhone("  0912345678\n")).toBe("+84912345678");
  });

  it.each([
    "091234567", // thiếu 1 số
    "09123456789", // thừa 1 số
    "0112345678", // đầu số 01 không còn dùng
    "0412345678", // đầu số 04 không hợp lệ
    "912345678", // thiếu số 0 đầu — cố ý không nhận
    "+84 12345678", // sau mã quốc gia phải bắt đầu 3/5/7/8/9 (hoặc 2 cho bàn)
    "abc",
    "",
    "   ",
    "0912-abc-678",
    "+",
    "0912345678 ext 12",
    "09123456789012345678901234567890123", // quá dài
  ])("từ chối %j", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  it("dấu + chỉ hợp lệ ở đầu", () => {
    expect(normalizePhone("09123+45678")).toBeNull();
  });
});

describe("normalizePhone — số quốc tế", () => {
  it.each([
    ["+1 415 555 2671", "+14155552671"],
    ["+44 20 7946 0958", "+442079460958"],
    ["0014155552671", "+14155552671"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("từ chối số quốc tế quá ngắn/quá dài hoặc mã quốc gia bắt đầu bằng 0", () => {
    expect(normalizePhone("+1234567")).toBeNull(); // 7 chữ số < 8
    expect(normalizePhone("+1234567890123456")).toBeNull(); // 16 chữ số > 15
    expect(normalizePhone("+0123456789")).toBeNull();
  });

  it("số không có + hoặc 00 và không phải dạng VN thì không đoán là quốc tế", () => {
    expect(normalizePhone("14155552671")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("giữ 2 số đầu và 3 số cuối", () => {
    expect(maskPhone("+84912345678")).toBe("+84 ****** 678");
  });

  it("số quá ngắn → che hết", () => {
    expect(maskPhone("+1234")).toBe("***");
  });

  it("không lộ các chữ số ở giữa", () => {
    expect(maskPhone("+84912345678")).not.toMatch(/9123/);
  });
});
