import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { runCommand } from "../src/commands";
import { estimateStateBytes } from "../src/state-size";
import { cmdCtx, makeEditor, type EditorHarness } from "./helpers/editor-harness";

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function peer(doc = new Y.Doc()): EditorHarness {
  const h = makeEditor({ doc });
  editors.push(h.editor);
  return h;
}

/** Nối hai Y.Doc như server làm (mọi update của bên này áp sang bên kia). */
function link(a: Y.Doc, b: Y.Doc): void {
  a.on("update", (u: Uint8Array, origin: unknown) => origin !== "relay" && Y.applyUpdate(b, u, "relay"));
  b.on("update", (u: Uint8Array, origin: unknown) => origin !== "relay" && Y.applyUpdate(a, u, "relay"));
}

/** Đồng bộ hai chiều một lần (như nối lại sau khi mất mạng: SyncStep1/2). */
function syncOnce(a: Y.Doc, b: Y.Doc): void {
  const ua = Y.encodeStateAsUpdate(a);
  const ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(b, ua, "relay");
  Y.applyUpdate(a, ub, "relay");
}

describe("hội tụ giữa các editor (CW-05/CW-06 phía client)", () => {
  it("hai người gõ liên tục: cả hai thấy cùng nội dung", () => {
    const a = peer();
    const b = peer();
    link(a.doc, b.doc);
    a.editor.commands.insertContent("Xin chào");
    b.editor.commands.focus("end");
    b.editor.commands.insertContent(" thế giới");
    expect(a.editor.getText()).toBe(b.editor.getText());
    expect(a.editor.getText()).toContain("Xin chào");
    expect(a.editor.getText()).toContain("thế giới");
    expect(a.editor.getJSON()).toEqual(b.editor.getJSON());
  });

  it("mất mạng rồi cùng sửa: hợp nhất hai chiều, không mất ký tự", () => {
    const a = peer();
    const b = peer();
    a.editor.commands.insertContent("Nền tảng học tập");
    syncOnce(a.doc, b.doc);
    expect(b.editor.getText()).toBe("Nền tảng học tập");

    // offline: A thêm đầu dòng, B thêm cuối dòng
    a.editor.commands.setTextSelection(1);
    a.editor.commands.insertContent("[A] ");
    b.editor.commands.focus("end");
    b.editor.commands.insertContent(" [B]");

    syncOnce(a.doc, b.doc);
    expect(a.editor.getJSON()).toEqual(b.editor.getJSON());
    const text = a.editor.getText();
    expect(text).toContain("[A]");
    expect(text).toContain("[B]");
    expect(text).toContain("Nền tảng học tập");
  });

  it("hai máy cùng mở tài liệu TRỐNG và cùng gõ trước khi đồng bộ: giữ đủ cả hai phần (không ghi đè)", () => {
    const a = peer();
    const b = peer();
    a.editor.commands.insertContent("Phần của A");
    b.editor.commands.insertContent("Phần của B");
    syncOnce(a.doc, b.doc);
    expect(a.editor.getJSON()).toEqual(b.editor.getJSON());
    expect(a.editor.getText()).toContain("Phần của A");
    expect(a.editor.getText()).toContain("Phần của B");
  });

  it("định dạng cũng đồng bộ (đậm, danh sách)", () => {
    const a = peer();
    const b = peer();
    link(a.doc, b.doc);
    a.editor.commands.insertContent("Mục 1");
    a.editor.commands.selectAll();
    runCommand(cmdCtx(a.editor), { name: "bold" });
    runCommand(cmdCtx(a.editor), { name: "bulletList" });
    expect(b.editor.getHTML()).toBe("<ul><li><p><strong>Mục 1</strong></p></li></ul>");
  });

  it("hoàn tác chỉ gỡ thay đổi CỦA MÌNH, không phá nội dung người khác", () => {
    const a = peer();
    const b = peer();
    link(a.doc, b.doc);
    a.editor.commands.insertContent("Của A");
    b.editor.commands.focus("end");
    b.editor.commands.insertContent(" và của B");
    expect(runCommand(cmdCtx(a.editor), { name: "undo" })).toEqual({ ok: true });
    expect(a.editor.getText()).toBe(" và của B");
    expect(b.editor.getText()).toBe(" và của B");
  });
});

