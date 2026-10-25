/**
 * GIAO THỨC BRIDGE RN ↔ WebView của editor (p6-01) — BẢN SAO PHÍA APP của `collab/editor-web/src/bridge-protocol.ts` (nguồn sự thật;
 * chi tiết `collab/README.md` §10.1). Hai phía không import nhau (package riêng, `AGENTS.md` của collab): đổi một tin ở đó = tăng
 * `BRIDGE_VERSION` + sửa file này trong CÙNG đợt. `tests/bridge-contract.test.ts` đối chiếu hai bản (tập lệnh, loại tin, mã) khi
 * checkout có thư mục `collab/`.
 *
 * Mọi tin là chuỗi JSON `{ v: 1, type, payload }`. Luồng: web gửi `ready` → app gửi `init` → web gửi `status`/`awareness`/
 * `selectionState`…; app gửi `command`/`insertImage`/`setToken`/`assetUrl`…
 */
import type { CollabUser } from '@/shared/collab';

export const BRIDGE_VERSION = 1 as const;

/** Trần cỡ tin (số ký tự của chuỗi JSON). `init` kiểu `snapshot` mang cả state Yjs base64 nên có trần riêng. */
export const BRIDGE_LIMITS = {
  maxLinkChars: 2048,
  maxMessageChars: 64 * 1024,
  maxNameChars: 80,
  maxPlaceholderChars: 120,
  maxSnapshotInitChars: 9 * 1024 * 1024,
} as const;

export type EditorMode = 'comment' | 'edit' | 'view';
export type EditorLocale = 'en' | 'vi';
export type EditorTheme = 'dark' | 'light';

export interface Envelope<T extends string, P extends object> {
  payload: P;
  type: T;
  v: typeof BRIDGE_VERSION;
}

// ─────────────────────────────── app → web ───────────────────────────────

/** Mở tài liệu trực tiếp — dữ liệu lấy nguyên từ `POST /documents/:id/collab-token` (+ `GET /documents/:id`). */
export interface InitLivePayload {
  /** Hạn token (epoch ms). Thiếu thì editor đọc `exp` của JWT. */
  expiresAt?: number;
  /** `collab-token.documentName` (`doc:<id>`), KHÔNG tự ghép. */
  documentName: string;
  locale?: EditorLocale;
  /** `edit` chỉ có hiệu lực khi server cũng cho ghi (chế độ thấp hơn thắng). */
  mode: EditorMode;
  placeholder?: string;
  source?: 'live';
  stateMaxBytes?: number;
  theme?: EditorTheme;
  token: string;
  /** `collab-token.url` (ws/wss, KHÔNG kèm `?doc=`; editor tự nối). */
  url: string;
  user: CollabUser;
}

/** Xem một phiên bản lịch sử (chỉ đọc, không kết nối): `yjsState` = base64 từ `GET …/snapshots/:sid`. */
export interface InitSnapshotPayload {
  locale?: EditorLocale;
  source: 'snapshot';
  theme?: EditorTheme;
  yjsState: string;
}

export type InitPayload = InitLivePayload | InitSnapshotPayload;

export const SIMPLE_COMMANDS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'paragraph',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'indent',
  'outdent',
  'undo',
  'redo',
  'clearFormatting',
  'blur',
  'tableAddRow',
  'tableAddColumn',
  'tableDeleteRow',
  'tableDeleteColumn',
  'tableDelete',
] as const;
export type SimpleCommandName = (typeof SIMPLE_COMMANDS)[number];
export const PARAM_COMMANDS = ['heading', 'link', 'insertTable', 'focus'] as const;
export const ALL_COMMANDS = [...SIMPLE_COMMANDS, ...PARAM_COMMANDS] as const;
export type CommandName = (typeof ALL_COMMANDS)[number];

/** Thân một lệnh toolbar (chưa có `requestId`). Lệnh sửa nội dung bị editor từ chối khi chỉ đọc/tài liệu đầy/chưa đồng bộ. */
export type CommandBody =
  | { attrs: { href: string | null }; name: 'link' }
  | { attrs: { level: 1 | 2 | 3 }; name: 'heading' }
  | { attrs?: { position?: 'end' | 'start' }; name: 'focus' }
  | { attrs?: { cols?: number; rows?: number }; name: 'insertTable' }
  | { name: SimpleCommandName };

export type CommandPayload = CommandBody & { requestId?: string };

export type AssetUrlError = 'failed' | 'forbidden' | 'not-found';

export type HostMessage =
  | Envelope<
      'assetUrl',
      { assetId: string; error?: AssetUrlError; expiresAt?: number; url?: string }
    >
  | Envelope<'command', CommandPayload>
  | Envelope<'dispose', Record<string, never>>
  | Envelope<'init', InitPayload>
  /** Chèn ảnh đã upload (`assetId` của Asset scope DOC). Nội dung Yjs chỉ lưu `assetId`, không lưu URL. */
  | Envelope<'insertImage', { alt?: string; assetId: string; requestId?: string }>
  /** Nối lại thủ công (sau `error` không nghiêm trọng hoặc khi người dùng bấm "Thử lại"). */
  | Envelope<'retry', Record<string, never>>
  | Envelope<'setMode', { mode: EditorMode }>
  | Envelope<'setTheme', { theme: EditorTheme }>
  | Envelope<'setToken', { expiresAt?: number; token: string }>;

