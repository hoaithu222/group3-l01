/**
 * Tokenizer markdown-lite của BIÊN BẢN (app.md p2-06 §3 `RecapView`) — CHỈ trả cây dữ liệu, không bao giờ diễn giải HTML: `<script>`,
 * `javascript:`, `data:` ra khỏi đây dưới dạng CHỮ THƯỜNG vì mọi chữ đều đi qua `<Text>`. Liên kết chỉ nhận `https://` (không http,
 * không scheme lạ) — biên bản được đăng vào nhóm chat, một liên kết giả dạng là đường lừa đảo dễ nhất.
 *
 * Cú pháp khớp BE `recap-content.ts` (trích đoạn thẻ chat) và thanh công cụ `MarkdownLiteToolbar`: `**đậm**`, `_nghiêng_`/`*nghiêng*`,
 * tiêu đề nhỏ `### `, danh sách `- `/`* `/`1. `, việc cần làm `- [ ]`/`- [x]` (chỉ HIỂN THỊ — P0 không tick trực tiếp).
 *
 * Vì sao viết cục bộ: bản của `boards`/`chat` không nhập chéo được (`feature-structure.md`) và không có ô việc cần làm.
 */

export type RecapInline =
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'text'; text: string };

export type RecapBlock =
  | { type: 'heading'; children: RecapInline[] }
  | { type: 'paragraph'; children: RecapInline[] }
  | { type: 'item'; children: RecapInline[]; marker: string }
  | { type: 'todo'; children: RecapInline[]; done: boolean };

const INLINE_RE = /(\*\*[^*\n]+\*\*)|(https:\/\/[^\s<>"'()[\]{}]+)|((?<![\w*])\*[^*\n]+\*(?![\w*]))|((?<!\w)_[^_\n]+_(?!\w))/g;

export function tokenizeRecapInline(text: string): RecapInline[] {
  const nodes: RecapInline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) nodes.push({ text: text.slice(last, index), type: 'text' });
    if (match[1]) nodes.push({ text: raw.slice(2, -2), type: 'bold' });
    else if (match[2]) nodes.push({ text: raw, type: 'link', url: raw });
    else nodes.push({ text: raw.slice(1, -1), type: 'italic' });
    last = index + raw.length;
  }
  if (last < text.length) nodes.push({ text: text.slice(last), type: 'text' });
  return nodes;
}

const HEADING_RE = /^#{1,6}\s+(.*)$/;
const TODO_RE = /^[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET_RE = /^[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\d+)[.)]\s+(.*)$/;

/** Một dòng → một khối; đoạn văn liền nhau (không dòng trống) gộp làm một. */
export function tokenizeRecap(source: string): RecapBlock[] {
  const blocks: RecapBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ children: tokenizeRecapInline(paragraph.join('\n')), type: 'paragraph' });
    paragraph = [];
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const heading = HEADING_RE.exec(line);
    const todo = TODO_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    const bullet = BULLET_RE.exec(line);
    if (line.trim() === '') flush();
    else if (heading) {
      flush();
      blocks.push({ children: tokenizeRecapInline(heading[1] ?? ''), type: 'heading' });
    } else if (todo) {
      flush();
      blocks.push({ children: tokenizeRecapInline(todo[2] ?? ''), done: (todo[1] ?? ' ') !== ' ', type: 'todo' });
    } else if (ordered) {
      flush();
      blocks.push({ children: tokenizeRecapInline(ordered[2] ?? ''), marker: `${ordered[1] ?? '1'}.`, type: 'item' });
    } else if (bullet) {
      flush();
      blocks.push({ children: tokenizeRecapInline(bullet[1] ?? ''), marker: '•', type: 'item' });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}
