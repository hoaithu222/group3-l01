import { looksLikePlainText } from "./text-sniff";

describe("looksLikePlainText", () => {
  it("UTF-8 hợp lệ (tiếng Việt, emoji, xuống dòng) → true", () => {
    expect(looksLikePlainText(Buffer.from("Xin chào thế giới 😀\r\nDòng 2\tcó tab", "utf8"), false)).toBe(true);
    expect(looksLikePlainText(Buffer.alloc(0), false)).toBe(true);
  });

  it("có byte NUL hoặc UTF-8 hỏng → false", () => {
    expect(looksLikePlainText(Buffer.from([0x61, 0x00, 0x62]), false)).toBe(false);
    expect(looksLikePlainText(Buffer.from([0xff, 0xfe, 0x41]), false)).toBe(false);
    expect(looksLikePlainText(Buffer.from([0xc3, 0x28]), false)).toBe(false);
  });

  it("mẫu bị cắt giữa ký tự nhiều byte: truncated=true bỏ qua phần đuôi dở, truncated=false coi là hỏng", () => {
    const full = Buffer.from("aệ", "utf8"); // 'ệ' = 3 byte
    for (const cut of [1, 2]) {
      const partial = full.subarray(0, full.length - cut);
      expect(looksLikePlainText(partial, true)).toBe(true);
      expect(looksLikePlainText(partial, false)).toBe(false);
    }
    const emoji = Buffer.from("x😀", "utf8"); // 4 byte
    expect(looksLikePlainText(emoji.subarray(0, emoji.length - 1), true)).toBe(true);
  });

  it("chữ ký nhị phân (PNG header) không phải văn bản", () => {
    expect(looksLikePlainText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]), true)).toBe(false);
  });
});
