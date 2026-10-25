import type { PortfolioAccent, PortfolioTemplate } from "../entities/portfolio.interface";

/**
 * Token màu của trang công khai (p6-07 README §2): 6 màu nhấn × nền sáng/tối, ĐÃ KIỂM tương phản WCAG ≥ 4.5:1 với nền và bề mặt của từng chế độ
 * (`tests/theme-tokens.test.ts` tính lại bằng `contrastRatio`). Màu nhấn CHỈ dùng làm màu chữ/viền/đường kẻ — không đặt chữ lên nền màu nhấn — nên chỉ cần một cặp
 * (màu nhấn, nền) cho mỗi chế độ. Giá trị là hằng tĩnh; KHÔNG bao giờ lấy từ dữ liệu người dùng (CSS chèn thô vào `<style>`).
 */
export interface Palette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
}

export const LIGHT: Palette = { bg: "#ffffff", surface: "#f1f5f9", text: "#0f172a", muted: "#475569", border: "#cbd5e1" };
export const DARK: Palette = { bg: "#0f172a", surface: "#1e293b", text: "#e2e8f0", muted: "#94a3b8", border: "#334155" };

export interface AccentTokens {
  label: string;
  /** Màu nhấn trên nền SÁNG (CLASSIC/DESIGNER/MINIMAL). */
  onLight: string;
  /** Màu nhấn trên nền TỐI (DEVELOPER). */
  onDark: string;
}

export const ACCENT_TOKENS: Readonly<Record<PortfolioAccent, AccentTokens>> = {
  GREEN: { label: "Xanh lá", onLight: "#047857", onDark: "#34d399" },
  BLUE: { label: "Xanh dương", onLight: "#1d4ed8", onDark: "#60a5fa" },
  VIOLET: { label: "Tím", onLight: "#6d28d9", onDark: "#a78bfa" },
  ORANGE: { label: "Cam", onLight: "#b45309", onDark: "#fb923c" },
  ROSE: { label: "Hồng", onLight: "#be123c", onDark: "#fb7185" },
  SLATE: { label: "Xám", onLight: "#334155", onDark: "#94a3b8" },
};

export interface TemplateMeta {
  name: string;
  description: string;
  dark: boolean;
}

export const TEMPLATE_META: Readonly<Record<PortfolioTemplate, TemplateMeta>> = {
  CLASSIC: { name: "Cổ điển", description: "Mẫu Cổ điển — nền sáng, tiêu đề căn giữa, dự án dạng thẻ", dark: false },
  DEVELOPER: { name: "Lập trình viên", description: "Mẫu Lập trình viên — nền tối, chữ đơn cách cho số liệu, nhấn vào kỹ năng", dark: true },
  DESIGNER: { name: "Thiết kế", description: "Mẫu Thiết kế — ảnh bìa dự án lớn, lưới hai cột trên màn rộng", dark: false },
  MINIMAL: { name: "Tối giản", description: "Mẫu Tối giản — một cột, không khung, tập trung vào chữ", dark: false },
};

/** Tỉ lệ tương phản WCAG 2.x giữa hai màu `#rrggbb` (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  const lum = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
