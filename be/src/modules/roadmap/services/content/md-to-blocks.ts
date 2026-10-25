import { marked, type Token, type Tokens } from "marked";
import { normalizeSearch } from "../../../../core/utils/normalize";
import type { Block, Span } from "../../entities/block.interface";
import { decodeEntities, inlineToSpans, spansToText } from "./inline";
import { mediaBlocksOf } from "./media-refs";

function makeAnchor(text: string, used: Map<string, number>): string {
  const base = normalizeSearch(text).replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-") || "muc";
  const n = used.get(base) ?? 0;
  used.set(base, n + 1);
  return n === 0 ? base : `${base}-${n}`;
}

interface DetailsFrame {
  summary: Span[] | null;
  blocks: Block[];
}

interface BuildContext {
  anchors: Map<string, number>;
  mediaByBasename: ReadonlyMap<string, string>;
  warnings: string[];
}

/** Trích `<summary>...</summary>` từ HTML thô (cùng token hoặc token html liền sau) — trả text đã bỏ thẻ con. */
function extractSummaryText(html: string): string | null {
  const m = /<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(html);
  if (!m) return null;
  return decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim();
}

/**
 * `bodyMd` (đã tách objectives/checklist/resources ở `lesson-sections.ts`) → `Block[]` (be.md §5.1). Chỉ dùng
 * `marked.lexer` (không renderer) — token lạ/HTML thô (trừ `<details><summary>`) bị bỏ, ghi vào `warnings`.
 * `mediaByBasename`: tên tệp (chữ thường) → mediaId của CHÍNH buổi này — đoạn văn/mục danh sách có link tới tên tệp này
 * (mockup import dạng `> 🖼️ **Ảnh mockup mẫu:** [code/x.svg](./code/x.svg) — …`, hoặc `![chú thích](media:<id>)` do
 * admin chèn) thành khối `image` ngay tại chỗ, chữ đi kèm làm chú thích (`media-refs.ts`); không khớp thì giữ nguyên chữ.
 */
export function markdownToBlocks(bodyMd: string, mediaByBasename: ReadonlyMap<string, string>, warnings: string[]): Block[] {
  const tokens = marked.lexer(bodyMd, { gfm: true, breaks: false });
  const ctx: BuildContext = { anchors: new Map(), mediaByBasename, warnings };
  const root: Block[] = [];
  const stack: DetailsFrame[] = [];
  const target = (): Block[] => (stack.length > 0 ? stack[stack.length - 1].blocks : root);

  for (const tok of tokens as Token[]) {
    if (tok.type === "html") {
      handleHtml((tok as Tokens.HTML).raw ?? (tok as Tokens.HTML).text, stack, target, warnings);
      continue;
    }
    target().push(...tokenToBlocks(tok, ctx));
  }

  if (stack.length > 0) warnings.push(`${stack.length} thẻ <details> chưa đóng — tự đóng ở cuối buổi`);
  while (stack.length > 0) {
    const frame = stack.pop() as DetailsFrame;
    (stack.length > 0 ? stack[stack.length - 1].blocks : root).push({ type: "details", summary: frame.summary ?? [], blocks: frame.blocks });
  }
  return root;
}

function handleHtml(raw: string, stack: DetailsFrame[], target: () => Block[], warnings: string[]): void {
  const opensDetails = /<details[^>]*>/i.test(raw);
  const closesDetails = /<\/details>/i.test(raw);
  if (opensDetails) {
    stack.push({ summary: extractSummaryText(raw) ? [{ t: "text", v: extractSummaryText(raw) as string }] : null, blocks: [] });
    if (!closesDetails) return;
  }
  if (closesDetails) {
    if (stack.length === 0) {
      warnings.push("Thẻ </details> không khớp — bỏ qua");
      return;
    }
    const frame = stack.pop() as DetailsFrame;
    target().push({ type: "details", summary: frame.summary ?? [], blocks: frame.blocks });
    return;
  }
  if (/^\s*<summary[^>]*>/i.test(raw) && stack.length > 0 && stack[stack.length - 1].summary === null) {
    const text = extractSummaryText(raw);
    if (text) {
      stack[stack.length - 1].summary = [{ t: "text", v: text }];
      return;
    }
  }
  const trimmed = raw.trim();
  if (trimmed.length > 0) warnings.push(`Bỏ qua HTML thô: "${trimmed.slice(0, 60)}"`);
}

