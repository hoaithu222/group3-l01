import { escapeRegex } from "../escape-regex";

describe("escapeRegex()", () => {
  it("escape đủ mọi ký tự đặc biệt của regex", () => {
    expect(escapeRegex(".*(a+)+$")).toBe("\\.\\*\\(a\\+\\)\\+\\$");
    expect(escapeRegex("a|b^c?d{2}[x]\\y")).toBe("a\\|b\\^c\\?d\\{2\\}\\[x\\]\\\\y");
  });

  it("chuỗi thường giữ nguyên (kể cả tiếng Việt và emoji)", () => {
    expect(escapeRegex("do an cuoi ky")).toBe("do an cuoi ky");
    expect(escapeRegex("đồ án 😀")).toBe("đồ án 😀");
  });

  it("regex sinh ra chỉ khớp LITERAL — mẫu ReDoS kinh điển không còn là nhóm lặp", () => {
    const evil = "(a+)+$";
    const re = new RegExp(escapeRegex(evil));
    // Nếu không escape, `(a+)+$` trên chuỗi này sẽ bùng nổ tổ hợp; đã escape thì xong ngay.
    const start = Date.now();
    expect(re.test("a".repeat(40) + "!")).toBe(false);
    expect(Date.now() - start).toBeLessThan(200);
    expect(re.test("xx(a+)+$yy")).toBe(true);
  });

  it("chuỗi rỗng → rỗng", () => {
    expect(escapeRegex("")).toBe("");
  });
});
