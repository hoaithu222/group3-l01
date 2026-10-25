/**
 * Đếm GRAPHEME (ký tự người dùng NHÌN THẤY là một chữ, kể cả emoji ghép ZWJ) — khớp `graphemeLength()` của BE (`core/utils/normalize.ts`) cho giới hạn
 * mục tiêu 200. ⚠️ Cùng logic `features/chat/utils/grapheme.ts`, viết lại ở đây vì cấm import chéo feature (`feature-structure.md`); Hermes không
 * chắc có `Intl.Segmenter` nên rơi về `Array.from` (đếm theo code point — chỉ XẤP XỈ với emoji ghép; BE vẫn là nơi chặn cuối).
 */
type SegmenterCtor = new (locale: string, options: { granularity: 'grapheme' }) => { segment: (text: string) => Iterable<unknown> };

export function graphemeLength(text: string): number {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterCtor }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter('vi', { granularity: 'grapheme' }).segment(text)).length;
  return Array.from(text).length;
}
