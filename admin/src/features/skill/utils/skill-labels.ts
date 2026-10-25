import { normalizeSearch } from '@/shared/utils/format';

/**
 * Chuẩn hoá nhãn kỹ năng — BẢN SAO có chủ đích của `normalizeSkillLabel` BE (`be/src/core/utils/normalize.ts`; hai gói không chia mã nguồn):
 * bỏ dấu, chữ thường, `+`→`plus`, `#`→`sharp`, bỏ mọi ký tự không phải chữ/số. "Node.js" → `nodejs`. Chỉ để HIỂN THỊ dạng chuẩn hoá — BE
 * luôn tự chuẩn hoá lại khi lưu.
 */
export function normalizeSkillLabel(label: string): string {
  return normalizeSearch(label)
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export interface ParsedLabels {
  /** Nhãn gốc đã trim (bỏ dòng trống) — gửi lên BE. */
  raw: string[];
  /** Dạng chuẩn hoá, không trùng. */
  normalized: string[];
  /** Nhãn không còn chữ/số sau chuẩn hoá. */
  invalid: string[];
}

/** Ô nhập nhiều nhãn: cách nhau bằng dấu phẩy hoặc xuống dòng. */
export function parseLabels(text: string): ParsedLabels {
  const raw = text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const normalized = [...new Set(raw.map(normalizeSkillLabel).filter(Boolean))];
  return { raw, normalized, invalid: raw.filter((l) => normalizeSkillLabel(l) === '') };
}

/** Thêm một nhãn gợi ý vào ô nhập (bỏ qua nếu dạng chuẩn hoá đã có). */
export function appendLabel(text: string, label: string): string {
  const cur = parseLabels(text);
  if (cur.normalized.includes(normalizeSkillLabel(label))) return text;
  return [...cur.raw, label].join(', ');
}
