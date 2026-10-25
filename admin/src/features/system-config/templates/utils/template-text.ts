const SEGMENTER =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('vi', { granularity: 'grapheme' })
    : null;

/**
 * Số ký tự HIỂN THỊ (grapheme) — emoji ghép/chữ có dấu tổ hợp tính là 1, như `graphemeLength` phía BE.
 * `string.length` đếm code unit UTF-16 nên lệch với BE ở đúng những ca đó.
 */
export function graphemeLength(text: string): number {
  return SEGMENTER ? Array.from(SEGMENTER.segment(text)).length : Array.from(text).length;
}
