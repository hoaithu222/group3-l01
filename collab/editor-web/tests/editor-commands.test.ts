import type { Editor, JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import type { CommandPayload } from "../src/bridge-protocol";
import { runCommand } from "../src/commands";
import { computeSelectionState } from "../src/selection-state";
import { cmdCtx, makeEditor, type EditorHarness } from "./helpers/editor-harness";

let h: EditorHarness;
afterEach(() => h?.editor.destroy());

const run = (command: CommandPayload, o: Parameters<typeof cmdCtx>[1] = {}) => runCommand(cmdCtx(h.editor, o), command);
const names = (editor: Editor): string[] => (editor.getJSON().content ?? []).map((n) => n.type ?? "?");

function withText(text = "Xin chào thế giới") {
  h = makeEditor();
  h.editor.commands.insertContent(text);
  h.editor.commands.selectAll();
}

describe("lệnh toolbar → đúng node/mark ProseMirror", () => {
  it.each([
    ["bold", "bold"],
    ["italic", "italic"],
    ["underline", "underline"],
    ["strike", "strike"],
    ["code", "code"],
  ] as const)("%s bật/tắt mark trên vùng chọn", (name, mark) => {
    withText();
    expect(run({ name })).toEqual({ ok: true });
    expect(h.editor.getJSON().content?.[0]?.content?.[0]?.marks?.map((m) => m.type)).toEqual([mark]);
    expect(computeSelectionState(h.editor, true)[mark]).toBe(true);
    run({ name });
    expect(h.editor.getJSON().content?.[0]?.content?.[0]?.marks).toBeUndefined();
  });

  it("heading 1–3 và trả về đoạn văn", () => {
    withText("Tiêu đề");
    for (const level of [1, 2, 3] as const) {
      expect(run({ name: "heading", attrs: { level } })).toEqual({ ok: true });
      expect(h.editor.getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level } });
      expect(computeSelectionState(h.editor, true).heading).toBe(level);
    }
    run({ name: "paragraph" });
    expect(names(h.editor)).toEqual(["paragraph"]);
    expect(computeSelectionState(h.editor, true).heading).toBeNull();
  });

  it.each([
    ["bulletList", ["bulletList", "listItem"]],
    ["orderedList", ["orderedList", "listItem"]],
    ["taskList", ["taskList", "taskItem"]],
  ] as const)("%s", (name, [list, item]) => {
    withText("Việc cần làm");
    expect(run({ name })).toEqual({ ok: true });
    const top = h.editor.getJSON().content?.[0];
    expect(top?.type).toBe(list);
    expect(top?.content?.[0]?.type).toBe(item);
    expect(computeSelectionState(h.editor, true)[name]).toBe(true);
    run({ name });
    expect(names(h.editor)).toEqual(["paragraph"]);
  });

  it("blockquote và codeBlock bật/tắt", () => {
    withText("Trích dẫn");
    run({ name: "blockquote" });
    expect(names(h.editor)).toEqual(["blockquote"]);
    h.editor.commands.setTextSelection(3);
    run({ name: "blockquote" });
    expect(names(h.editor)).toEqual(["paragraph"]);

    withText("Mã nguồn");
    run({ name: "codeBlock" });
    expect(names(h.editor)).toEqual(["codeBlock"]);
    expect(computeSelectionState(h.editor, true).codeBlock).toBe(true);
    run({ name: "codeBlock" });
    expect(names(h.editor)).toEqual(["paragraph"]);
  });

  it("horizontalRule chèn đường kẻ", () => {
    withText("Trên");
    run({ name: "horizontalRule" });
    expect(names(h.editor)).toContain("horizontalRule");
  });

  it("indent/outdent trong danh sách (cả checklist); ngoài danh sách → not-applicable", () => {
    h = makeEditor();
    h.editor.commands.insertContent({
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
      ],
    });
    expect(run({ name: "indent" })).toEqual({ ok: true });
    expect(JSON.stringify(h.editor.getJSON())).toContain('"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]},{"type":"bulletList"');
    expect(run({ name: "outdent" })).toEqual({ ok: true });

    withText("Không phải danh sách");
    expect(run({ name: "indent" })).toEqual({ ok: false, reason: "not-applicable" });
  });

  it("clearFormatting gỡ mark và đưa khối về đoạn văn", () => {
    withText("Đậm và tiêu đề");
    run({ name: "bold" });
    run({ name: "heading", attrs: { level: 2 } });
    run({ name: "clearFormatting" });
    expect(h.editor.getJSON().content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "Đậm và tiêu đề" }] }]);
  });

  it("undo/redo theo Yjs UndoManager (Collaboration), không dùng undoRedo chuẩn", () => {
    h = makeEditor();
    h.editor.commands.insertContent("abc");
    expect(computeSelectionState(h.editor, true).canUndo).toBe(true);
    expect(run({ name: "undo" })).toEqual({ ok: true });
    expect(h.editor.getText()).toBe("");
    expect(computeSelectionState(h.editor, true).canRedo).toBe(true);
    expect(run({ name: "redo" })).toEqual({ ok: true });
    expect(h.editor.getText()).toBe("abc");
    expect(run({ name: "redo" })).toEqual({ ok: false, reason: "not-applicable" });
    expect(h.editor.extensionManager.extensions.map((e) => e.name)).not.toContain("undoRedo");
  });
});

