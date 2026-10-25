import type { Tokens } from "marked";
import type { Block } from "../../entities/block.interface";
import { inlineToSpans, spansToText } from "./inline";

const IMAGE_EXT = /\.(svg|png|jpe?g|gif|webp)$/i;
/** Chú thích dài hơn thế này thì đoạn văn là NỘI DUNG thật chứ không phải lời giới thiệu ảnh — giữ đoạn, ảnh xếp sau. */
const CAPTION_MAX_CHARS = 280;
/** Đoạn ngắn không có nhãn ("Xem x.svg để chi tiết.") — chữ còn lại vô nghĩa khi bỏ link ⇒ đặt tên ảnh theo tệp. */
const SHORT_TEXT_CHARS = 60;
const PICTOGRAPH = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+/gu;
/** "— mở trong trình duyệt để xem …": lời dặn của giáo trình dạng TỆP — trong app ảnh đã hiện ngay tại chỗ. */
const OPEN_IN_BROWSER = /\s*[—–-]?\s*(?:hãy\s+)?mở\s+(?:(?:file|tệp)\s+)?(?:này\s+)?(?:trong|bằng)\s+trình\s+duyệt(?:\s+để\s+xem)?\s*/giu;
/** "Ảnh mockup mẫu: …" — nhãn đứng trước dấu hai chấm (app tách thành tiêu đề của hình). */
const HAS_LABEL = /^\s*[^:\n]{2,60}:/;

/** Tên tệp (bỏ thư mục, `?query`, `#hash`), giữ nguyên chữ hoa/thường. */
export function fileBasename(path: string): string {
  const clean = path.split(/[?#]/)[0];
  const parts = clean.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}

/** `homework/product-card-mockup.svg` → "Product card mockup" — tên hình khi nguồn không có chú thích. */
export function prettyFileName(path: string): string {
  const base = fileBasename(path).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Hình minh hoạ";
}

/**
 * Chữ còn lại của đoạn giới thiệu ảnh → chú thích gọn: bỏ emoji, bỏ "mở trong trình duyệt để xem", bỏ ngoặc rỗng và
 * dấu câu treo. "🖼️ Ảnh mockup mẫu: — mở trong trình duyệt để xem layout…" → "Ảnh mockup mẫu: layout…".
 */
export function cleanMediaCaption(text: string): string {
  return text
    .replace(PICTOGRAPH, " ")
    .replace(OPEN_IN_BROWSER, " — ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s*:\s*(?:[—–-]\s*)+/g, ": ")
    .replace(/\s*[—–]\s*(?:[—–-]\s*)+/g, " — ")
    .replace(/^[\s:;,.—–-]+|[\s:;,.—–-]+$/g, "")
    .trim();
}

interface MediaLink {
  mediaId: string;
  token: Tokens.Link | Tokens.Image | Tokens.Codespan;
}

/** Link/ảnh trỏ tới tệp ảnh CỦA CHÍNH buổi (khớp tên tệp) — tìm cả trong `strong`/`em`/`del` lồng nhau. */
function collectMediaLinks(tokens: readonly Tokens.Generic[] | undefined, mediaByBasename: ReadonlyMap<string, string>, out: MediaLink[]): MediaLink[] {
  for (const tok of tokens ?? []) {
    if (tok.type === "link" || tok.type === "image") {
      const link = tok as Tokens.Link | Tokens.Image;
      // `media:<id>` — ảnh admin tải lên rồi chèn vào bài (không có tệp nguồn, khoá theo id — `upgrade-blocks.ts`).
      const byId = /^media:/i.test(link.href.trim());
      const key = byId ? link.href.trim().slice(6).toLowerCase() : fileBasename(link.href).toLowerCase();
      const mediaId = byId || IMAGE_EXT.test(key) ? mediaByBasename.get(key) : undefined;
      if (mediaId) out.push({ mediaId, token: link });
      continue;
    }
    if (tok.type === "codespan") {
      // "Mở mockup `code/erd-ecommerce-mockup.svg`, …" — tác giả ghi ĐƯỜNG DẪN trong backtick thay vì link. Chỉ nhận chữ
      // có thư mục + đuôi ảnh + KHỚP tệp của buổi: `./assets/avatar.png` trong bài dạy HTML không phải tệp của buổi.
      const code = tok as Tokens.Codespan;
      const key = fileBasename(code.text).toLowerCase();
      const mediaId = /[\\/]/.test(code.text) && IMAGE_EXT.test(key) ? mediaByBasename.get(key) : undefined;
      if (mediaId) out.push({ mediaId, token: code });
      continue;
    }
    const children = (tok as { tokens?: Tokens.Generic[] }).tokens;
    if (Array.isArray(children)) collectMediaLinks(children, mediaByBasename, out);
  }
  return out;
}

/** Tên hình từ chính link: chữ của link nếu là lời mô tả, còn nếu chữ chỉ là đường dẫn/tên tệp thì suy từ tên tệp. */
function linkName({ token }: MediaLink): string {
  if (token.type === "codespan") return prettyFileName(token.text);
  const inner = token.type === "image" ? token.text : spansToText(inlineToSpans(token.tokens, [])) || token.text;
  const text = (inner ?? "").trim();
  return text && !/[/\\]/.test(text) && !IMAGE_EXT.test(text) ? text : prettyFileName(token.href);
}

/** MỘT dòng có ảnh → khối `image` (chữ còn lại của dòng làm chú thích); `null` khi dòng không có ảnh nào của buổi. */
function lineMediaBlocks(line: readonly Tokens.Generic[], mediaByBasename: ReadonlyMap<string, string>, warnings: string[]): Block[] | null {
  const links = collectMediaLinks(line, mediaByBasename, []);
  if (links.length === 0) return null;
  const restSpans = inlineToSpans(line, warnings, new Set<unknown>(links.map((l) => l.token)));
  const restText = spansToText(restSpans).replace(PICTOGRAPH, " ");
  const caption = cleanMediaCaption(restText);
  const image = (link: MediaLink, alt: string): Block => ({ type: "image", mediaId: link.mediaId, alt });

  if (caption.length > CAPTION_MAX_CHARS) return [{ type: "paragraph", spans: restSpans }, ...links.map((l) => image(l, linkName(l)))];
  const useCaption = caption.length > 0 && (HAS_LABEL.test(restText) || caption.length > SHORT_TEXT_CHARS);
  return links.map((l, i) => image(l, useCaption && i === 0 ? caption : linkName(l)));
}

/**
 * Tách dãy token inline theo dấu xuống dòng MỀM ("\n" trong token `text` cấp ngoài cùng): trích dẫn của giáo trình hay
 * dồn hai dòng khác nghĩa vào MỘT đoạn (`> 🎬 _Mở demo.html…_` rồi `> 🖼️ _Mockup chi tiết: x.svg_`) — gộp chung thì câu
 * về tệp demo thành chú thích của ảnh.
 */
function splitLines(tokens: readonly Tokens.Generic[]): Tokens.Generic[][] {
  const lines: Tokens.Generic[][] = [[]];
  for (const tok of tokens) {
    const text = (tok as { text?: unknown }).text;
    const nested = (tok as { tokens?: unknown[] }).tokens;
    if (tok.type === "text" && typeof text === "string" && text.includes("\n") && !nested?.length) {
      text.split("\n").forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ ...tok, raw: part, text: part });
      });
      continue;
    }
    lines[lines.length - 1].push(tok);
  }
  return lines;
}

