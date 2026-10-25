import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const colors = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/styles/colors/colors.json'), 'utf8'),
) as { dark: Record<string, string>; light: Record<string, string> };

/** Độ chói tương đối theo WCAG. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`"${hex}" không phải mã #RRGGBB`);
  const n = Number.parseInt(m[1]!, 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Độ bão hoà HSL, %. Đây là con số nói "màu có sống hay không". */
function saturation(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)) * 100;
}

const D = colors.dark;

/**
 * ⛔ Ba luật này khoá lại đúng ba thứ đã làm chế độ tối "nhạt nhoà" trước đây.
 *
 * Chúng KHÔNG trùng với `scripts/check-contrast.mjs`: script đó soát cặp
 * nền+chữ tìm được trong mã nguồn (đọc được không), còn ở đây là các bất biến
 * của chính BẢNG MÀU (có chiều sâu không, có sống không) — thứ không cặp
 * nền+chữ nào phát hiện ra.
 */
describe('Bảng màu chế độ TỐI — bất biến', () => {
  /**
   * Trước đây `bg-base` → `bg-1` chỉ **1.05:1**: thẻ chìm hoàn toàn vào nền,
   * cả màn hình là một mảng đen phẳng. Ở vùng rất tối, tỉ số tương phản bị nén
   * lại nên bước nhảy phải LỚN hơn cảm giác của mắt trên ảnh thiết kế.
   */
  it('các lớp nền tách nhau đủ để thấy chiều sâu', () => {
    const layers = ['bg-base', 'bg-1', 'bg-2', 'bg-3', 'bg-4'] as const;

    // Thẻ phải NỔI khỏi nền màn — đây là bậc quan trọng nhất.
    expect(contrast(D['bg-1']!, D['bg-base']!)).toBeGreaterThanOrEqual(1.25);

    for (let i = 0; i < layers.length - 1; i += 1) {
      const step = contrast(D[layers[i]!]!, D[layers[i + 1]!]!);
      expect(step).toBeGreaterThanOrEqual(1.18);
    }
  });

  /** Nền các lớp phải sáng DẦN, không được đảo bậc. */
  it('thang nền sáng dần, không đảo bậc', () => {
    const layers = ['bg-base', 'bg-1', 'bg-2', 'bg-3', 'bg-4'] as const;
    const lums = layers.map((k) => luminance(D[k]!));

    expect(lums).toEqual([...lums].sort((a, b) => a - b));
  });

  /**
   * ⛔ Đây là nguyên nhân gốc của "nhạt nhoà": chế độ tối từng lấy `primary-3`
   * (#B8D0CE, bão hoà 20%) làm màu hành động, nên nút chính là một mảng
   * xám-xanh pastel. Ở chế độ tối màu thương hiệu phải SÁNG **và** BÃO HOÀ.
   */
  it('màu thương hiệu và ngữ nghĩa còn sống (bão hoà ≥ 40%)', () => {
    const vivid = [
      'action-base',
      'fg-brand',
      'action-accent',
      'success',
      'info',
      'warning',
      'error',
    ];

    // Báo kèm TÊN token: `toBeGreaterThanOrEqual` trần chỉ in ra con số, và khi
    // đỏ thì người đọc không biết token nào vừa bị làm nhạt.
    const tooDull = vivid.filter((key) => saturation(D[key]!) < 40);

    expect(tooDull).toEqual([]);
  });

  /**
   * Chữ phải có NHỊP. Trước đây fg-1…fg-3 nằm ở 100/88/77% độ sáng — quá sát
   * nhau, nên mắt không biết đâu là chính đâu là phụ.
   */
  it('bốn bậc chữ tách nhau rõ', () => {
    const steps = ['fg-1', 'fg-2', 'fg-3', 'fg-4'] as const;

    for (let i = 0; i < steps.length - 1; i += 1) {
      expect(contrast(D[steps[i]!]!, D[steps[i + 1]!]!)).toBeGreaterThanOrEqual(1.4);
    }
  });

  /**
   * ⚠️ Ở chế độ tối, "nhấn" là phủ SÁNG chứ không phải đậm thêm — ngược với
   * chế độ sáng. Làm tối hơn thì chữ `action-press` trên nền `action-tint-strong`
   * tụt xuống dưới ngưỡng đọc được (đã đo: 3.84:1).
   */
  it('trạng thái nhấn ở chế độ tối SÁNG hơn trạng thái thường', () => {
    expect(luminance(D['action-press']!)).toBeGreaterThan(luminance(D['action-base']!));
    expect(luminance(colors.light['action-press']!)).toBeLessThan(
      luminance(colors.light['action-base']!),
    );
  });

  /** Viền là thứ duy nhất tách hai bề mặt gần màu nhau — nó phải nhìn thấy được. */
  it('viền nhìn thấy được trên thẻ', () => {
    expect(contrast(D['border-1']!, D['bg-1']!)).toBeGreaterThanOrEqual(1.6);
  });
});
