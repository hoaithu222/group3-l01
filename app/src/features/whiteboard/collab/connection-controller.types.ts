import type * as Y from 'yjs';

import type { CollabUser } from '@/shared/collab';

import type { PortFactory } from './hocuspocus-port';
import type { NoticeCode, SessionFailure, SessionSnapshot } from './session-status';

/** Nơi `ConnectionController` báo ra ngoài (runtime → store zustand). */
export interface ControllerHost {
  /** `null` = hết lỗi không nghiêm trọng (đã xác thực lại). */
  onFailure: (failure: SessionFailure | null) => void;
  onNotice: (code: NoticeCode) => void;
  /** Awareness của người khác đổi (con trỏ, vào/ra). */
  onPresence: () => void;
  onSnapshot: (snapshot: SessionSnapshot) => void;
}

export interface ControllerOptions {
  /** Lỗi xin token: `forbidden` = mất quyền (404/403 → dừng hẳn), `retry` = mạng/BE tạm lỗi (thử lại có backoff). */
  classifyTokenError: (error: unknown) => 'forbidden' | 'retry';
  createPort: PortFactory;
  doc: Y.Doc;
  documentName: string;
  host: ControllerHost;
  /** Chờ đồng bộ lần đầu quá bấy lâu → báo `LOAD_FAILED` (không nghiêm trọng, vẫn thử tiếp). Mặc định 20 s. */
  loadTimeoutMs?: number;
  random?: () => number;
  tokens: { ensure: () => Promise<{ token: string }>; refresh: () => Promise<{ token: string }> };
  url: string;
  user: CollabUser;
  WebSocketPolyfill?: unknown;
}