const LINE_BREAK: Tokens.Generic = { type: "text", raw: "\n", text: "\n" };

/**
 * Đoạn văn (hoặc mục danh sách) có link tới ảnh CỦA CHÍNH buổi → khối `image` NGAY TẠI CHỖ, chữ còn lại của cùng dòng
 * làm chú thích; các dòng không có ảnh giữ nguyên thành đoạn văn (đúng thứ tự). `null` = đoạn không có ảnh nào của buổi.
 *
 * ⚠️ Vì sao không chỉ nhận "đoạn CHỈ có một link" như bản đầu: giáo trình viết mockup theo khuôn
 * `> 🖼️ **Ảnh mockup mẫu:** [code/x.svg](./code/x.svg) — mở trong trình duyệt để xem …` (chữ đi kèm > 60 ký tự, link
 * nằm trong trích dẫn/in nghiêng/mục danh sách). Khuôn cũ bỏ sót gần hết ⇒ link tương đối hạ thành CHỮ, người học thấy
 * "code/x.svg — mở trong trình duyệt để xem" thay vì thấy ảnh.
 */
export function mediaBlocksOf(inline: readonly Tokens.Generic[] | undefined, mediaByBasename: ReadonlyMap<string, string>, warnings: string[]): Block[] | null {
  const tokens = inline ?? [];
  if (collectMediaLinks(tokens, mediaByBasename, []).length === 0) return null;
  const out: Block[] = [];
  let pending: Tokens.Generic[] = [];
  const flush = () => {
    const spans = inlineToSpans(pending, warnings);
    if (spansToText(spans).trim()) out.push({ type: "paragraph", spans });
    pending = [];
  };
  for (const line of splitLines(tokens)) {
    const media = lineMediaBlocks(line, mediaByBasename, warnings);
    if (media) {
      flush();
      out.push(...media);
    } else {
      if (pending.length > 0) pending.push(LINE_BREAK);
      pending.push(...line);
    }
  }
  flush();
  return out;
}
