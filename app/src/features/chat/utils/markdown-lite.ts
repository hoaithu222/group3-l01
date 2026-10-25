/**
 * Tokenizer AN TOÀN cho nội dung tin nhắn — whitelist đậm/nghiêng/gạch ngang/
 * `code`/khối code/danh sách/link http(s) (app.md §2, be.md §5.8). Đây là
 * RENDERER phía client, KHÔNG phải normalizer (normalize/extractLinks đã chạy
 * ở BE, `messages/services/markdown-lite.ts`) — không bao giờ diễn giải HTML:
 * `<script>`, `javascript:`, `data:` chỉ ra khỏi đây dưới dạng CHỮ THƯỜNG
 * (TX-08), vì `InlineNode.text` luôn render qua `<Text>` của React Native, không
 * bao giờ qua `dangerouslySetInnerHTML`/WebView.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'strike'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; url: string; text: string };

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'codeblock'; text: string }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] };

/** Khớp `LINK_RE` của BE (`modules/messages/services/markdown-lite.ts`) — chỉ `http(s)://`/`www.`, không scheme khác. */
const LINK_RE = /(https?:\/\/[^\s<>"'()[\]{}]+|www\.[^\s<>"'()[\]{}]+)/gi;
const INLINE_TOKEN_RE = /(`[^`\n]+?`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(?<![\w/])_[^_\n]+?_(?![\w])/g;

function linkNode(raw: string): InlineNode {
  const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return { type: 'link', url, text: raw };
}

/** Tách một đoạn (không chứa khối code) thành text/link — CHƯA áp đậm/nghiêng/gạch/code (bước 2). */
function tokenizeLinks(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', text: text.slice(last, index) });
    nodes.push(linkNode(match[0]));
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) });
  return nodes;
}

/** Áp `` ` `` / `**` / `~~` / `_..._` lên một run TEXT thuần (không đụng vào node `link` đã tách). */
function tokenizeEmphasis(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    if (index > last) nodes.push(...tokenizeLinks(text.slice(last, index)));
    if (raw.startsWith('`')) nodes.push({ type: 'code', text: raw.slice(1, -1) });
    else if (raw.startsWith('**')) nodes.push({ type: 'bold', text: raw.slice(2, -2) });
    else if (raw.startsWith('~~')) nodes.push({ type: 'strike', text: raw.slice(2, -2) });
    else nodes.push({ type: 'italic', text: raw.slice(1, -1) });
    last = index + raw.length;
  }
  if (last < text.length) nodes.push(...tokenizeLinks(text.slice(last)));
  return nodes;
}

const LIST_ITEM_RE = /^(?:[-*]|\d+\.)\s+(.*)$/;

/** Chuỗi dòng bắt đầu bằng `- `/`* `/`1. ` liên tiếp → MỘT khối `list`. */
function isListLine(line: string): boolean {
  return LIST_ITEM_RE.test(line);
}

/**
 * Nội dung đã `normalize()` ở server (be.md §5.8) → cây khối để `TextContent.tsx`
 * render. Khối code (```…```) tách TRƯỚC — nội dung bên trong không parse đậm/
 * nghiêng/gạch/link (đúng "code block không parse bên trong", app.md §8).
 */
export function tokenizeMarkdownLite(content: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  const parts = content.split(/```([\s\S]*?)```/);

  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      blocks.push({ type: 'codeblock', text: part.replace(/^\n/, '').replace(/\n$/, '') });
      return;
    }
    const lines = part.split('\n');
    let i2 = 0;
    let paragraphLines: string[] = [];
    const flushParagraph = () => {
      if (paragraphLines.length === 0) return;
      blocks.push({ type: 'paragraph', children: tokenizeEmphasis(paragraphLines.join('\n')) });
      paragraphLines = [];
    };
    while (i2 < lines.length) {
      const line = lines[i2] ?? '';
      if (isListLine(line)) {
        flushParagraph();
        const ordered = /^\d+\./.test(line);
        const items: InlineNode[][] = [];
        while (i2 < lines.length && isListLine(lines[i2] ?? '')) {
          const m = LIST_ITEM_RE.exec(lines[i2] ?? '');
          items.push(tokenizeEmphasis(m?.[1] ?? ''));
          i2 += 1;
        }
        blocks.push({ type: 'list', ordered, items });
        continue;
      }
      if (line !== '') paragraphLines.push(line);
      else flushParagraph();
      i2 += 1;
    }
    flushParagraph();
  });

  return blocks;
}