describe("hợp đồng với BE (`collab/README.md` §3, `be/.../yjs-text.ts`)", () => {
  /** Bản sao ngắn của `extractPlainText` ở BE: chỉ duyệt XmlElement/XmlText của fragment `default` — để chứng minh nội dung editor đọc được từ phía server. */
  const BLOCKS = new Set(["paragraph", "heading", "blockquote", "codeBlock", "listItem", "taskItem", "tableRow", "horizontalRule"]);
  function extract(doc: Y.Doc): string {
    const out: string[] = [];
    const walk = (n: Y.XmlElement | Y.XmlText | Y.XmlFragment): void => {
      if (n instanceof Y.XmlText) {
        for (const op of n.toDelta() as Array<{ insert?: unknown }>) if (typeof op.insert === "string") out.push(op.insert);
        return;
      }
      if (n instanceof Y.XmlElement && n.nodeName === "hardBreak") return void out.push("\n");
      for (const child of n.toArray()) walk(child as Y.XmlElement | Y.XmlText);
      if (n instanceof Y.XmlElement && BLOCKS.has(n.nodeName) && !out.at(-1)?.endsWith("\n")) out.push("\n");
    };
    walk(doc.getXmlFragment("default"));
    return out.join("").trim();
  }

  it("nội dung nằm ở Y.XmlFragment tên `default` (không còn chia sẻ nào khác)", () => {
    const a = peer();
    a.editor.commands.insertContent("x");
    expect([...a.doc.share.keys()]).toEqual(["default"]);
    expect(a.doc.getXmlFragment("default").length).toBeGreaterThan(0);
  });

  it("tên node đúng bảng mà BE nhận biết (tách text/tìm kiếm), text tiếng Việt và mark không làm hỏng việc trích", () => {
    const a = peer();
    a.editor.commands.setContent(
      {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Kế hoạch tuần" }] },
          { type: "paragraph", content: [{ type: "text", text: "Học ", marks: [] }, { type: "text", text: "tiếng Việt", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "dòng mới" }] },
          { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "gạch đầu dòng" }] }] }] },
          { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "đánh số" }] }] }] },
          { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "việc đã xong" }] }] }] },
          { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "trích dẫn" }] }] },
          { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
          { type: "horizontalRule" },
          {
            type: "table",
            content: [
              { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Cột A" }] }] }] },
              { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "ô 1" }] }] }] },
            ],
          },
          { type: "image", attrs: { assetId: "64b7f0c2a1d3e4f5a6b7c8d9" } },
        ],
      },
      { emitUpdate: true },
    );
    // `nodeName` phân biệt hoa/thường (BE so khớp đúng chuỗi); `XmlFragment.toString()` thì hạ chữ thường nên không dùng để kiểm.
    const found = new Set<string>();
    const collect = (n: Y.XmlElement | Y.XmlText | Y.XmlFragment): void => {
      if (n instanceof Y.XmlElement) found.add(n.nodeName);
      if (!(n instanceof Y.XmlText)) for (const child of n.toArray()) collect(child as Y.XmlElement | Y.XmlText);
    };
    collect(a.doc.getXmlFragment("default"));
    expect([...found].sort()).toEqual(["blockquote", "bulletList", "codeBlock", "hardBreak", "heading", "horizontalRule", "image", "listItem", "orderedList", "paragraph", "table", "tableCell", "tableHeader", "tableRow", "taskItem", "taskList"]);
    const text = extract(a.doc);
    for (const piece of ["Kế hoạch tuần", "Học tiếng Việt", "dòng mới", "gạch đầu dòng", "đánh số", "việc đã xong", "trích dẫn", "const x = 1;", "Cột A", "ô 1"]) {
      expect(text, piece).toContain(piece);
    }
    expect(text).not.toContain("64b7f0c2"); // ảnh không rò assetId vào text tìm kiếm
  });

  it("KHOÁ SCHEMA: thêm/đổi node hoặc mark là thay đổi phá vỡ tương thích (xem cảnh báo)", () => {
    /*
     * y-tiptap tự XOÁ khỏi Y.Doc dùng chung mọi node mà schema của máy này không dựng được (unknown node / sai cấu trúc) — tức là một bản app CŨ
     * mở tài liệu có node mới sẽ XOÁ node đó cho MỌI NGƯỜI. Vì vậy mỗi lần đổi tập node/mark dưới đây phải đi kèm cơ chế chặn phiên bản app cũ
     * (cờ tính năng + phiên bản app tối thiểu) và cập nhật contract-editor-web.md. Test này chỉ để bắt buộc người sửa dừng lại đọc.
     */
    const a = peer();
    expect(Object.keys(a.editor.schema.nodes).sort()).toEqual(
      ["blockquote", "bulletList", "codeBlock", "doc", "hardBreak", "heading", "horizontalRule", "image", "listItem", "orderedList", "paragraph", "table", "tableCell", "tableHeader", "tableRow", "taskItem", "taskList", "text"].sort(),
    );
    expect(Object.keys(a.editor.schema.marks).sort()).toEqual(["bold", "code", "italic", "link", "strike", "underline"]);
  });
});

describe("ước lượng dung lượng state", () => {
  it("bỏ phần đã xoá mà UndoManager còn giữ (server đã GC): sau khi xoá hết thì số đo nhỏ", () => {
    const a = peer();
    for (let i = 0; i < 30; i += 1) a.editor.commands.insertContent("x".repeat(40));
    const raw = () => Y.encodeStateAsUpdate(a.doc).byteLength;
    const filled = raw();
    expect(estimateStateBytes(a.doc, 100)).toBe(filled);
    a.editor.commands.clearContent();
    expect(raw()).toBeGreaterThanOrEqual(filled); // Y.Doc cục bộ vẫn phình vì lịch sử hoàn tác
    expect(estimateStateBytes(a.doc, 100)).toBeLessThan(filled / 5);
    // Dưới ngưỡng mềm thì dùng số đo thô (không tốn thêm một lượt mã hoá).
    expect(estimateStateBytes(a.doc, filled * 10)).toBe(raw());
  });
});
