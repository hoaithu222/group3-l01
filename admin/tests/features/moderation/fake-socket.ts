/**
 * Socket giả DÙNG CHUNG cho các bài kiểm phân hệ `moderation`. Mỗi file test khai:
 *
 *   vi.mock('socket.io-client', async () => {
 *     const { fakeSocket } = await import('./fake-socket');
 *     return { io: vi.fn(() => fakeSocket) };
 *   });
 *
 * — nhờ vậy `@/core/socket` (thật) dùng đúng thực thể này: `room:join` được ack ngay (`ok:true`
 * hoặc giá trị `setAck` đặt), và `emitFromServer` giả lập BE bắn sự kiện xuống client.
 */
import { vi } from 'vitest';

type Handler = (...args: unknown[]) => void;
export interface FakeAck {
  code?: string;
  ok: boolean;
}

const handlers = new Map<string, Handler[]>();
let ackResponse: FakeAck = { ok: true };

export const fakeSocket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn((_event: string, _payload: unknown, ack?: (a: FakeAck) => void) => {
    ack?.(ackResponse);
  }),
  on: vi.fn((event: string, cb: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), cb]);
  }),
  off: vi.fn((event: string, cb: Handler) => {
    handlers.set(
      event,
      (handlers.get(event) ?? []).filter((h) => h !== cb),
    );
  }),
};

/** Giả lập BE bắn `event` xuống client (chạy mọi listener đang đăng ký). */
export function emitFromServer(event: string, ...args: unknown[]): void {
  (handlers.get(event) ?? []).forEach((h) => h(...args));
}

export function setAck(next: FakeAck): void {
  ackResponse = next;
}

/** Các lượt `room:join` đã gửi (payload `{ kind, id }`). */
export function joinPayloads(): unknown[] {
  return fakeSocket.emit.mock.calls.filter(([event]) => event === 'room:join').map(([, p]) => p);
}
