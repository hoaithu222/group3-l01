import { PORTFOLIO_ACCENTS, PORTFOLIO_TEMPLATES } from "../entities/portfolio.interface";
import { templateCss } from "../templates/styles";
import { ACCENT_TOKENS, contrastRatio, DARK, LIGHT, TEMPLATE_META } from "../templates/theme-tokens";

/** CR-37 (phần tự động): tương phản ≥ 4.5:1 cho cả 6 màu nhấn trên nền + bề mặt của từng chế độ; chữ phụ đạt cùng ngưỡng. Kiểm tay 360 px/VoiceOver ở staging. */
describe("contrastRatio", () => {
  it("đen/trắng = 21, cùng màu = 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 5);
  });
});

describe("token màu portfolio", () => {
  it.each(PORTFOLIO_ACCENTS)("màu nhấn %s: nền sáng ≥ 4.5 trên nền và bề mặt", (accent) => {
    const c = ACCENT_TOKENS[accent].onLight;
    expect(contrastRatio(c, LIGHT.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c, LIGHT.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PORTFOLIO_ACCENTS)("màu nhấn %s: nền tối ≥ 4.5 trên nền và bề mặt", (accent) => {
    const c = ACCENT_TOKENS[accent].onDark;
    expect(contrastRatio(c, DARK.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c, DARK.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["sáng", LIGHT],
    ["tối", DARK],
  ])("chữ chính và chữ phụ đạt 4.5 trên nền %s (cả bề mặt)", (_name, p) => {
    for (const fg of [p.text, p.muted]) {
      expect(contrastRatio(fg, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(fg, p.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("mọi mẫu có mô tả chữ (ảnh mẫu trong app cần mô tả) và CSS chỉ chứa hằng tĩnh", () => {
    for (const t of PORTFOLIO_TEMPLATES) {
      expect(TEMPLATE_META[t].description.length).toBeGreaterThan(10);
      const css = templateCss(t, "BLUE");
      expect(css).not.toMatch(/url\(|@import|expression\(|<\/style/i); // CSP: không tải tài nguyên ngoài
      expect(css).toContain(TEMPLATE_META[t].dark ? ACCENT_TOKENS.BLUE.onDark : ACCENT_TOKENS.BLUE.onLight);
    }
  });
});
