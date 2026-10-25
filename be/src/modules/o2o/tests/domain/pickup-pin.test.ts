import { generateOrderCode, generatePin, hashPin, PIN_PATTERN, verifyPin } from "../../domain/pickup-pin";

describe("pickup-pin (README §2 PIN)", () => {
  it("PIN luôn đúng 6 chữ số (kể cả số 0 đầu)", () => {
    for (let i = 0; i < 200; i += 1) expect(generatePin()).toMatch(PIN_PATTERN);
  });

  it("HMAC gắn orderId: cùng PIN ở hai đơn cho hai hash khác nhau; không lưu PIN thô", () => {
    const h1 = hashPin("order-a", "123456");
    const h2 = hashPin("order-b", "123456");
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain("123456");
  });

  it("verifyPin: đúng → true; sai / sai định dạng / chưa có hash → false", () => {
    const h = hashPin("o1", "048213");
    expect(verifyPin("o1", "048213", h)).toBe(true);
    expect(verifyPin("o1", "048214", h)).toBe(false);
    expect(verifyPin("o2", "048213", h)).toBe(false);
    expect(verifyPin("o1", "48213", h)).toBe(false);
    expect(verifyPin("o1", "048213", null)).toBe(false);
  });

  it("mã đơn PO-XXXXXX không có ký tự dễ nhầm", () => {
    for (let i = 0; i < 100; i += 1) expect(generateOrderCode()).toMatch(/^PO-[2-9A-HJKMNP-Z]{6}$/);
  });
});
