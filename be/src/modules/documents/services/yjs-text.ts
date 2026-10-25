/**
 * Trích văn bản phẳng từ trạng thái Yjs của tài liệu (Y.XmlFragment `default` do Tiptap/y-prosemirror ghi) — THUẦN, không ProseMirror:
 * chỉ duyệt cây `XmlElement`/`XmlText`. Dùng cho tìm kiếm toàn workspace (p5-04) và số từ; nội dung khối tách bằng xuống dòng.
 */
import * as Y from "yjs";
import { normalizeSearch } from "../../../core/utils/normalize";
import { DOCUMENT_FRAGMENT } from "../../../shared/collab";

/** Nút khối: xuống dòng SAU nó (đoạn, tiêu đề, mục danh sách, trích dẫn, khối mã, hàng bảng…). */
const BLOCK_NODES = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableRow", "horizontalRule", "doc"]);
/** Ô bảng: ngăn cách bằng khoảng trắng. */
const CELL_NODES = new Set(["tableCell", "tableHeader"]);

export interface ExtractedText {
  text: string;
  normalizedText: string;
  wordCount: number;
}

/** Cắt chuỗi theo BYTE UTF-8 (không chẻ đôi ký tự): trần `plainTextMaxBytes`. */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  let end = Math.min(text.length, maxBytes);
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) end -= 1;
  // Không để lại nửa cặp surrogate ở cuối (emoji).
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/** Kết thúc một khối: đúng MỘT xuống dòng (khối lồng nhau như listItem > paragraph không sinh dòng trống thừa). */
function endBlock(out: string[]): void {
  const last = out[out.length - 1];
  if (last === undefined || last.endsWith("\n")) return;
  out.push("\n");
}

function collect(node: Y.XmlElement | Y.XmlText | Y.XmlHook | Y.XmlFragment, out: string[]): void {
  if (node instanceof Y.XmlText) {
    for (const op of node.toDelta() as Array<{ insert?: unknown }>) if (typeof op.insert === "string") out.push(op.insert);
    return;
  }
  if (node instanceof Y.XmlElement) {
    if (node.nodeName === "hardBreak") {
      out.push("\n");
      return;
    }
    if (CELL_NODES.has(node.nodeName)) {
      // Nội dung ô nằm trên MỘT dòng, các ô cách nhau bằng khoảng trắng.
      const inner: string[] = [];
      for (const child of node.toArray()) collect(child, inner);
      out.push(inner.join("").replace(/\n+$/, ""), " ");
      return;
    }
    for (const child of node.toArray()) collect(child, out);
    if (BLOCK_NODES.has(node.nodeName)) endBlock(out);
    return;
  }
  if (node instanceof Y.XmlFragment) for (const child of node.toArray()) collect(child, out);
  // XmlHook và nút lạ: bỏ qua.
}

export function extractPlainText(state: Uint8Array | null | undefined, maxBytes: number, field: string = DOCUMENT_FRAGMENT): ExtractedText {
  if (!state || state.byteLength === 0) return { text: "", normalizedText: "", wordCount: 0 };
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const out: string[] = [];
    collect(doc.getXmlFragment(field), out);
    const text = truncateUtf8(
      out
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
      maxBytes
    );
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return { text, normalizedText: truncateUtf8(normalizeSearch(text), maxBytes), wordCount };
  } finally {
    doc.destroy();
  }
}
