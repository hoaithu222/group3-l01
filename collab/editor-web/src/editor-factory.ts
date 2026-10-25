import { Editor, type Extensions } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import type * as Y from "yjs";
import type { AssetUrlResolver } from "./asset-resolver";
import { isSafeLinkUrl } from "./bridge-validate";
import type { CollabUser } from "./bridge-protocol";
import { createImageNode } from "./image-node";
import type { AwarenessProvider } from "./session";

/** Tên `Y.XmlFragment` chứa nội dung — BE dựng text tìm kiếm và khôi phục snapshot từ đúng fragment này (`collab/README.md` §3). */
export const DOCUMENT_FIELD = "default";

export interface EditorFactoryOptions {
  element: HTMLElement;
  doc: Y.Doc;
  /** `null` = xem snapshot (không kết nối, không con trỏ người khác). */
  awarenessProvider: AwarenessProvider | null;
  user: CollabUser | null;
  placeholder: string;
  editable: boolean;
  resolver: AssetUrlResolver;
  /** Chạm liên kết khi chỉ đọc. */
  onOpenLink(url: string): void;
  /** Dán/thả tệp ảnh (WebView không tải được tệp lên — nhờ app). */
  onImageFile(source: "paste" | "drop"): void;
  /** Nội dung Yjs không hợp lệ với schema (vd máy khác ghi node lạ). */
  onContentError(error: Error): void;
}

export function buildExtensions(o: EditorFactoryOptions): Extensions {
  return [
    StarterKit.configure({
      // Collaboration có undo/redo riêng theo từng người (y-undo); `undoRedo` chuẩn của Tiptap xung đột với nó.
      undoRedo: false,
      // Node "cuối luôn là đoạn văn" do mỗi máy tự thêm sẽ đẻ đoạn văn trống trùng lặp khi nhiều người mở cùng lúc.
      trailingNode: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        isAllowedUri: (url) => isSafeLinkUrl(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Bảng không có kéo-đổi-cỡ cột (cảm ứng kém, kéo theo plugin nặng); cuộn ngang trong khung khi bảng rộng.
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    createImageNode(o.resolver),
    Placeholder.configure({ placeholder: o.placeholder }),
    // KHÔNG đặt `content` ban đầu: mỗi máy sẽ ghi lại nội dung đó vào Y.Doc và nhân đôi.
    Collaboration.configure({ document: o.doc, field: DOCUMENT_FIELD }),
    ...(o.awarenessProvider && o.user
      ? [
          // Awareness chỉ được có khoá `user` (+ `cursor` do plugin con trỏ đặt); `user.id` phải bằng `sub` của token.
          CollaborationCaret.configure({ provider: o.awarenessProvider, user: { id: o.user.id, name: o.user.name, color: o.user.color } }),
        ]
      : []),
  ];
}

export function createEditor(o: EditorFactoryOptions): Editor {
  return new Editor({
    element: o.element,
    extensions: buildExtensions(o),
    editable: o.editable,
    autofocus: false,
    enableContentCheck: true,
    // Chỉ lỗi nội dung Yjs không hợp lệ (RangeError của `doc.check()`) mới nghiêm trọng; HTML lạ bị Tiptap từ chối khi chèn ("[tiptap error]…") chỉ là lệnh không thành.
    onContentError: ({ error }) => {
      if (!error.message.startsWith("[tiptap error]")) o.onContentError(error);
    },
    editorProps: {
      attributes: {
        class: "doc-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Nội dung tài liệu",
        // Gõ tiếng Việt (Telex/VNI) trên WebView Android: tắt tự sửa/gạch chân chính tả — hai thứ này chen vào vùng composition của IME.
        spellcheck: "false",
        autocorrect: "off",
      },
      handleClick: (view, _pos, event) => {
        // Đang sửa: chạm vào liên kết chỉ đặt con trỏ (app có `selectionState.link` để mở nếu muốn); chỉ đọc: mở qua bridge.
        if (view.editable) return false;
        const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
        const href = anchor?.getAttribute("href");
        if (!href || !isSafeLinkUrl(href)) return false;
        event.preventDefault();
        o.onOpenLink(href);
        return true;
      },
      handlePaste: (_view, event) => hasImageFile(event.clipboardData) && (o.onImageFile("paste"), true),
      handleDrop: (_view, event) => hasImageFile(event.dataTransfer) && (o.onImageFile("drop"), true),
    },
  });
}

function hasImageFile(data: DataTransfer | null | undefined): boolean {
  return !!data && Array.from(data.files ?? []).some((file) => file.type.startsWith("image/"));
}
