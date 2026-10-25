/**
 * Mock `socket.io-client` cho Jest.
 *
 * `socket.client.ts` gọi `io(...)` NGAY LÚC NẠP MODULE (thực thể dùng chung,
 * xem chú thích ở đó) — nếu không mock thì MỌI test import tới nó (trực tiếp
 * hoặc gián tiếp qua `AppProviders`) sẽ cố mở một kết nối WebSocket THẬT, và
 * Jest (chạy trong Node, không phải trên máy) không có gì để mở.
 *
 * Đặt ở `__mocks__/` gốc (ngang hàng `node_modules`) — Jest tự dùng mock này
 * cho MỌI `import ... from 'socket.io-client'` một khi `jest.mock('socket.io-client')`
 * được gọi (`jest.setup.js`).
 */
type Handler = (...args: unknown[]) => void;

const handlers = new Map<string, Set<Handler>>();

function handlersFor(event: string): Set<Handler> {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  return set;
}

export const socket = {
  connected: false,

  connect: jest.fn(() => {
    socket.connected = true;
  }),

  disconnect: jest.fn(() => {
    socket.connected = false;
  }),

  emit: jest.fn((_event: string, _payload?: unknown, ack?: (result: { ok: boolean }) => void) => {
    ack?.({ ok: true });
  }),

  on: jest.fn((event: string, handler: Handler) => {
    handlersFor(event).add(handler);
  }),

  off: jest.fn((event: string, handler: Handler) => {
    handlers.get(event)?.delete(handler);
  }),

  /** CHỈ dùng trong test: giả lập server bắn một sự kiện tới client. */
  __emitServer(event: string, payload?: unknown): void {
    handlersFor(event).forEach((handler) => handler(payload));
  },

  /** CHỈ dùng trong test: đưa mock về trạng thái sạch giữa các ca kiểm. */
  __reset(): void {
    socket.connected = false;
    handlers.clear();
    socket.connect.mockClear();
    socket.disconnect.mockClear();
    socket.emit.mockClear();
    socket.on.mockClear();
    socket.off.mockClear();
  },
};

export const io = jest.fn(() => socket);
