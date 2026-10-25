import type { Tokens } from "marked";
import type { Span } from "../../entities/block.interface";

/**
 * Token inline (marked) → `Span[]` phẳng — `strong`/`em`/`del`/`codespan` không lồng nhau trong nguồn thật nên chỉ đọc
 * một mức `tokens` con; token lạ (html, …) rơi về text thô của `raw` (không mất nội dung, không vỡ layout).
 *
 * `skip`: token KHÔNG đưa vào kết quả (tìm cả trong `strong`/`em`/`del` lồng nhau) — `md-to-blocks.ts` dùng để bỏ link
 * ảnh của buổi (đã tách thành khối `image`) khỏi phần chữ còn lại làm chú thích.
 */
/** Chữ của link là ĐƯỜNG DẪN tệp ("code/buoi-02-demo.html"), không phải lời mô tả ("Tài liệu MDN"). */
const FILE_PATH_TEXT = /^[\w.-]+(?:[\\/][\w.-]+)*\.[a-z0-9]{2,5}$/i;

function isFilePathText(text: string, href: string): boolean {
  if (!FILE_PATH_TEXT.test(text)) return false;
  // Có thư mục ("code/x.html") hoặc trùng ĐÚNG tên tệp của href — chặn "Node.js"/"Next.js" làm chữ của một link tương đối.
  return /[\\/]/.test(text) || href.split(/[?#]/)[0].split(/[\\/]/).pop() === text;
}

export function inlineToSpans(
  tokens: readonly Tokens.Generic[] | undefined,
  warnings: string[],
  skip?: ReadonlySet<unknown>
): Span[] {
  if (!tokens || tokens.length === 0) return [];
  const out: Span[] = [];
  for (const tok of tokens) {
    if (skip?.has(tok)) continue;
    switch (tok.type) {
      case "text":
      case "escape": {
        const text = (tok as Tokens.Text).text ?? (tok as Tokens.Generic).raw;
        if (text) push(out, { t: "text", v: decodeEntities(text) });
        break;
      }
      case "strong":
        for (const s of inlineToSpans((tok as Tokens.Strong).tokens, warnings, skip)) push(out, { ...s, t: s.t === "text" ? "bold" : s.t });
        break;
      case "em":
        for (const s of inlineToSpans((tok as Tokens.Em).tokens, warnings, skip)) push(out, { ...s, t: s.t === "text" ? "italic" : s.t });
        break;
      case "del":
        for (const s of inlineToSpans((tok as Tokens.Del).tokens, warnings, skip)) push(out, { ...s, t: s.t === "text" ? "strike" : s.t });
        break;
      case "codespan":
        push(out, { t: "code", v: decodeEntities((tok as Tokens.Codespan).text) });
        break;
      case "link": {
        const link = tok as Tokens.Link;
        const inner = inlineToSpans(link.tokens, warnings).map((s) => s.v).join("") || decodeEntities(link.text) || link.href;
        if (/^https?:\/\//i.test(link.href)) push(out, { t: "link", v: inner, href: link.href });
        // Link TƯƠNG ĐỐI tới tệp đi kèm giáo trình (`[code/demo.html](./code/demo.html)`) — không mở được trong app; hiện
        // như TÊN TỆP (đơn cách) để người học biết đó là tệp trong thư mục bài, không lẫn vào câu chữ.
        else if (isFilePathText(inner.trim(), link.href)) push(out, { t: "code", v: inner.trim() });
        else push(out, { t: "text", v: inner });
        break;
      }
      case "image": {
        // `![alt](src)` KHÔNG khớp ảnh nào của buổi (khớp thì `md-to-blocks.ts` đã tách thành khối `image` trước khi tới
        // đây) ⇒ giữ CHỮ `alt`. ⛔ Không rơi về `raw`: bản cũ in nguyên cú pháp `![alt](./code/x.svg)` ra màn người học.
        const alt = (tok as Tokens.Image).text;
        if (alt) push(out, { t: "text", v: decodeEntities(alt) });
        break;
      }
      case "br":
        push(out, { t: "text", v: "\n" });
        break;
      default: {
        const raw = (tok as Tokens.Generic).raw;
        if (raw) {
          warnings.push(`Bỏ qua cú pháp inline không hỗ trợ: "${raw.slice(0, 40)}"`);
          push(out, { t: "text", v: raw });
        }
      }
    }
  }
  return out;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: "\u00a0", quot: '"' };

/**
 * ⛔ `marked` 12 trả chữ inline/codespan ĐÃ mã hoá HTML (`<img>` → `&lt;img&gt;`, `'` → `&#39;`) — sẵn cho renderer
 * HTML, nhưng app vẽ chữ NATIVE nên in nguyên "&lt;img src=&quot;…&quot;&gt;" (giáo trình HTML/CSS dày đặc thẻ trong
 * backtick). Giải mã về đúng ký tự. Code block (```) không bị mã hoá nên không đi qua đây.
 * ⚠️ An toàn khi giải mã một lần: `marked` mã hoá `&` của chữ nguồn "&amp;" thành "&amp;amp;" trong codespan, nên bài
 * dạy thực thể HTML (`&amp;`) vẫn hiện đúng "&amp;".
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Gộp span liên tiếp cùng loại (cùng href nếu là link) để `blocks` gọn hơn. */
function push(out: Span[], span: Span): void {
  const last = out[out.length - 1];
  if (last && last.t === span.t && last.href === span.href) {
    last.v += span.v;
    return;
  }
  out.push(span);
}

/** Văn bản thuần từ Span[] — dùng để chuẩn hoá tiêu đề mục, sinh anchor. */
export function spansToText(spans: readonly Span[]): string {
  return spans.map((s) => s.v).join("");
}