// ─────────────────────────────── web → app ───────────────────────────────

/**
 * `connecting` chưa đồng bộ lần nào · `synced` đang nối và đã đồng bộ · `offline` từng đồng bộ nhưng đang mất kết nối/đang nối lại
 * (thay đổi giữ trong Y.Doc, tự hợp nhất khi nối lại) · `closed` dừng hẳn (mất quyền/không tồn tại/huỷ), KHÔNG nối lại.
 */
export type ConnectionState = 'closed' | 'connecting' | 'offline' | 'synced';

export interface StatusPayload {
  /** Tài liệu đã lưu trữ (server ép chỉ đọc). */
  archived: boolean;
  connection: ConnectionState;
  /** Chế độ HIỆU LỰC (có thể thấp hơn `init.mode`: server chỉ cho xem, lưu trữ, mất quyền sửa lúc đang mở). */
  mode: EditorMode;
  /** ≥ 90% trần `stateMaxBytes` (chỉ khi `init.stateMaxBytes` được gửi). */
  nearLimit: boolean;
  /** `mode !== 'edit'` — app ẩn toolbar sửa, hiện "Chỉ xem". */
  readOnly: boolean;
  /** Server báo `SAVE_FAILED` (BE tạm lỗi; các máy vẫn đồng bộ với nhau) và chưa `SAVE_RECOVERED`. */
  saveFailed: boolean;
  /** Tài liệu vượt trần — lệnh chèn bị từ chối. */
  tooLarge: boolean;
  /** Có thay đổi cục bộ server chưa xác nhận đã nhận (chỉ có nghĩa khi `readOnly` = false). */
  unsynced: boolean;
}

export interface SelectionStatePayload {
  blockquote: boolean;
  bold: boolean;
  bulletList: boolean;
  /** Editor đang nhận sửa (đã đồng bộ lần đầu và không chỉ đọc). */
  canEdit: boolean;
  canRedo: boolean;
  canUndo: boolean;
  code: boolean;
  codeBlock: boolean;
  heading: 1 | 2 | 3 | null;
  italic: boolean;
  /** `href` của liên kết đang chọn, hoặc null. */
  link: string | null;
  orderedList: boolean;
  strike: boolean;
  table: boolean;
  taskList: boolean;
  underline: boolean;
}

export interface PresenceUser extends CollabUser {
  /** Chính mình. */
  self: boolean;
}

export type NoticeCode =
  'ARCHIVED' | 'READ_ONLY' | 'RESTORED' | 'SAVE_FAILED' | 'SAVE_RECOVERED' | 'TOO_LARGE';

/**
 * `AUTH_EXPIRED` token hết hạn và xin lại không được · `FORBIDDEN`/`NOT_FOUND` mất quyền/không tồn tại (dừng, thoát màn hình) ·
 * `TOO_LARGE` tài liệu vượt trần · `LOAD_FAILED` không mở/đồng bộ được (kèm `detail`) · `INVALID_MESSAGE` app gửi tin sai
 * (lỗi lập trình, không nghiêm trọng).
 */
export type EditorErrorCode =
  'AUTH_EXPIRED' | 'FORBIDDEN' | 'INVALID_MESSAGE' | 'LOAD_FAILED' | 'NOT_FOUND' | 'TOO_LARGE';

export type CommandRejectReason =
  | 'invalid-attrs'
  | 'loading'
  | 'not-applicable'
  | 'not-initialized'
  | 'read-only'
  | 'too-large'
  | 'unknown-command';

export type EditorMessage =
  | Envelope<'awareness', { count: number; users: PresenceUser[] }>
  | Envelope<'commandResult', { ok: boolean; reason?: CommandRejectReason; requestId: string }>
  | Envelope<'error', { code: EditorErrorCode; detail?: string; fatal: boolean; message?: string }>
  | Envelope<'notice', { code: NoticeCode }>
  /** Chạm liên kết ở chế độ chỉ đọc (chỉ http/https/mailto/tel) — app xác nhận rồi mở ngoài. */
  | Envelope<'openLink', { url: string }>
  | Envelope<
      'ready',
      { bundle: string; commands: readonly CommandName[]; protocol: typeof BRIDGE_VERSION }
    >
  | Envelope<'requestImage', { requestId: string; source: 'drop' | 'paste' }>
  /** Cần token mới (`expired`: sắp nối lại mà token đã hết hạn; `unauthorized`: server từ chối token). App đáp `setToken`. */
  | Envelope<'requestToken', { attempt: number; reason: 'expired' | 'unauthorized' }>
  /** Cần URL ký cho node ảnh — app gọi `GET /assets/:id/url` rồi đáp `assetUrl`. */
  | Envelope<'resolveAssetUrl', { assetId: string }>
  | Envelope<'selectionState', SelectionStatePayload>
  | Envelope<'status', StatusPayload>;

export type HostMessageType = HostMessage['type'];
export type EditorMessageType = EditorMessage['type'];
