/**
 * Marker nhắc tên còn nguyên trong `preview.excerpt` (BE `excerptOf` không thay) — khớp parser BE:
 * `@{u:<24-hex>}` · `@{all}` · `@{r:ADMIN|MEMBER}`. Viết lại ở đây (không import `chat`, cấm chéo feature)
 * chỉ để KHÔNG in marker thô ra màn hình người kiểm duyệt.
 */
const MENTION_MARKER = /@\{(?:u:[0-9a-fA-F]{24}|all|r:(?:ADMIN|MEMBER))\}/g;

/** Excerpt an toàn để hiện: marker nhắc tên → "@…", gộp khoảng trắng thừa. */
export function cleanExcerpt(excerpt: string): string {
  return excerpt.replace(MENTION_MARKER, '@…').replace(/\s+/g, ' ').trim();
}
