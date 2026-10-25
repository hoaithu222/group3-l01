/**
 * GIAO THỨC BRIDGE RN ↔ WebView của editor (p6-01). File này CHỈ chứa kiểu + hằng số (không phụ thuộc thư viện) để app sao chép/đối chiếu
 * (`app/src/features/docs/webview/doc-editor-bridge.ts`). Kiểm tra dữ liệu lúc chạy nằm ở `bridge-validate.ts`.
 *
 * Mọi tin là một chuỗi JSON `{ v: 1, type, payload }` (payload luôn là object). Tin sai/cắt cụt/`v` khác 1/`type` lạ bị BỎ QUA (editor
 * báo `error INVALID_MESSAGE` không nghiêm trọng). Đổi tên/nghĩa một tin = tăng `BRIDGE_VERSION` và sửa cả hai phía trong cùng đợt.
 *
 * Luồng: web gửi `ready` → app gửi `init` → web gửi `status`/`awareness`/`selectionState`…; app gửi `command`/`insertImage`/`setToken`…
 */

export const BRIDGE_VERSION = 1 as const;

/** Hạn mức kích thước (số ký tự của chuỗi JSON). `init` kiểu `snapshot` mang cả state Yjs base64 nên có trần riêng. */
export const BRIDGE_LIMITS = {
  maxMessageChars: 64 * 1024,
  maxSnapshotInitChars: 9 * 1024 * 1024,
  maxNameChars: 80,
  maxPlaceholderChars: 120,
  maxLinkChars: 2048,
} as const;

export type EditorMode = "edit" | "view" | "comment";
export type EditorLocale = "vi" | "en";
export type EditorTheme = "light" | "dark";

/** Người dùng hiện diện (khớp `collab-token.user` và awareness `user` của server: `id` PHẢI bằng `sub` của token). */
export interface CollabUser {
  id: string;
  name: string;
  /** `#RRGGBB` (BE chọn từ bảng 8 màu). */
  color: string;
}

export interface Envelope<T extends string, P extends object> {
  v: typeof BRIDGE_VERSION;
  type: T;
  payload: P;
}

// ─────────────────────────────── app → web ───────────────────────────────

/** Mở tài liệu trực tiếp. Dữ liệu lấy từ `POST /documents/:id/collab-token` (+ `GET /documents/:id`). */
export interface InitLivePayload {
  source?: "live";
  /** `collab-token.url` (ws/wss, KHÔNG kèm `?doc=`; editor tự nối). */
  url: string;
  token: string;
  /** Hạn token (ISO hoặc epoch ms) — `collab-token.expiresAt`. Thiếu thì đọc claim `exp` của JWT. */
  expiresAt?: string | number;
  /** `collab-token.documentName` (`doc:<id>`), KHÔNG tự ghép. */
  documentName: string;
  /** `edit` chỉ có hiệu lực khi server cũng cho ghi (chế độ thấp hơn thắng). `comment` = chỉ đọc + (P1) bình luận. */
  mode: EditorMode;
  user: CollabUser;
  locale?: EditorLocale;
  theme?: EditorTheme;
  placeholder?: string;
  /** `collab-token.limits.stateMaxBytes` — để cảnh báo sớm khi tài liệu gần đầy. */
  stateMaxBytes?: number;
}

/** Xem một phiên bản lịch sử (chỉ đọc, không kết nối): `yjsState` = base64 từ `GET /documents/:id/snapshots/:sid`. */
export interface InitSnapshotPayload {
  source: "snapshot";
  yjsState: string;
  locale?: EditorLocale;
  theme?: EditorTheme;
}

export type InitPayload = InitLivePayload | InitSnapshotPayload;

export const SIMPLE_COMMANDS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "paragraph",
  "bulletList",
  "orderedList",
  "taskList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "indent",
  "outdent",
  "undo",
  "redo",
  "clearFormatting",
  "blur",
  "tableAddRow",
  "tableAddColumn",
  "tableDeleteRow",
  "tableDeleteColumn",
  "tableDelete",
] as const;
export type SimpleCommandName = (typeof SIMPLE_COMMANDS)[number];
export const PARAM_COMMANDS = ["heading", "link", "insertTable", "focus"] as const;
export const ALL_COMMANDS = [...SIMPLE_COMMANDS, ...PARAM_COMMANDS] as const;
export type CommandName = (typeof ALL_COMMANDS)[number];

/** Tin `command`. `requestId` (tuỳ chọn) để nhận `commandResult`. Lệnh sửa nội dung bị từ chối khi chỉ đọc/tài liệu đầy. */
export type CommandPayload = { requestId?: string } & (
  | { name: SimpleCommandName }
  | { name: "heading"; attrs: { level: 1 | 2 | 3 } }
  | { name: "link"; attrs: { href: string | null } }
  | { name: "insertTable"; attrs?: { rows?: number; cols?: number } }
  | { name: "focus"; attrs?: { position?: "start" | "end" } }
);

export type AssetUrlError = "not-found" | "forbidden" | "failed";

