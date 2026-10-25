/**
 * Dựng trạng thái Yjs của TÀI LIỆU (Y.XmlFragment `default` do Tiptap/y-tiptap ghi) từ một mô tả khối đơn giản — KHÔNG cần ProseMirror/Tiptap:
 * chỉ cần `yjs` (có sẵn trong `be/node_modules`). Mã hoá khớp `createTypeFromElementNode`/`createTypeFromTextNodes` của y-tiptap
 * (thuộc tính nút khác `null` → `setAttribute`; đoạn chữ là một `Y.XmlText` với `attributes` = mark → thuộc tính của mark) và schema ở
 * `collab/editor-web/src/editor-factory.ts` (StarterKit + TaskList/TaskItem + Table). Trạng thái này chính là thứ BE giữ ở `Document.yjsState`.
 */
import * as Y from "yjs";
import { normalizeSearch } from "../../../../src/core/utils/normalize";

/** Tên Y.XmlFragment chứa nội dung — phải đúng `DOCUMENT_FRAGMENT` của BE (`shared/collab/yjs-state.ts`). */
export const DOCUMENT_FIELD = "default";

/**
 * Chữ có định dạng nhẹ: `**đậm**`, `__nghiêng__`, `` `mã` ``, `[chữ](https://liên-kết)`. Không lồng nhau.
 * Khối: ["h1"|"h2"|"h3", chữ] · ["p", chữ] · ["ul"|"ol", mục[]] · ["todo", [đã xong, chữ][]] · ["quote", chữ] · ["code", mã, ngôn ngữ?] · ["table", hàng[][]] (hàng đầu là tiêu đề) · ["hr"].
 */
export type Block =
  | readonly ["h1" | "h2" | "h3" | "p" | "quote", string]
  | readonly ["ul" | "ol", readonly string[]]
  | readonly ["todo", ReadonlyArray<readonly [boolean, string]>]
  | readonly ["code", string, string?]
  | readonly ["table", ReadonlyArray<readonly string[]>]
  | readonly ["hr"];

const INLINE_RE = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g;
type Attrs = Record<string, unknown>;
interface Run {
  insert: string;
  attributes?: Attrs;
}

/** Tách chuỗi định dạng nhẹ thành các đoạn chữ kèm mark (đúng tên mark của Tiptap: bold, italic, code, link). */
export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) runs.push({ insert: text.slice(last, at) });
    if (m[1] !== undefined) runs.push({ insert: m[1], attributes: { bold: {} } });
    else if (m[2] !== undefined) runs.push({ insert: m[2], attributes: { italic: {} } });
    else if (m[3] !== undefined) runs.push({ insert: m[3], attributes: { code: {} } });
    else runs.push({ insert: m[4], attributes: { link: { href: m[5], target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null } } });
    last = at + m[0].length;
  }
  if (last < text.length) runs.push({ insert: text.slice(last) });
  return runs.filter((r) => r.insert.length > 0);
}

function element(name: string, attrs: Attrs, children: Array<Y.XmlElement | Y.XmlText>): Y.XmlElement {
  const el = new Y.XmlElement(name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v as string);
  if (children.length > 0) el.insert(0, children);
  return el;
}

function textNode(runs: Run[]): Y.XmlText {
  const t = new Y.XmlText();
  t.applyDelta(runs);
  return t;
}

/** Đoạn văn chứa chữ có định dạng; chuỗi rỗng → đoạn trống (không có nút con), đúng như ProseMirror. */
const paragraph = (text: string): Y.XmlElement => element("paragraph", {}, parseInline(text).length > 0 ? [textNode(parseInline(text))] : []);
const listOf = (name: string, attrs: Attrs, items: readonly string[]): Y.XmlElement =>
  element(name, attrs, items.map((item) => element("listItem", {}, [paragraph(item)])));

