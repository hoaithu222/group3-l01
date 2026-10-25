import type { Editor } from "@tiptap/core";
import type { CommandPayload, CommandRejectReason } from "./bridge-protocol";

export type CommandResult = { ok: true } | { ok: false; reason: CommandRejectReason };

export interface CommandContext {
  editor: Editor;
  /** Đã đồng bộ lần đầu (trước đó chưa có nội dung để sửa). */
  loaded: boolean;
  /** Editor đang nhận sửa (không chỉ đọc, đã tải). */
  editable: boolean;
  /** Tài liệu đã đầy — không cho lệnh làm PHÌNH thêm (chèn bảng/dòng/đường kẻ/ảnh). */
  tooLarge: boolean;
}

/** Lệnh không sửa nội dung: dùng được cả khi chỉ đọc. */
const READ_SAFE: ReadonlySet<string> = new Set(["focus", "blur"]);
/** Lệnh làm tài liệu lớn thêm đáng kể — chặn khi `tooLarge`. */
const GROWING: ReadonlySet<string> = new Set(["insertTable", "tableAddRow", "tableAddColumn", "horizontalRule"]);

/** Cổng kiểm chung cho mọi lệnh sửa (kể cả `insertImage`): trả lý do từ chối hoặc `null` nếu được phép. */
export function guardMutation(ctx: Pick<CommandContext, "loaded" | "editable" | "tooLarge">, growing: boolean): CommandRejectReason | null {
  if (!ctx.loaded) return "loading";
  if (!ctx.editable) return "read-only";
  if (growing && ctx.tooLarge) return "too-large";
  return null;
}

const done = (ok: boolean): CommandResult => (ok ? { ok: true } : { ok: false, reason: "not-applicable" });

/**
 * Chạy lệnh toolbar của app trên editor. KHÔNG tự `focus()` (tránh bật/đóng bàn phím ngoài ý muốn — app có lệnh `focus` riêng);
 * ProseMirror giữ vùng chọn trong state nên định dạng vẫn áp đúng dù WebView đang mất tiêu điểm.
 */
export function runCommand(ctx: CommandContext, command: CommandPayload): CommandResult {
  const { editor } = ctx;
  if (!READ_SAFE.has(command.name)) {
    const rejected = guardMutation(ctx, GROWING.has(command.name));
    if (rejected) return { ok: false, reason: rejected };
  }
  const chain = () => editor.chain();

  switch (command.name) {
    case "bold":
      return done(chain().toggleBold().run());
    case "italic":
      return done(chain().toggleItalic().run());
    case "underline":
      return done(chain().toggleUnderline().run());
    case "strike":
      return done(chain().toggleStrike().run());
    case "code":
      return done(chain().toggleCode().run());
    case "paragraph":
      return done(chain().setParagraph().run());
    case "heading":
      return done(chain().toggleHeading({ level: command.attrs.level }).run());
    case "bulletList":
      return done(chain().toggleBulletList().run());
    case "orderedList":
      return done(chain().toggleOrderedList().run());
    case "taskList":
      return done(chain().toggleTaskList().run());
    case "blockquote":
      return done(chain().toggleBlockquote().run());
    case "codeBlock":
      return done(chain().toggleCodeBlock().run());
    case "horizontalRule":
      return done(chain().setHorizontalRule().run());
    case "indent":
      return done(chain().sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run());
    case "outdent":
      return done(chain().liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run());
    case "undo":
      return done(editor.commands.undo());
    case "redo":
      return done(editor.commands.redo());
    case "clearFormatting":
      return done(chain().unsetAllMarks().clearNodes().run());
    case "link":
      return done(setLink(editor, command.attrs.href));
    case "insertTable":
      return done(chain().insertTable({ rows: command.attrs?.rows ?? 3, cols: command.attrs?.cols ?? 3, withHeaderRow: true }).run());
    case "tableAddRow":
      return done(chain().addRowAfter().run());
    case "tableAddColumn":
      return done(chain().addColumnAfter().run());
    case "tableDeleteRow":
      return done(chain().deleteRow().run());
    case "tableDeleteColumn":
      return done(chain().deleteColumn().run());
    case "tableDelete":
      return done(chain().deleteTable().run());
    case "focus":
      return done(editor.commands.focus(command.attrs?.position ?? "end"));
    case "blur":
      return done(editor.commands.blur());
  }
}

/** `href` = null → gỡ liên kết (cả đoạn liên kết chứa con trỏ); chọn rỗng ngoài liên kết → chèn chính URL làm chữ liên kết. */
function setLink(editor: Editor, href: string | null): boolean {
  if (href === null) return editor.chain().extendMarkRange("link").unsetLink().run();
  if (editor.state.selection.empty && !editor.isActive("link")) {
    return editor
      .chain()
      .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
      .run();
  }
  return editor.chain().extendMarkRange("link").setLink({ href }).run();
}
