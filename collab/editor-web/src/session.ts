/**
 * Bộ chuyển `@hocuspocus/provider` 3.4.4 → giao diện nhỏ mà `ConnectionManager` cần (mẫu client ở `collab/README.md` §3.7):
 *  - socket riêng + `provider.attach()` (bắt buộc khi truyền `websocketProvider`), `autoConnect: false` để manager quyết định lúc nối;
 *  - URL = `${url}?doc=<resourceId>` (provider 3.4.4 không có option `parameters`; `doc` chỉ là gợi ý định tuyến sticky cho nginx);
 *  - `token` là HÀM async (gọi lại ở mỗi lần mở socket, kể cả nối lại) — không đưa token vào URL/log.
 * Không chứa chính sách (nối lại/dừng) — đó là việc của `connection.ts`; ở đây chỉ chuyển sự kiện.
 */
import { HocuspocusProvider, HocuspocusProviderWebsocket, type WebSocketStatus } from "@hocuspocus/provider";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import type { CollabUser } from "./bridge-protocol";

export type WsStatus = `${WebSocketStatus}`;
export type AuthScope = "read-write" | "readonly";

export interface SessionHandlers {
  onStatus(status: WsStatus): void;
  onAuthenticated(scope: AuthScope): void;
  onAuthenticationFailed(reason: string): void;
  /** Cả tin CLOSE trong luồng (code 1000, `reason` = lý do server) lẫn đóng socket thô (code 44xx/1009). */
  onClose(info: { code: number; reason: string }): void;
  onSynced(): void;
  onUnsyncedChanges(count: number): void;
  onStateless(payload: string): void;
  onAwarenessChange(): void;
}

/** Thứ Tiptap `CollaborationCaret` cần từ provider. */
export interface AwarenessProvider {
  awareness: Awareness;
}

export interface SessionPort {
  readonly awarenessProvider: AwarenessProvider;
  readonly unsyncedChanges: number;
  readonly synced: boolean;
  connect(): void;
  disconnect(): void;
  destroy(): void;
}

export interface SessionOptions {
  url: string;
  documentName: string;
  doc: Y.Doc;
  user: CollabUser;
  token: () => Promise<string>;
  handlers: SessionHandlers;
  /** Chỉ dùng cho test (mặc định `WebSocket` của trình duyệt). */
  WebSocketPolyfill?: unknown;
}

export type SessionFactory = (options: SessionOptions) => SessionPort;

/** `wss://host/collab` + `doc:<id>` → `wss://host/collab?doc=<id>` (giữ query sẵn có). */
export function buildCollabUrl(url: string, documentName: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("doc", documentName.slice(documentName.indexOf(":") + 1));
  return parsed.toString();
}

export const createHocuspocusSession: SessionFactory = (options) => {
  const { handlers: h } = options;
  const socket = new HocuspocusProviderWebsocket({
    url: buildCollabUrl(options.url, options.documentName),
    autoConnect: false,
    ...(options.WebSocketPolyfill ? { WebSocketPolyfill: options.WebSocketPolyfill } : {}),
  });
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: options.documentName,
    document: options.doc,
    token: options.token,
    onStatus: ({ status }) => h.onStatus(status),
    onAuthenticated: ({ scope }) => h.onAuthenticated(scope),
    onAuthenticationFailed: ({ reason }) => h.onAuthenticationFailed(reason),
    onClose: ({ event }) => h.onClose({ code: event.code, reason: event.reason }),
    onSynced: ({ state }) => {
      if (state) h.onSynced();
    },
    onUnsyncedChanges: ({ number }) => h.onUnsyncedChanges(number),
    onStateless: ({ payload }) => h.onStateless(payload),
    onAwarenessChange: () => h.onAwarenessChange(),
  });
  provider.attach();
  // Server đối chiếu `user.id` với `sub` của token và giới hạn khoá awareness (chỉ `user`, `cursor`) — README §3.3.
  provider.setAwarenessField("user", { id: options.user.id, name: options.user.name, color: options.user.color });

  return {
    awarenessProvider: provider as unknown as AwarenessProvider,
    get unsyncedChanges() {
      return provider.unsyncedChanges;
    },
    get synced() {
      return provider.synced;
    },
    connect: () => void socket.connect().catch(() => undefined),
    disconnect: () => socket.disconnect(),
    destroy: () => {
      provider.destroy();
      socket.destroy();
    },
  };
};
