import type { Editor } from "@tiptap/core";
import type { SelectionStatePayload } from "./bridge-protocol";

const HEADING_LEVELS = [1, 2, 3] as const;

/** Định dạng tại vị trí chọn hiện tại → app tô sáng toolbar (kèm `accessibilityState.selected`, không chỉ bằng màu). */
export function computeSelectionState(editor: Editor, canEdit: boolean): SelectionStatePayload {
  const active = (name: string): boolean => editor.isActive(name);
  const heading = HEADING_LEVELS.find((level) => editor.isActive("heading", { level })) ?? null;
  const href = active("link") ? editor.getAttributes("link")["href"] : null;
  return {
    bold: active("bold"),
    italic: active("italic"),
    underline: active("underline"),
    strike: active("strike"),
    code: active("code"),
    link: typeof href === "string" ? href : null,
    heading,
    bulletList: active("bulletList"),
    orderedList: active("orderedList"),
    taskList: active("taskList"),
    blockquote: active("blockquote"),
    codeBlock: active("codeBlock"),
    table: active("table"),
    canUndo: canEdit && editor.can().undo(),
    canRedo: canEdit && editor.can().redo(),
    canEdit,
  };
}
