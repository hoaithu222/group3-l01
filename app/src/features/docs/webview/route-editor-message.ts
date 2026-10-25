import type { EditorMessage, NoticeCode, PresenceUser } from './doc-editor-bridge.types';
import type { DocEditorFailure } from '../store/doc-editor.store';

/** Màu dự phòng khi WebView gửi màu sai định dạng (chỉ để chấm nhận dạng; con trỏ vẽ trong trang, không dùng màu này). */
const FALLBACK_COLOR = '#6B7280';
const MAX_NAME_CHARS = 80;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Chuẩn hoá người đang mở: tên cắt ≤ 80 ký tự (không tin độ dài từ trang), màu sai → dự phòng. */
export function normalizePresence(users: PresenceUser[]): PresenceUser[] {
  return users.map((user) => ({
    color: COLOR_RE.test(user.color) ? user.color : FALLBACK_COLOR,
    id: user.id,
    name: user.name.trim().slice(0, MAX_NAME_CHARS) || 'Người dùng',
    self: user.self,
  }));
}

/** Những gì `routeEditorMessage` cần từ màn hình — tách để định tuyến tin là hàm thuần, test không cần dựng WebView. */
export interface EditorRoute {
  /** Ghi vào `useDocEditorStore`. */
  patch: (next: {
    failure?: DocEditorFailure | null;
    selection?: Extract<EditorMessage, { type: 'selectionState' }>['payload'];
    status?: Extract<EditorMessage, { type: 'status' }>['payload'];
    users?: PresenceUser[];
  }) => void;
  onCommandRejected: (reason: string) => void;
  onNotice: (code: NoticeCode) => void;
  onOpenLink: (url: string) => void;
  onRequestImage: () => void;
  onRequestToken: (reason: 'expired' | 'unauthorized', attempt: number) => void;
  onResolveAsset: (assetId: string) => void;
}

/**
 * Định tuyến MỘT tin đã qua `parseEditorMessage` (kiểu đã chặt). `ready` do `useEditorHost` xử lý (nó mở `init`), không tới đây.
 *
 * `error`: `FORBIDDEN`/`NOT_FOUND` = mất quyền/không còn → lỗi nghiêm trọng (màn thoát, thông báo trung tính); `AUTH_EXPIRED` = xin lại
 * token không được → khối lỗi có "Thử lại"; `TOO_LARGE` để `status.tooLarge` + `notice` lo; `LOAD_FAILED` chỉ nghiêm trọng khi `fatal`
 * (lỗi không nghiêm trọng của trang được log, không làm hỏng phiên đang chạy); `INVALID_MESSAGE` là lỗi lập trình (app gửi sai) → bỏ qua.
 */
export function routeEditorMessage(message: EditorMessage, route: EditorRoute): void {
  switch (message.type) {
    case 'status':
      return route.patch({ status: message.payload });
    case 'selectionState':
      return route.patch({ selection: message.payload });
    case 'awareness':
      return route.patch({ users: normalizePresence(message.payload.users) });
    case 'requestToken':
      return route.onRequestToken(message.payload.reason, message.payload.attempt);
    case 'resolveAssetUrl':
      return route.onResolveAsset(message.payload.assetId);
    case 'requestImage':
      return route.onRequestImage();
    case 'openLink':
      return route.onOpenLink(message.payload.url);
    case 'notice':
      return route.onNotice(message.payload.code);
    case 'commandResult':
      if (!message.payload.ok && message.payload.reason)
        route.onCommandRejected(message.payload.reason);
      return;
    case 'error': {
      const { code, fatal } = message.payload;
      if (code === 'FORBIDDEN' || code === 'NOT_FOUND' || code === 'AUTH_EXPIRED') {
        return route.patch({ failure: { code, fatal: code !== 'AUTH_EXPIRED' } });
      }
      if (code === 'LOAD_FAILED' && fatal) return route.patch({ failure: { code, fatal } });
      return;
    }
    case 'ready':
      return;
  }
}
