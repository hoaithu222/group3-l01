import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
  type WebSocketStatus,
} from '@hocuspocus/provider';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type { CollabUser } from '@/shared/collab';

import { installAwarenessFilter } from './awareness-filter';

export type WsStatus = `${WebSocketStatus}`;
export type AuthScope = 'read-write' | 'readonly';

export interface PortHandlers {
  onAuthenticated: (scope: AuthScope) => void;
  onAuthenticationFailed: (reason: string) => void;
  onAwarenessChange: () => void;
  /** Cả tin CLOSE trong luồng (code 1000, `reason` = lý do server) lẫn đóng socket thô (code 44xx/1009). */
  onClose: (info: { code: number; reason: string }) => void;
  onStateless: (payload: string) => void;
  onStatus: (status: WsStatus) => void;
  onSynced: () => void;
  onUnsyncedChanges: (count: number) => void;
}

/** Thứ `ConnectionController` cần từ provider — tách ra để test bằng bản giả, không mở WebSocket. */
export interface SessionPort {
  awareness: Awareness;
  connect: () => void;
  destroy: () => void;
  disconnect: () => void;
}

export interface PortOptions {
  doc: Y.Doc;
  documentName: string;
  handlers: PortHandlers;
  /** Gọi ở MỖI lần mở socket (kể cả nối lại) — provider dùng hàm chứ không giữ chuỗi nên token hết hạn không kẹt ở bản cũ. */
  token: () => Promise<string>;
  /** `wss://host/collab` do BE trả trong `collab-token` (⛔ không lấy từ biến môi trường của app). */
  url: string;
  user: CollabUser;
  /** Chỉ dùng cho test (mặc định `WebSocket` toàn cục của RN). */
  WebSocketPolyfill?: unknown;
}

export type PortFactory = (options: PortOptions) => SessionPort;

/**
 * `wss://host/collab` + `wb:<id>` → `wss://host/collab?doc=<id>`. `doc` chỉ là gợi ý định tuyến sticky cho nginx (provider 3.4.4 không có
 * option `parameters` nên phải nhúng vào chuỗi `url`). ⛔ Không dùng `new URL()`: `URLSearchParams` của RN chưa đủ (ném "not implemented").
 */
export function buildCollabUrl(url: string, documentName: string): string {
  const id = encodeURIComponent(documentName.slice(documentName.indexOf(':') + 1));
  return `${url}${url.includes('?') ? '&' : '?'}doc=${id}`;
}

/**
 * Bộ chuyển `@hocuspocus/provider` 3.4.4 → `SessionPort` (mẫu client ở `collab/README.md` §3.7): socket riêng + `attach()` (bắt buộc khi truyền
 * `websocketProvider`), `autoConnect: false` để bộ điều khiển quyết định lúc nối. Không chứa chính sách nối lại/dừng (việc của `connection-controller.ts`).
 *
 * Awareness: LỌC phản hồi (`installAwarenessFilter`, bắt buộc — xem file đó) rồi đặt `user` một lần. `user.id` PHẢI bằng `sub` của token,
 * `name`/`color` lấy từ `collab-token.user` — server coi id khác là giả danh và đóng kết nối.
 */
export const createHocuspocusPort: PortFactory = (options) => {
  const { handlers: h } = options;
  const socket = new HocuspocusProviderWebsocket({
    autoConnect: false,
    url: buildCollabUrl(options.url, options.documentName),
    ...(options.WebSocketPolyfill ? { WebSocketPolyfill: options.WebSocketPolyfill } : {}),
  });
  const provider = new HocuspocusProvider({
    document: options.doc,
    name: options.documentName,
    onAuthenticated: ({ scope }) => h.onAuthenticated(scope),
    onAuthenticationFailed: ({ reason }) => h.onAuthenticationFailed(reason),
    onAwarenessChange: () => h.onAwarenessChange(),
    onClose: ({ event }) => h.onClose({ code: event.code, reason: event.reason }),
    onStateless: ({ payload }) => h.onStateless(payload),
    onStatus: ({ status }) => h.onStatus(status),
    onSynced: ({ state }) => {
      if (state) h.onSynced();
    },
    onUnsyncedChanges: ({ number }) => h.onUnsyncedChanges(number),
    token: options.token,
    websocketProvider: socket,
  });
  provider.attach();
  installAwarenessFilter(provider);
  provider.setAwarenessField('user', {
    color: options.user.color,
    id: options.user.id,
    name: options.user.name,
  });

  return {
    awareness: provider.awareness as Awareness,
    connect: () => void socket.connect().catch(() => undefined),
    destroy: () => {
      provider.destroy();
      socket.destroy();
    },
    disconnect: () => socket.disconnect(),
  };
};
