import type { Span } from '../api/roadmap.types';

/**
 * Markdown INLINE tối giản cho chữ KHÔNG đi qua `blocks`: mục tiêu buổi học, checklist tự kiểm tra, "Yêu cầu trước".
 * BE tách các mục đó từ dòng markdown thô (`lesson-sections.ts`), nên chữ còn nguyên `**đậm**`, `` `code` ``,
 * `[chữ](url)` — vẽ trần là người học thấy dấu sao và backtick ("Tôi viết được `<head>` **đầy đủ**").
 *
 * Chỉ hiểu bốn cú pháp hay gặp; còn lại giữ nguyên chữ (không mất nội dung).
 * ⚠️ Cố ý KHÔNG hiểu `_nghiêng_`: tên biến snake_case ("user_id và order_id") sẽ bị nuốt thành chữ nghiêng.
 */
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

function toSpan(raw: string): Span {
  if (raw.startsWith('**')) return { t: 'bold', v: raw.slice(2, -2) };
  if (raw.startsWith('`')) return { t: 'code', v: raw.slice(1, -1) };
  if (raw.startsWith('[')) {
    const match = LINK.exec(raw);
    const label = match?.[1] ?? raw;
    const href = match?.[2] ?? '';
    // Chỉ http(s) mới mở được — link tương đối của giáo trình (`./code/x.html`) hạ thành chữ, cùng luật với BE.
    return /^https?:\/\//i.test(href) ? { href, t: 'link', v: label } : { t: 'text', v: label };
  }
  return { t: 'italic', v: raw.slice(1, -1) };
}

export function inlineMarkdownToSpans(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ t: 'text', v: text.slice(last, index) });
    spans.push(toSpan(match[0]));
    last = index + match[0].length;
  }
  if (last < text.length) spans.push({ t: 'text', v: text.slice(last) });
  return spans;
}

/** Chữ thuần (bỏ dấu markdown) — nhãn trợ năng của checkbox/mục tiêu. */
export function inlineMarkdownToText(text: string): string {
  return inlineMarkdownToSpans(text)
    .map((span) => span.v)
    .join('');
}