export type HostMessage =
  | Envelope<"init", InitPayload>
  /** Token mới (làm mới trước hạn 60 s, hoặc đáp `requestToken`). */
  | Envelope<"setToken", { token: string; expiresAt?: string | number }>
  | Envelope<"command", CommandPayload>
  /** Chèn ảnh đã upload (`assetId` của Asset scope DOC). Nội dung Yjs chỉ lưu `assetId`, không lưu URL. */
  | Envelope<"insertImage", { assetId: string; alt?: string; requestId?: string }>
  /** Đáp `resolveAssetUrl`: URL ký (sống ngắn) hoặc `error`. */
  | Envelope<"assetUrl", { assetId: string; url?: string; expiresAt?: string | number; error?: AssetUrlError }>
  | Envelope<"setMode", { mode: EditorMode }>
  | Envelope<"setTheme", { theme: EditorTheme }>
  /** Nối lại thủ công (sau `error` không nghiêm trọng hoặc khi người dùng bấm "Thử lại"). */
  | Envelope<"retry", Record<string, never>>
  /** Rời màn hình: đóng provider gọn gàng (báo người khác mình đã rời) trước khi huỷ WebView. */
  | Envelope<"dispose", Record<string, never>>;

// ─────────────────────────────── web → app ───────────────────────────────

/**
 * `connecting` chưa đồng bộ lần nào · `synced` đang nối và đã đồng bộ · `offline` từng đồng bộ nhưng đang mất kết nối/đang nối lại
 * (thay đổi giữ trong Y.Doc, tự hợp nhất khi nối lại) · `closed` dừng hẳn (mất quyền/không tồn tại/huỷ), KHÔNG nối lại.
 */
export type ConnectionState = "connecting" | "synced" | "offline" | "closed";

export interface StatusPayload {
  connection: ConnectionState;
  /** Có thay đổi cục bộ server chưa xác nhận đã nhận (chỉ có nghĩa khi `readOnly` = false). */
  unsynced: boolean;
  /** Server báo `SAVE_FAILED` (BE tạm lỗi; các máy vẫn đồng bộ với nhau) và chưa `SAVE_RECOVERED`. */
  saveFailed: boolean;
  /** Chế độ HIỆU LỰC (có thể thấp hơn `init.mode`: server chỉ cho xem, tài liệu lưu trữ, mất quyền sửa lúc đang mở). */
  mode: EditorMode;
  /** `mode !== "edit"` — app ẩn toolbar sửa, hiện "Chỉ xem". */
  readOnly: boolean;
  archived: boolean;
  /** Tài liệu vượt trần (server báo `TOO_LARGE` hoặc ước tính cục bộ ≥ 100%) — lệnh chèn bị từ chối. */
  tooLarge: boolean;
  /** ≥ 90% trần `stateMaxBytes` (chỉ khi `init.stateMaxBytes` được gửi). */
  nearLimit: boolean;
}

export interface SelectionStatePayload {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  /** `href` của liên kết đang chọn, hoặc null. */
  link: string | null;
  heading: 1 | 2 | 3 | null;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  blockquote: boolean;
  codeBlock: boolean;
  table: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Editor đang nhận sửa (đã đồng bộ lần đầu và không chỉ đọc). */
  canEdit: boolean;
}

export interface PresenceUser extends CollabUser {
  /** Chính mình. */
  self: boolean;
}

export type NoticeCode = "SAVE_FAILED" | "SAVE_RECOVERED" | "TOO_LARGE" | "ARCHIVED" | "RESTORED" | "READ_ONLY";

/**
 * `AUTH_EXPIRED` token hết hạn và xin lại không được (app xin token mới rồi `setToken`, hoặc thoát) · `FORBIDDEN`/`NOT_FOUND` mất quyền/
 * không tồn tại (dừng, thoát màn hình) · `TOO_LARGE` tài liệu vượt trần · `LOAD_FAILED` không mở/đồng bộ được (kèm `detail`) ·
 * `INVALID_MESSAGE` app gửi tin sai (lỗi lập trình, không nghiêm trọng).
 */
export type EditorErrorCode = "AUTH_EXPIRED" | "FORBIDDEN" | "NOT_FOUND" | "TOO_LARGE" | "LOAD_FAILED" | "INVALID_MESSAGE";

export type CommandRejectReason = "not-initialized" | "loading" | "read-only" | "too-large" | "unknown-command" | "invalid-attrs" | "not-applicable";

export type EditorMessage =
  | Envelope<"ready", { protocol: typeof BRIDGE_VERSION; bundle: string; commands: readonly CommandName[] }>
  | Envelope<"status", StatusPayload>
  | Envelope<"selectionState", SelectionStatePayload>
  /** Người đang mở (không trùng `id`), gồm cả mình; `count` = số người. */
  | Envelope<"awareness", { users: PresenceUser[]; count: number }>
  /** Cần token mới (`expired`: sắp nối lại mà token đã hết hạn; `unauthorized`: server từ chối token). App đáp `setToken`. */
  | Envelope<"requestToken", { reason: "expired" | "unauthorized"; attempt: number }>
  /** Người dùng dán/thả ảnh vào editor — app có thể mở bộ chọn ảnh rồi upload + `insertImage`. */
  | Envelope<"requestImage", { requestId: string; source: "paste" | "drop" }>
  /** Cần URL ký cho node ảnh — app gọi `GET /assets/:id/url` rồi đáp `assetUrl`. */
  | Envelope<"resolveAssetUrl", { assetId: string }>
  /** Chạm liên kết ở chế độ chỉ đọc (chỉ http/https/mailto/tel) — app xác nhận rồi mở ngoài. */
  | Envelope<"openLink", { url: string }>
  | Envelope<"notice", { code: NoticeCode }>
  | Envelope<"commandResult", { requestId: string; ok: boolean; reason?: CommandRejectReason }>
  | Envelope<"error", { code: EditorErrorCode; fatal: boolean; message?: string; detail?: string }>;

export type BridgeMessage = HostMessage | EditorMessage;
export type HostMessageType = HostMessage["type"];
export type EditorMessageType = EditorMessage["type"];
