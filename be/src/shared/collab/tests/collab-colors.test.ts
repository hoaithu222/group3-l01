import { COLLAB_COLORS, collabColorFor } from "..";

/** Độ sáng tương đối WCAG 2.x của màu `#RRGGBB`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
const contrastWithWhite = (hex: string): number => 1.05 / (luminance(hex) + 0.05);

describe("bảng màu con trỏ cộng tác", () => {
  it("8 màu, mỗi màu tương phản ≥ 4.5:1 với chữ trắng (nhãn tên trên con trỏ đọc được)", () => {
    expect(COLLAB_COLORS).toHaveLength(8);
    expect(new Set(COLLAB_COLORS).size).toBe(8);
    for (const color of COLLAB_COLORS) expect(contrastWithWhite(color)).toBeGreaterThanOrEqual(4.5);
  });

  it("màu theo userId là tất định và chỉ lấy từ bảng", () => {
    const id = "66f1a2b3c4d5e6f708192a3b";
    expect(collabColorFor(id)).toBe(collabColorFor(id));
    for (let i = 0; i < 200; i += 1) expect(COLLAB_COLORS).toContain(collabColorFor(`user-${i}`));
  });

  it("phân bố không dồn về một màu", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => collabColorFor(`66f1a2b3c4d5e6f7081${String(i).padStart(5, "0")}`)));
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
