/**
 * Chuyển đổi hex ↔ HSL. Tách riêng vì có ≥ 2 nơi cần: màu nhà thầu
 * (`contractor-color.utils.ts`) và màu mũi thi công (`construction-route-color.utils.ts`).
 *
 * KHÔNG dùng cho màu của design system — token màu lấy từ `colors.generated.ts`
 * (xem `color-system.md`). File này chỉ phục vụ màu do người dùng tự chọn.
 */

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

/** `#RRGGBB` (chấp nhận cả chữ thường) → HSL. Hex không hợp lệ → đen (0,0,0). */
export function hexToHsl(hex: string): Hsl {
  const clean = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(clean)) return { h: 0, s: 0, l: 0 };

  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return { h: h * 60, s: s * 100, l: l * 100 };
}

/** HSL → `#RRGGBB` viết hoa. `h` tự quấn vòng, `s`/`l` tự kẹp về [0,100]. */
export function hslToHex(h: number, s: number, l: number): `#${string}` {
  const hue = ((h % 360) + 360) % 360;
  const sPct = clamp(s, 0, 100) / 100;
  const lPct = clamp(l, 0, 100) / 100;

  const k = (n: number) => (n + hue / 30) % 12;
  const a = sPct * Math.min(lPct, 1 - lPct);
  const f = (n: number) =>
    Math.round(255 * (lPct - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
      .toString(16)
      .padStart(2, '0');

  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase() as `#${string}`;
}

/** Góc lệch nhỏ nhất giữa 2 hue (0–180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** `#abc123` → `#ABC123`. Không hợp lệ → `undefined`. */
export function normalizeHex(hex: string | null | undefined): `#${string}` | undefined {
  if (!hex) return undefined;
  const clean = hex.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(clean) ? (clean as `#${string}`) : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Sinh màu hex ngẫu nhiên KHÁC RÕ mọi màu đang dùng.
 *
 * Ràng buộc hue ≥ 25° so với từng màu trong `usedHex` để mắt phân biệt được;
 * S 65-80% / L 55-65% giữ màu nổi trên cả nền sáng lẫn nền tối. Thử tối đa
 * 100 lần rồi trả màu bất kỳ — tránh lặp vô hạn khi bảng màu đã quá dày.
 */
export function generateDistinctHexColor(usedHex: readonly string[]): `#${string}` {
  const usedHues = usedHex
    .map((h) => normalizeHex(h))
    .filter((h): h is `#${string}` => h !== undefined)
    .map((h) => hexToHsl(h).h);

  for (let attempt = 0; attempt < 100; attempt++) {
    const h = Math.random() * 360;
    if (usedHues.every((u) => hueDistance(h, u) >= 25)) {
      return hslToHex(h, 65 + Math.random() * 15, 55 + Math.random() * 10);
    }
  }
  return hslToHex(Math.random() * 360, 70, 60);
}