describe("liên kết", () => {
  it("đặt trên vùng chọn, đọc lại qua selectionState, gỡ được", () => {
    withText("trang chủ");
    expect(run({ name: "link", attrs: { href: "https://vci.vn" } })).toEqual({ ok: true });
    expect(computeSelectionState(h.editor, true).link).toBe("https://vci.vn");
    const mark = h.editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0];
    expect(mark).toMatchObject({ type: "link", attrs: { href: "https://vci.vn", target: "_blank", rel: "noopener noreferrer nofollow" } });
    expect(run({ name: "link", attrs: { href: null } })).toEqual({ ok: true });
    expect(computeSelectionState(h.editor, true).link).toBeNull();
  });

  it("chọn rỗng ngoài liên kết → chèn chính URL làm chữ liên kết", () => {
    h = makeEditor();
    expect(run({ name: "link", attrs: { href: "https://vci.vn/a" } })).toEqual({ ok: true });
    expect(h.editor.getText()).toBe("https://vci.vn/a");
    expect(h.editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]?.attrs?.["href"]).toBe("https://vci.vn/a");
  });

  it("schema tự từ chối giao thức nguy hiểm dù lệnh lọt qua (defense in depth)", () => {
    withText("x");
    h.editor.commands.setLink({ href: "javascript:alert(1)" });
    expect(JSON.stringify(h.editor.getJSON())).not.toContain("javascript:");
  });
});

describe("bảng", () => {
  it("chèn 3×3 có hàng tiêu đề, thêm/xoá hàng cột, xoá bảng", () => {
    h = makeEditor();
    expect(run({ name: "insertTable", attrs: { rows: 3, cols: 3 } })).toEqual({ ok: true });
    const table = (): JSONContent | undefined => h.editor.getJSON().content?.find((n: JSONContent) => n.type === "table");
    expect(table()?.content).toHaveLength(3);
    expect(table()?.content?.[0]?.content?.map((c: JSONContent) => c.type)).toEqual(["tableHeader", "tableHeader", "tableHeader"]);
    expect(table()?.content?.[1]?.content?.map((c: JSONContent) => c.type)).toEqual(["tableCell", "tableCell", "tableCell"]);
    expect(computeSelectionState(h.editor, true).table).toBe(true);

    run({ name: "tableAddRow" });
    expect(table()?.content).toHaveLength(4);
    run({ name: "tableAddColumn" });
    expect(table()?.content?.[1]?.content).toHaveLength(4);
    run({ name: "tableDeleteRow" });
    expect(table()?.content).toHaveLength(3);
    run({ name: "tableDeleteColumn" });
    expect(table()?.content?.[1]?.content).toHaveLength(3);
    run({ name: "tableDelete" });
    expect(table()).toBeUndefined();
  });

  it("lệnh bảng ngoài bảng → not-applicable", () => {
    withText();
    expect(run({ name: "tableAddRow" })).toEqual({ ok: false, reason: "not-applicable" });
  });
});

describe("cổng chỉ đọc / đang tải / tài liệu đầy", () => {
  it("chỉ đọc: mọi lệnh sửa bị từ chối, nội dung không đổi; focus/blur vẫn chạy", () => {
    h = makeEditor({ editable: false });
    h.editor.setEditable(true);
    h.editor.commands.insertContent("nội dung");
    h.editor.setEditable(false);
    const before = JSON.stringify(h.editor.getJSON());
    for (const name of ["bold", "italic", "bulletList", "undo", "horizontalRule", "clearFormatting"] as const) {
      expect(run({ name })).toEqual({ ok: false, reason: "read-only" });
    }
    expect(run({ name: "heading", attrs: { level: 1 } })).toEqual({ ok: false, reason: "read-only" });
    expect(run({ name: "link", attrs: { href: "https://a.b" } })).toEqual({ ok: false, reason: "read-only" });
    expect(run({ name: "insertTable" })).toEqual({ ok: false, reason: "read-only" });
    expect(JSON.stringify(h.editor.getJSON())).toBe(before);
    expect(run({ name: "focus" }).ok).toBe(true);
    expect(run({ name: "blur" }).ok).toBe(true);
  });

  it("chưa tải xong → loading (ưu tiên hơn read-only)", () => {
    h = makeEditor({ editable: false });
    expect(run({ name: "bold" }, { loaded: false })).toEqual({ ok: false, reason: "loading" });
  });

  it("tài liệu đầy: chặn lệnh làm phình (bảng, dòng/cột, đường kẻ), vẫn cho định dạng", () => {
    withText();
    for (const command of [{ name: "insertTable" }, { name: "horizontalRule" }, { name: "tableAddRow" }, { name: "tableAddColumn" }] as const) {
      expect(run(command, { tooLarge: true })).toEqual({ ok: false, reason: "too-large" });
    }
    expect(run({ name: "bold" }, { tooLarge: true })).toEqual({ ok: true });
  });
});

describe("selectionState", () => {
  it("phản ánh định dạng tại con trỏ và quyền sửa", () => {
    withText("abc");
    run({ name: "bold" });
    run({ name: "italic" });
    const s = computeSelectionState(h.editor, true);
    expect(s).toMatchObject({ bold: true, italic: true, underline: false, heading: null, link: null, canEdit: true, table: false });
    expect(computeSelectionState(h.editor, false)).toMatchObject({ canEdit: false, canUndo: false, canRedo: false });
  });
});
