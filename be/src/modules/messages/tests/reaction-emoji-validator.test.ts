/**
 * Unit — `isValidEmoji()` (be.md §5.5, exported thuần từ
 * `services/message-interaction.service.ts`) — hàm tách riêng đủ để test độc
 * lập không cần Prisma/Redis thật (chỉ import type/class khác trong cùng
 * file, không thực thi side-effect DB lúc import module).
 *
 * BUG THẬT phát hiện khi viết bộ test này (đã sửa tại chỗ,
 * `message-interaction.service.ts#isValidEmoji`): cờ quốc gia (2 code point
 * Regional_Indicator, vd 🇻🇳) và keycap (`5️⃣`, `#️⃣`) là 1 grapheme hợp lệ và
 * `EMOJI_MODIFIER_RE` đã có sẵn dải ký tự cho cả 2 loại này, NHƯNG cổng
 * `hasPictographic` (yêu cầu ít nhất 1 code point mang `\p{Extended_Pictographic}`)
 * chặn nhầm CẢ HAI — không code point nào của cờ/keycap mang thuộc tính đó.
 * be.md §5.5 tự liệt "keycap" là loại phải hỗ trợ nên đây là bug, không phải
 * giới hạn cố ý — test dưới đây khoá lại hành vi ĐÚNG sau khi sửa.
 */
import { isValidEmoji } from "../services/message-interaction.service";

describe("message-interaction.service#isValidEmoji()", () => {
  it("emoji đơn giản (1 code point pictographic) → hợp lệ", () => {
    expect(isValidEmoji("👍")).toBe(true);
  });

  it("emoji ghép ZWJ (gia đình, 4 người) → hợp lệ (1 grapheme)", () => {
    expect(isValidEmoji("👨‍👩‍👧‍👦")).toBe(true);
  });

  it("emoji + khung màu da (skin tone modifier) → hợp lệ", () => {
    expect(isValidEmoji("👍🏽")).toBe(true);
  });

  it("cờ quốc gia (2 code point Regional Indicator) → hợp lệ (bug đã sửa)", () => {
    expect(isValidEmoji("🇻🇳")).toBe(true);
  });

  it("keycap số (digit + VS16 + combining keycap) → hợp lệ (bug đã sửa)", () => {
    expect(isValidEmoji("5️⃣")).toBe(true);
  });

  it("keycap # → hợp lệ", () => {
    expect(isValidEmoji("#️⃣")).toBe(true);
  });

  it("chuỗi văn bản thường → không hợp lệ", () => {
    expect(isValidEmoji("abc")).toBe(false);
  });

  it("2 emoji tách rời (2 grapheme) → không hợp lệ", () => {
    expect(isValidEmoji("👍😀")).toBe(false);
  });

  it("chuỗi rỗng → không hợp lệ", () => {
    expect(isValidEmoji("")).toBe(false);
  });

  it("chữ số đơn lẻ không kèm keycap → không hợp lệ (khác keycap thật)", () => {
    expect(isValidEmoji("5")).toBe(false);
  });

  it("1 chữ cái thường → không hợp lệ", () => {
    expect(isValidEmoji("a")).toBe(false);
  });

  it("chuỗi dài > 32 ký tự → không hợp lệ", () => {
    expect(isValidEmoji("👍".repeat(20))).toBe(false); // vượt 32 UTF-16 code unit (mỗi 👍 = 2)
  });
});
