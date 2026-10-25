import { classifyContactQuery, maskEmail } from "../contact-query";

describe("classifyContactQuery", () => {
  it("email đầy đủ → EMAIL, chuẩn hoá chữ thường + cắt khoảng trắng", () => {
    expect(classifyContactQuery("  Lan.Nguyen@Gmail.COM ")).toEqual({ kind: "EMAIL", email: "lan.nguyen@gmail.com" });
  });

  it("số điện thoại các kiểu → PHONE dạng E.164", () => {
    expect(classifyContactQuery("0912 345 678")).toEqual({ kind: "PHONE", phone: "+84912345678" });
    expect(classifyContactQuery("+84912345678")).toEqual({ kind: "PHONE", phone: "+84912345678" });
  });

  it("chữ thường → TEXT (giữ nguyên, đã cắt khoảng trắng)", () => {
    expect(classifyContactQuery("  Nguyễn Văn A ")).toEqual({ kind: "TEXT", text: "Nguyễn Văn A" });
  });

  it("email thiếu phần tên miền hoặc chỉ có @ → TEXT, không đoán", () => {
    expect(classifyContactQuery("lan@")).toEqual({ kind: "TEXT", text: "lan@" });
    expect(classifyContactQuery("@lan")).toEqual({ kind: "TEXT", text: "@lan" });
    expect(classifyContactQuery("lan@gmail")).toEqual({ kind: "TEXT", text: "lan@gmail" });
  });

  it("chuỗi số dở dang (chưa đủ SĐT) → TEXT, KHÔNG khớp tiền tố", () => {
    expect(classifyContactQuery("0912")).toEqual({ kind: "TEXT", text: "0912" });
  });

  it("email quá 254 ký tự → TEXT", () => {
    const local = "a".repeat(250);
    expect(classifyContactQuery(`${local}@x.vn`).kind).toBe("TEXT");
  });

  it("chuỗi rỗng → TEXT rỗng", () => {
    expect(classifyContactQuery("   ")).toEqual({ kind: "TEXT", text: "" });
  });
});

describe("maskEmail", () => {
  it("giữ ký tự đầu và tên miền", () => {
    expect(maskEmail("lan@gmail.com")).toBe("l***@gmail.com");
  });

  it("không có phần tên → ***", () => {
    expect(maskEmail("@gmail.com")).toBe("***");
    expect(maskEmail("khongcoat")).toBe("***");
  });
});
