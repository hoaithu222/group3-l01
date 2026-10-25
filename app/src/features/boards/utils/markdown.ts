/**
 * Tokenizer Markdown AN TOÀN cho mô tả thẻ và bình luận (p3-03) — CHỈ trả cây dữ liệu, không bao giờ
 * diễn giải HTML: `<script>`, `javascript:`, `data:` ra khỏi đây dưới dạng CHỮ THƯỜNG vì mọi chữ đều
 * đi qua `<Text>` (README p3-03 §10 "cấu hình tắt HTML").
 *
 * Vì sao viết cục bộ: `react-native-markdown-display` (kế hoạch p1-04) CHƯA cài và cấm cài thêm gói;
 * bản `markdown-lite` của `features/chat` không nhập chéo được (`feature-structure.md`) và thiếu
 * tiêu đề/trích dẫn mà mô tả thẻ cần. Khi `shared/` có `MarkdownView` dùng chung thì thay file này.
 *
 * Hỗ trợ: tiêu đề `#`–`###`, trích dẫn `>`, danh sách `-`/`*`/`1.`, khối code ```…```, và trong dòng:
 * **đậm** · _nghiêng_/*nghiêng* · ~~gạch~~ · `code` · `[chữ](https://…)` · URL http(s) trần.
 */

export type InlineNode =
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'strike'; text: string }
  | { type: 'text'; text: string };

export type BlockNode =
  | { type: 'code'; text: string }
  | { type: 'heading'; children: InlineNode[]; level: 1 | 2 | 3 }
  | { type: 'list'; items: InlineNode[][]; ordered: boolean }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'quote'; children: InlineNode[] };

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s<>"'()[\]{}]+)|((?<![\w*])\*[^*\n]+\*(?![\w*]))|((?<!\w)_[^_\n]+_(?!\w))/g;
const LINK_RE = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;

/** Chữ thường → các nút đậm/nghiêng/gạch/code/liên kết, theo thứ tự xuất hiện. */
export function tokenizeInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) nodes.push({ text: text.slice(last, index), type: 'text' });
    if (match[1]) nodes.push({ text: raw.slice(1, -1), type: 'code' });
    else if (match[2]) nodes.push({ text: raw.slice(2, -2), type: 'bold' });
    else if (match[3]) nodes.push({ text: raw.slice(2, -2), type: 'strike' });
    else if (match[4]) {
      const parts = LINK_RE.exec(raw);
      nodes.push(
        parts
          ? { text: parts[1] ?? raw, type: 'link', url: parts[2] ?? '' }
          : { text: raw, type: 'text' },
      );
    } else if (match[5]) nodes.push({ text: raw, type: 'link', url: raw });
    else nodes.push({ text: raw.slice(1, -1), type: 'italic' });
    last = index + raw.length;
  }
  if (last < text.length) nodes.push({ text: text.slice(last), type: 'text' });
  return nodes;
}

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const LIST_RE = /^(?:[-*]|\d+\.)\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

/** Khối trong một đoạn KHÔNG chứa khối code (đã tách trước). */
function tokenizeBlocks(part: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const lines = part.split('\n');
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0)
      blocks.push({ children: tokenizeInline(paragraph.join('\n')), type: 'paragraph' });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const heading = HEADING_RE.exec(line);
    const quote = QUOTE_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({
        children: tokenizeInline(heading[2] ?? ''),
        level: (heading[1]?.length ?? 1) as 1 | 2 | 3,
        type: 'heading',
      });
    } else if (LIST_RE.test(line)) {
      flush();
      const ordered = /^\d+\./.test(line);
      const items: InlineNode[][] = [];
      while (i < lines.length && LIST_RE.test(lines[i] ?? '')) {
        items.push(tokenizeInline(LIST_RE.exec(lines[i] ?? '')?.[1] ?? ''));
        i += 1;
      }
      i -= 1;
      blocks.push({ items, ordered, type: 'list' });
    } else if (quote) {
      flush();
      blocks.push({ children: tokenizeInline(quote[1] ?? ''), type: 'quote' });
    } else if (line.trim() === '') flush();
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

export function tokenizeMarkdown(source: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  // Khối code tách TRƯỚC — bên trong không phân tích gì (kể cả marker nhắc tên).
  source.split(/```[^\n]*\n?([\s\S]*?)```/).forEach((part, index) => {
    if (index % 2 === 1) blocks.push({ text: part.replace(/\n$/, ''), type: 'code' });
    else blocks.push(...tokenizeBlocks(part));
  });
  return blocks;
}

/** Mô tả đủ dài để đáng gập "Xem thêm" (app.md §2 `DescriptionSection` — 12 dòng). */
export function isLongText(source: string, maxLines: number): boolean {
  return source.split('\n').length > maxLines || source.length > maxLines * 60;
}