/** Đoạn chữ inline → khối: có ảnh của buổi thì thành `image` (+ chú thích), không thì một `paragraph` (bỏ đoạn rỗng). */
function inlineToBlocks(inline: readonly Tokens.Generic[] | undefined, ctx: BuildContext): Block[] {
  const media = mediaBlocksOf(inline, ctx.mediaByBasename, ctx.warnings);
  if (media) return media;
  const spans = inlineToSpans(inline, ctx.warnings);
  return spans.length > 0 ? [{ type: "paragraph", spans }] : [];
}

function tokenToBlocks(tok: Token, ctx: BuildContext): Block[] {
  switch (tok.type) {
    case "space":
      return [];
    case "hr":
      return [{ type: "divider" }];
    case "heading": {
      const h = tok as Tokens.Heading;
      if (h.depth <= 1) return [];
      const level = Math.min(h.depth, 4) as 2 | 3 | 4;
      const spans = inlineToSpans(h.tokens, ctx.warnings);
      return [{ type: "heading", level, spans, anchor: makeAnchor(spansToText(spans) || h.text, ctx.anchors) }];
    }
    case "paragraph":
      return inlineToBlocks((tok as Tokens.Paragraph).tokens, ctx);
    case "text": {
      // Chỉ gặp ở mục danh sách "chặt" (tight) — chữ inline nằm trong `tokens` con.
      const text = tok as Tokens.Text;
      return inlineToBlocks((text.tokens ?? [text]) as Tokens.Generic[], ctx);
    }
    case "list": {
      const list = tok as Tokens.List;
      if (list.items.every((it) => it.task)) {
        return [
          {
            type: "checklist",
            items: list.items.map((it, i) => ({ id: `t_${i}`, spans: inlineToSpans(listItemInline(it), ctx.warnings), checked: !!it.checked })),
          },
        ];
      }
      return [
        {
          type: "list",
          ordered: list.ordered === true,
          ...(typeof list.start === "number" && list.start !== 1 ? { start: list.start } : {}),
          items: list.items.map((it) => it.tokens.flatMap((t) => tokenToBlocks(t, ctx))),
        },
      ];
    }
    case "code": {
      const c = tok as Tokens.Code;
      return [{ type: "code", lang: c.lang ? c.lang.split(/\s/)[0] : null, code: c.text }];
    }
    case "table": {
      const t = tok as Tokens.Table;
      return [
        {
          type: "table",
          align: t.align.map((a) => (a === "center" || a === "left" || a === "right" ? a : null)),
          header: t.header.map((cell) => inlineToSpans(cell.tokens, ctx.warnings)),
          rows: t.rows.map((row) => row.map((cell) => inlineToSpans(cell.tokens, ctx.warnings))),
        },
      ];
    }
    case "blockquote":
      return hoistImages((tok as Tokens.Blockquote).tokens.flatMap((t) => tokenToBlocks(t, ctx)));
    default:
      if ("raw" in tok && typeof tok.raw === "string" && tok.raw.trim()) {
        ctx.warnings.push(`Bỏ qua khối không hỗ trợ (${tok.type}): "${tok.raw.trim().slice(0, 60)}"`);
      }
      return [];
  }
}

/**
 * Ảnh ở ĐẦU/CUỐI một trích dẫn đưa ra NGOÀI trích dẫn: mockup trong giáo trình luôn mở đầu một khối `>` (ảnh → thời
 * gian → mục tiêu). Để ảnh trong trích dẫn thì nó bị ép hẹp sau vạch trái và thụt lề — hình nhỏ đi đúng chỗ cần xem rõ.
 */
function hoistImages(inner: Block[]): Block[] {
  let start = 0;
  while (start < inner.length && inner[start].type === "image") start += 1;
  let end = inner.length;
  while (end > start && inner[end - 1].type === "image") end -= 1;
  const middle = inner.slice(start, end);
  const quote: Block[] = middle.length > 0 ? [{ type: "quote", blocks: middle }] : [];
  return [...inner.slice(0, start), ...quote, ...inner.slice(end)];
}

/** Nội dung inline "phẳng" của một mục danh sách (tight list: item.tokens = [{type:'text', tokens:[...]}]). */
function listItemInline(item: Tokens.ListItem): Tokens.Generic[] {
  const first = item.tokens[0];
  if (first && first.type === "text" && "tokens" in first && first.tokens) return first.tokens as Tokens.Generic[];
  if (first && first.type === "text") return [first as Tokens.Generic];
  return item.tokens as unknown as Tokens.Generic[];
}