function blockToXml(block: Block): Y.XmlElement {
  switch (block[0]) {
    case "h1":
    case "h2":
    case "h3":
      return element("heading", { level: Number(block[0][1]) }, parseInline(block[1]).length > 0 ? [textNode(parseInline(block[1]))] : []);
    case "p":
      return paragraph(block[1]);
    case "quote":
      return element("blockquote", {}, [paragraph(block[1])]);
    case "ul":
      return listOf("bulletList", {}, block[1]);
    case "ol":
      return listOf("orderedList", { start: 1 }, block[1]);
    case "todo":
      return element("taskList", {}, block[1].map(([done, text]) => element("taskItem", { checked: done }, [paragraph(text)])));
    case "code":
      return element("codeBlock", { language: block[2] ?? null }, block[1].length > 0 ? [textNode([{ insert: block[1] }])] : []);
    case "table":
      return element(
        "table",
        {},
        block[1].map((row, r) => element("tableRow", {}, row.map((cell) => element(r === 0 ? "tableHeader" : "tableCell", { colspan: 1, rowspan: 1 }, [paragraph(cell)]))))
      );
    case "hr":
      return element("horizontalRule", {}, []);
  }
}

export interface BuiltDoc {
  /** Trạng thái Yjs đầy đủ sau khi thêm hết khối. */
  state: Uint8Array;
  /** Trạng thái sau `k` khối đầu, theo thứ tự `checkpoints` (dùng làm bản lưu cũ — lịch sử phiên bản). */
  checkpoints: Uint8Array[];
}

/**
 * Dựng tài liệu bằng cách thêm DẦN từng khối vào MỘT Y.Doc (cùng clientID — như một người gõ liên tục) và chụp trạng thái tại các mốc `at`
 * (số khối đã có). `clientId` cố định theo tiêu đề nên dựng lại ra cùng byte.
 */
export function buildDocument(blocks: readonly Block[], clientId: number, at: readonly number[] = []): BuiltDoc {
  const doc = new Y.Doc();
  doc.clientID = clientId;
  const fragment = doc.getXmlFragment(DOCUMENT_FIELD);
  const checkpoints: Uint8Array[] = [];
  blocks.forEach((block, i) => {
    fragment.insert(fragment.length, [blockToXml(block)]);
    if (at.includes(i + 1)) checkpoints.push(Y.encodeStateAsUpdate(doc));
  });
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return { state, checkpoints };
}

/** clientID Yjs cố định theo chuỗi gốc (số nguyên dương 32 bit) — dựng lại tài liệu ra cùng byte. */
export function clientIdFor(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return (h % 2_000_000_000) + 1;
}

const BLOCK_NODES = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableRow", "horizontalRule"]);
const CELL_NODES = new Set(["tableCell", "tableHeader"]);

function collect(node: Y.XmlElement | Y.XmlText | Y.XmlFragment | Y.XmlHook, out: string[]): void {
  if (node instanceof Y.XmlText) {
    for (const op of node.toDelta() as Array<{ insert?: unknown }>) if (typeof op.insert === "string") out.push(op.insert);
    return;
  }
  if (node instanceof Y.XmlElement) {
    if (CELL_NODES.has(node.nodeName)) {
      const inner: string[] = [];
      for (const child of node.toArray()) collect(child, inner);
      out.push(inner.join("").replace(/\n+$/, ""), " ");
      return;
    }
    for (const child of node.toArray()) collect(child, out);
    if (BLOCK_NODES.has(node.nodeName) && out.length > 0 && !(out[out.length - 1] ?? "").endsWith("\n")) out.push("\n");
    return;
  }
  if (node instanceof Y.XmlFragment) for (const child of node.toArray()) collect(child, out);
}

/** Văn bản phẳng + chữ chuẩn hoá + số từ — cùng cách BE tính ở job `document.plaintext` (`services/yjs-text.ts`). */
export function extractText(state: Uint8Array): { plainText: string; normalizedText: string; wordCount: number } {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const out: string[] = [];
    collect(doc.getXmlFragment(DOCUMENT_FIELD), out);
    const plainText = out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { plainText, normalizedText: normalizeSearch(plainText), wordCount: plainText.split(/\s+/).filter(Boolean).length };
  } finally {
    doc.destroy();
  }
}
